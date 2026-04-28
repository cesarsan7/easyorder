-- =============================================================================
-- Migración 003 — Fase 3 pre-requisito
-- Agrega 'recibido' y 'en_preparacion' al CASE de es_reutilizable/es_modificable
-- en las 4 funciones que aplican las reglas de cart_expiry y modify_window.
--
-- Problema original:
--   Los estados 'recibido' (nuevo estado inicial desde Fase 1) y 'en_preparacion'
--   caían en ELSE → false, lo que hacía que fn_select_pedido_reutilizable no
--   devolviera esos pedidos. Resultado: el agente creaba pedidos duplicados en
--   lugar de continuar el pedido activo del cliente.
--
-- Lógica correcta:
--   'recibido'       → aplica cart_expiry_minutes  (equivale a 'en_curso')
--   'en_preparacion' → aplica modify_window_minutes (equivale a 'confirmado')
-- =============================================================================

-- ----------------------------------------------------------------------------
-- DROP primero para evitar "cannot change return type of existing function"
-- Se hace CASCADE para que fn_resolver_pedido_modificable (que depende de
-- fn_resolver_pedido_referencia) no bloquee el DROP.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_listar_pedidos_modificables(text) CASCADE;
DROP FUNCTION IF EXISTS public.fn_resolver_pedido_referencia(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.fn_select_pedido_reutilizable(text, text, bigint) CASCADE;
DROP FUNCTION IF EXISTS public.fn_select_pedido_reutilizable(text, text, text, boolean) CASCADE;

-- ----------------------------------------------------------------------------
-- 1. fn_listar_pedidos_modificables
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_listar_pedidos_modificables(p_telefono text)
RETURNS TABLE(
  pedido_id    text,
  pedido_codigo text,
  estado       text,
  tipo_despacho text,
  total        numeric,
  updated_at   timestamp without time zone,
  es_modificable boolean
)
LANGUAGE sql
STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',  60) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
  )
  SELECT
    p.id::text AS pedido_id,
    p.pedido_codigo,
    p.estado,
    p.tipo_despacho,
    p.total,
    p.updated_at,
    CASE
      WHEN lower(COALESCE(p.estado, 'recibido')) IN ('en_curso', 'draft', 'recibido')
        THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
      WHEN lower(COALESCE(p.estado, 'recibido')) IN ('pendiente_pago', 'confirmado', 'en_preparacion', 'pagado', 'paid')
        THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
      ELSE false
    END AS es_modificable
  FROM public.pedidos p
  WHERE p.telefono = p_telefono
  ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.id DESC;
$function$;

-- ----------------------------------------------------------------------------
-- 2. fn_resolver_pedido_referencia
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolver_pedido_referencia(p_telefono text, p_referencia text)
RETURNS TABLE(
  pedido_id     text,
  pedido_codigo text,
  estado        text,
  tipo_despacho text,
  subtotal      numeric,
  total         numeric,
  updated_at    timestamp without time zone,
  items         jsonb,
  direccion     text,
  tiempo_estimado text,
  metodo_pago   text,
  es_modificable boolean
)
LANGUAGE sql
STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',  60) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
  ),
  ref AS (
    SELECT
      trim(COALESCE(p_referencia, '')) AS r,
      regexp_replace(COALESCE(p_referencia, ''), '[^0-9]', '', 'g') AS digits
  ),
  base AS (
    SELECT
      p.id::text AS pedido_id,
      p.pedido_codigo,
      p.estado,
      p.tipo_despacho,
      p.subtotal,
      p.total,
      p.updated_at,
      p.items,
      p.direccion,
      p.tiempo_estimado,
      p.metodo_pago,
      CASE
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('en_curso', 'draft', 'recibido')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('pendiente_pago', 'confirmado', 'en_preparacion', 'pagado', 'paid')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_modificable
    FROM public.pedidos p
    WHERE p.telefono = p_telefono
  )
  SELECT
    b.pedido_id,
    b.pedido_codigo,
    b.estado,
    b.tipo_despacho,
    b.subtotal,
    b.total,
    b.updated_at,
    b.items,
    b.direccion,
    b.tiempo_estimado,
    b.metodo_pago,
    b.es_modificable
  FROM base b
  CROSS JOIN ref
  WHERE
    lower(COALESCE(b.pedido_codigo, '')) = lower(ref.r)
    OR lower(COALESCE(b.pedido_codigo, '')) LIKE lower(ref.r) || '%'
    OR b.pedido_id = ref.r
    OR (length(ref.digits) >= 3 AND right(COALESCE(b.pedido_codigo, ''), length(ref.digits)) = ref.digits)
  ORDER BY
    CASE WHEN lower(COALESCE(b.pedido_codigo, '')) = lower(ref.r) THEN 0 ELSE 1 END,
    CASE WHEN b.pedido_id = ref.r THEN 0 ELSE 1 END,
    CASE WHEN length(ref.digits) >= 3 AND right(COALESCE(b.pedido_codigo, ''), length(ref.digits)) = ref.digits THEN 0 ELSE 1 END,
    COALESCE(b.updated_at, NOW()) DESC,
    b.pedido_id DESC
  LIMIT 1;
