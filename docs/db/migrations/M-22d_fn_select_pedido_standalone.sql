-- ──────────────────────────────────────────────────────────────────────────────
-- M-22d: Script autocontenido para las 3 funciones que fallaban
-- Incluye fn_get_rest_config_int (prerequisito) + los 2 overloads de
-- fn_select_pedido_reutilizable con p_restaurante_id.
--
-- Usar solo si M-22_complete.sql completo no se puede aplicar de una vez.
-- Si M-22_complete.sql funciona, este script es redundante.
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Prerequisito: fn_get_rest_config_int (3 params) ──────────────────────────

CREATE OR REPLACE FUNCTION public.fn_get_rest_config_int(
  p_key            text,
  p_default        integer,
  p_restaurante_id integer DEFAULT 1
)
RETURNS integer
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(
    (
      SELECT NULLIF(trim(config_value), '')::int
      FROM   public.restaurante_config
      WHERE  config_key     = p_key
        AND  restaurante_id = p_restaurante_id
    ),
    p_default
  )
$function$;


-- ── fn_select_pedido_reutilizable (text, text, bigint, integer) ───────────────
-- RETURNS TABLE(7 cols) — no SETOF pedidos para evitar conflicto con
-- columnas extra agregadas por migraciones posteriores al DDL base.

CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(
  p_telefono       text,
  p_session_id     text    DEFAULT NULL::text,
  p_pedido_id      bigint  DEFAULT NULL::bigint,
  p_restaurante_id integer DEFAULT 1
)
RETURNS TABLE(
  pedido_id      text,
  pedido_codigo  text,
  estado         text,
  tipo_despacho  text,
  total          numeric,
  updated_at     timestamp without time zone,
  es_modificable boolean
)
LANGUAGE sql
STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes'::text,  60, p_restaurante_id) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes'::text, 30, p_restaurante_id) AS modify_window_minutes
  ),
  cand AS (
    SELECT
      p.id::text AS pedido_id,
      p.pedido_codigo,
      p.estado,
      p.tipo_despacho,
      p.total,
      p.updated_at,
      COALESCE(p.updated_at, p.created_at, NOW()) AS ref_ts,
      CASE WHEN jsonb_typeof(COALESCE(p.items, '[]'::jsonb)) = 'array'
                AND jsonb_array_length(COALESCE(p.items, '[]'::jsonb)) > 0
           THEN true ELSE false END AS has_items,
      CASE
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('en_curso', 'draft', 'recibido')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('pendiente_pago', 'confirmado', 'en_preparacion', 'pagado', 'paid')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_reutilizable
    FROM public.pedidos p
    WHERE p.telefono       = p_telefono
      AND p.restaurante_id = p_restaurante_id
  )
  SELECT
    c.pedido_id,
    c.pedido_codigo,
    c.estado,
    c.tipo_despacho,
    c.total,
    c.updated_at,
    c.es_reutilizable AS es_modificable
  FROM cand c
  WHERE c.es_reutilizable
    AND (p_pedido_id IS NULL OR c.pedido_id = p_pedido_id::text)
    AND (p_session_id IS NULL OR EXISTS(
          SELECT 1 FROM public.pedidos p2
          WHERE p2.id::text = c.pedido_id AND p2.session_id = p_session_id
        ))
  ORDER BY
    CASE WHEN p_session_id IS NOT NULL AND EXISTS(
           SELECT 1 FROM public.pedidos p2
           WHERE p2.id::text = c.pedido_id AND p2.session_id = p_session_id
         ) THEN 0 ELSE 1 END,
    CASE WHEN c.has_items THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado, 'recibido')) IN ('en_curso', 'recibido') THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.pedido_id DESC
  LIMIT 1
$function$;


-- ── fn_select_pedido_reutilizable (text, text, text, boolean, integer) ─────────

CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(
  p_telefono            text,
  p_session_id          text    DEFAULT NULL::text,
  p_pedido_id           text    DEFAULT NULL::text,
  p_forzar_pedido_nuevo boolean DEFAULT false,
  p_restaurante_id      integer DEFAULT 1
)
RETURNS TABLE(
  id                 character varying,
  restaurante_id     integer,
  usuario_id         integer,
  telefono           text,
  items              jsonb,
  subtotal           numeric,
  tipo_despacho      text,
  direccion          text,
  lat                numeric,
  lng                numeric,
  distancia_km       numeric,
  tiempo_estimado    text,
  costo_envio        numeric,
  total              numeric,
  metodo_pago        text,
  estado             text,
  notas              text,
  created_at         timestamp without time zone,
  updated_at         timestamp without time zone,
  session_id         text,
  session_started_at timestamp without time zone,
  pedido_numero      integer,
  pedido_codigo      text
)
LANGUAGE sql
STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes'::text,  60, p_restaurante_id) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes'::text, 30, p_restaurante_id) AS modify_window_minutes
  ),
  ref AS (
    SELECT
      trim(COALESCE(p_pedido_id, ''))                                       AS pedido_ref,
      regexp_replace(COALESCE(p_pedido_id, ''), '[^0-9]', '', 'g')         AS pedido_digits
  ),
  cand AS (
    SELECT
      p.id,
      p.restaurante_id,
      p.usuario_id,
      p.telefono,
      p.items,
      p.subtotal,
      p.tipo_despacho,
      p.direccion,
      p.lat,
      p.lng,
      p.distancia_km,
      p.tiempo_estimado,
      p.costo_envio,
      p.total,
      p.metodo_pago,
      p.estado,
      p.notas,
      p.created_at,
      p.updated_at,
      p.session_id,
      p.session_started_at,
      p.pedido_numero,
      p.pedido_codigo,
      COALESCE(p.updated_at, p.created_at, NOW()) AS ref_ts,
      CASE WHEN jsonb_typeof(COALESCE(p.items, '[]'::jsonb)) = 'array'
                AND jsonb_array_length(COALESCE(p.items, '[]'::jsonb)) > 0
           THEN true ELSE false END AS has_items,
      CASE
        WHEN p_forzar_pedido_nuevo THEN false
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('en_curso', 'draft', 'recibido')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('pendiente_pago', 'confirmado', 'en_preparacion', 'pagado', 'paid')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_reutilizable
    FROM public.pedidos p
    WHERE p.telefono       = p_telefono
      AND p.restaurante_id = p_restaurante_id
  )
  SELECT
    c.id::varchar,
    c.restaurante_id,
    c.usuario_id,
    c.telefono,
    c.items,
    c.subtotal,
    c.tipo_despacho,
    c.direccion,
    c.lat,
    c.lng,
    c.distancia_km,
    c.tiempo_estimado,
    c.costo_envio,
    c.total,
    c.metodo_pago,
    c.estado,
    c.notas,
    c.created_at,
    c.updated_at,
    c.session_id,
    c.session_started_at,
    c.pedido_numero,
    c.pedido_codigo
  FROM cand c
  CROSS JOIN ref
  WHERE c.es_reutilizable
  ORDER BY
    CASE
      WHEN ref.pedido_ref <> '' AND (
        c.id::text = ref.pedido_ref
        OR lower(COALESCE(c.pedido_codigo, '')) = lower(ref.pedido_ref)
        OR lower(COALESCE(c.pedido_codigo, '')) LIKE lower(ref.pedido_ref) || '%'
        OR (length(ref.pedido_digits) >= 3 AND right(COALESCE(c.pedido_codigo, ''), length(ref.pedido_digits)) = ref.pedido_digits)
      ) THEN 0 ELSE 1
    END,
    CASE WHEN p_session_id IS NOT NULL AND COALESCE(c.session_id, '') = p_session_id THEN 0 ELSE 1 END,
    CASE WHEN c.has_items  THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado, 'recibido')) IN ('en_curso', 'recibido') THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.id DESC
  LIMIT 1
$function$;

COMMIT;

-- ── Verificación ──────────────────────────────────────────────────────────────
-- SELECT public.fn_get_rest_config_int('cart_expiry_minutes'::text, 60, 1);
-- SELECT proname, pg_get_function_arguments(oid)
--   FROM pg_proc WHERE pronamespace='public'::regnamespace
--   AND proname = 'fn_select_pedido_reutilizable'
--   ORDER BY proname, pg_get_function_arguments(oid);
