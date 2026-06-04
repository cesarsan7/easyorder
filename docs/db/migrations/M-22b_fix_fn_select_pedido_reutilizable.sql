-- ──────────────────────────────────────────────────────────────────────────────
-- M-22b: Fix fn_select_pedido_reutilizable (ambigüedad de tipos)
--
-- Problema: en SQL functions, los literales de string se infieren como 'unknown'
-- en lugar de 'text'. PostgreSQL no puede resolver la sobrecarga de
-- fn_get_rest_config_int cuando el primer argumento es 'unknown'.
-- Fix: añadir ::text explícito en las llamadas dentro de la CTE cfg.
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 9 (corregida). fn_select_pedido_reutilizable (bigint) ────────────────────

CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(
  p_telefono       text,
  p_session_id     text    DEFAULT NULL::text,
  p_pedido_id      bigint  DEFAULT NULL::bigint,
  p_restaurante_id integer DEFAULT 1
)
RETURNS SETOF pedidos
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
      p.*,
      COALESCE(p.updated_at, p.created_at, NOW()) AS ref_ts,
      CASE
        WHEN jsonb_typeof(COALESCE(p.items, '[]'::jsonb)) = 'array'
         AND jsonb_array_length(COALESCE(p.items, '[]'::jsonb)) > 0
        THEN true ELSE false
      END AS has_items,
      CASE
        WHEN lower(COALESCE(p.estado, 'en_curso')) IN ('en_curso', 'draft')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado, 'en_curso')) IN ('pendiente_pago', 'confirmado', 'pagado', 'paid')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_reutilizable
    FROM public.pedidos p
    WHERE p.telefono       = p_telefono
      AND p.restaurante_id = p_restaurante_id
  )
  SELECT
    c.id, c.restaurante_id, c.usuario_id, c.telefono, c.items,
    c.subtotal, c.tipo_despacho, c.direccion, c.lat, c.lng,
    c.distancia_km, c.tiempo_estimado, c.costo_envio, c.total,
    c.metodo_pago, c.estado, c.notas, c.created_at, c.updated_at,
    c.session_id, c.session_started_at, c.pedido_numero, c.pedido_codigo
  FROM cand c
  WHERE c.es_reutilizable
  ORDER BY
    CASE WHEN p_pedido_id  IS NOT NULL AND c.id              = p_pedido_id  THEN 0 ELSE 1 END,
    CASE WHEN p_session_id IS NOT NULL AND COALESCE(c.session_id, '') = p_session_id THEN 0 ELSE 1 END,
    CASE WHEN c.has_items THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado, 'en_curso')) = 'en_curso' THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.id DESC
  LIMIT 1
$function$;


-- ── 10 (corregida). fn_select_pedido_reutilizable (text + forzar_nuevo) ───────

CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(
  p_telefono            text,
  p_session_id          text    DEFAULT NULL::text,
  p_pedido_id           text    DEFAULT NULL::text,
  p_forzar_pedido_nuevo boolean DEFAULT false,
  p_restaurante_id      integer DEFAULT 1
)
RETURNS TABLE(
  id                   character varying,
  restaurante_id       integer,
  usuario_id           integer,
  telefono             text,
  items                jsonb,
  subtotal             numeric,
  tipo_despacho        text,
  direccion            text,
  lat                  numeric,
  lng                  numeric,
  distancia_km         numeric,
  tiempo_estimado      text,
  costo_envio          numeric,
  total                numeric,
  metodo_pago          text,
  estado               text,
  notas                text,
  created_at           timestamp without time zone,
  updated_at           timestamp without time zone,
  session_id           text,
  session_started_at   timestamp without time zone,
  pedido_numero        integer,
  pedido_codigo        text
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
      trim(COALESCE(p_pedido_id, ''))                                          AS pedido_ref,
      regexp_replace(COALESCE(p_pedido_id, ''), '[^0-9]', '', 'g')            AS pedido_digits
  ),
  cand AS (
    SELECT
      p.*,
      COALESCE(p.updated_at, p.created_at, NOW()) AS ref_ts,
      CASE
        WHEN jsonb_typeof(COALESCE(p.items, '[]'::jsonb)) = 'array'
         AND jsonb_array_length(COALESCE(p.items, '[]'::jsonb)) > 0
        THEN true ELSE false
      END AS has_items,
      CASE
        WHEN p_forzar_pedido_nuevo THEN false
        WHEN lower(COALESCE(p.estado, 'en_curso')) IN ('en_curso', 'draft')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado, 'en_curso')) IN ('pendiente_pago', 'confirmado', 'pagado', 'paid')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_reutilizable
    FROM public.pedidos p
    WHERE p.telefono       = p_telefono
      AND p.restaurante_id = p_restaurante_id
  )
  SELECT
    c.id::varchar, c.restaurante_id, c.usuario_id, c.telefono, c.items,
    c.subtotal, c.tipo_despacho, c.direccion, c.lat, c.lng,
    c.distancia_km, c.tiempo_estimado, c.costo_envio, c.total,
    c.metodo_pago, c.estado, c.notas, c.created_at, c.updated_at,
    c.session_id, c.session_started_at, c.pedido_numero, c.pedido_codigo
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
    CASE WHEN lower(COALESCE(c.estado, 'en_curso')) = 'en_curso' THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.id DESC
  LIMIT 1
$function$;

COMMIT;