$function$;

-- ----------------------------------------------------------------------------
-- 3. fn_select_pedido_reutilizable — overload bigint (usado internamente)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(
  p_telefono   text,
  p_session_id text    DEFAULT NULL::text,
  p_pedido_id  bigint  DEFAULT NULL::bigint
)
RETURNS TABLE(
  pedido_id    text,
  pedido_codigo text,
  estado       text,
  tipo_despacho text,
  total        numeric,
  updated_at   timestamp without time zone,
  es_modificable boolean
)
LANGUAGE sql
STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',  60) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
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
      CASE WHEN jsonb_typeof(COALESCE(p.items,'[]'::jsonb)) = 'array'
                AND jsonb_array_length(COALESCE(p.items,'[]'::jsonb)) > 0
           THEN true ELSE false END AS has_items,
      CASE
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('en_curso', 'draft', 'recibido')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('pendiente_pago', 'confirmado', 'en_preparacion', 'pagado', 'paid')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_reutilizable
    FROM public.pedidos p
    WHERE p.telefono = p_telefono
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
    AND (p_session_id IS NULL OR c.pedido_id IN (
          SELECT id::text FROM public.pedidos WHERE session_id = p_session_id
        ))
  ORDER BY
    CASE WHEN p_session_id IS NOT NULL AND EXISTS(
           SELECT 1 FROM public.pedidos WHERE id::text = c.pedido_id AND session_id = p_session_id
         ) THEN 0 ELSE 1 END,
    CASE WHEN c.has_items THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.pedido_id DESC
  LIMIT 1;
$function$;

-- ----------------------------------------------------------------------------
-- 4. fn_select_pedido_reutilizable — overload text/bool (usado por Apertura n8n)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(
  p_telefono           text,
  p_session_id         text    DEFAULT NULL::text,
  p_pedido_id          text    DEFAULT NULL::text,
  p_forzar_pedido_nuevo boolean DEFAULT false
)
RETURNS TABLE(
  id                  character varying,
  restaurante_id      integer,
  usuario_id          integer,
  telefono            text,
  items               jsonb,
  subtotal            numeric,
  tipo_despacho       text,
  direccion           text,
  lat                 numeric,
  lng                 numeric,
  distancia_km        numeric,
  tiempo_estimado     text,
  costo_envio         numeric,
  total               numeric,
  metodo_pago         text,
  estado              text,
  notas               text,
  created_at          timestamp without time zone,
  updated_at          timestamp without time zone,
  session_id          text,
  session_started_at  timestamp without time zone,
  pedido_numero       integer,
  pedido_codigo       text
)
LANGUAGE sql
STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',  60) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
  ),
  ref AS (
    SELECT
      trim(COALESCE(p_pedido_id, ''))                                      AS pedido_ref,
      regexp_replace(COALESCE(p_pedido_id, ''), '[^0-9]', '', 'g')        AS pedido_digits
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
    WHERE p.telefono = p_telefono
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
      ) THEN 0
      ELSE 1
    END,
    CASE WHEN p_session_id IS NOT NULL AND COALESCE(c.session_id, '') = p_session_id THEN 0 ELSE 1 END,
    CASE WHEN c.has_items THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado, 'recibido')) = 'recibido' THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.id DESC
  LIMIT 1;
$function$;

-- ----------------------------------------------------------------------------
-- 5. fn_resolver_pedido_modificable
-- Eliminada por CASCADE al hacer DROP de fn_resolver_pedido_referencia.
-- Se recrea aquí tal cual estaba en el DDL original.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolver_pedido_modificable(p_telefono text, p_referencia text)
RETURNS TABLE(
  pedido_id     text,
  pedido_codigo text,
  estado        text,
  tipo_despacho text,
  total         numeric,
  updated_at    timestamp without time zone,
  es_modificable boolean
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    r.pedido_id,
    r.pedido_codigo,
    r.estado,
    r.tipo_despacho,
    r.total,
    r.updated_at,
    r.es_modificable
  FROM public.fn_resolver_pedido_referencia(p_telefono, p_referencia) r
  WHERE r.es_modificable
  LIMIT 1;
$function$;

-- ----------------------------------------------------------------------------
-- Verificación rápida post-migración
-- Debe retornar 'recibido' y 'en_preparacion' para cada función.
-- Ejecutar manualmente para confirmar:
--
-- SELECT unnest(ARRAY['recibido','en_preparacion','en_curso','confirmado','listo','entregado']) AS estado,
--        CASE
--          WHEN lower(estado) IN ('en_curso','draft','recibido')          THEN 'cart_expiry'
--          WHEN lower(estado) IN ('pendiente_pago','confirmado','en_preparacion','pagado','paid') THEN 'modify_window'
--          ELSE 'bloqueado'
--        END AS aplica_regla;
-- ----------------------------------------------------------------------------
