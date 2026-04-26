-- =============================================================================
-- MIGRACIÓN 001 — Fase 1: estado "recibido" + tablas nuevas
-- Fecha: 2026-04-25
-- Descripción:
--   1. Cambia el DEFAULT de pedidos.estado a 'recibido'
--   2. Migra pedidos de prueba: en_curso → recibido
--   3. Agrega columna chatwoot_conversation_id a pedidos
--   4. Crea tabla escalaciones
--   5. Crea tabla restaurante_mesas
--   6. Actualiza fn_select_pedido_reutilizable (ambas firmas) para incluir
--      'recibido' como estado reutilizable (ventana modify_window_minutes)
--   7. Actualiza fn_listar_pedidos_modificables para incluir 'recibido'
--   8. Actualiza fn_resolver_pedido_referencia para incluir 'recibido'
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Cambiar DEFAULT de pedidos.estado a 'recibido'
--    (solo afecta INSERTs nuevos sin estado explícito)
-- ---------------------------------------------------------------------------
ALTER TABLE public.pedidos
  ALTER COLUMN estado SET DEFAULT 'recibido';

-- ---------------------------------------------------------------------------
-- 2. Migrar pedidos existentes en_curso → recibido
--    (datos de prueba, no productivos)
-- ---------------------------------------------------------------------------
UPDATE public.pedidos
SET estado = 'recibido'
WHERE estado = 'en_curso';

-- ---------------------------------------------------------------------------
-- 3. Columna chatwoot_conversation_id en pedidos
--    (se guardará cuando n8n reciba el evento de Chatwoot)
-- ---------------------------------------------------------------------------
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS chatwoot_conversation_id text NULL;

-- ---------------------------------------------------------------------------
-- 4. Tabla escalaciones
--    Registra cada derivación a humano activada por el agente n8n.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.escalaciones (
  id                   bigserial PRIMARY KEY,
  restaurante_id       int4 REFERENCES public.restaurante(id) ON DELETE CASCADE,
  telefono             text NOT NULL,
  problema             text NULL,
  contexto             jsonb NULL,         -- salida de Crear Contexto1
  conversation_id      text NULL,          -- Chatwoot conversation_id
  account_id           text NULL,          -- Chatwoot account_id
  contact_id           text NULL,          -- Chatwoot contact_id
  estado               text DEFAULT 'pendiente' NOT NULL,  -- pendiente | resuelto
  created_at           timestamptz DEFAULT now() NOT NULL,
  resolved_at          timestamptz NULL,
  resolved_by          text NULL           -- email del operador que resolvió
);

CREATE INDEX IF NOT EXISTS idx_escalaciones_restaurante
  ON public.escalaciones(restaurante_id);

CREATE INDEX IF NOT EXISTS idx_escalaciones_estado
  ON public.escalaciones(estado);

CREATE INDEX IF NOT EXISTS idx_escalaciones_telefono
  ON public.escalaciones(telefono);

CREATE INDEX IF NOT EXISTS idx_escalaciones_created_at
  ON public.escalaciones(created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Tabla restaurante_mesas
--    Lista configurable de mesas para tipo_despacho 'llevar_a_la_mesa'
--    (requerimiento K3 — futuro, tabla preparada ahora)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurante_mesas (
  id             bigserial PRIMARY KEY,
  restaurante_id int4 REFERENCES public.restaurante(id) ON DELETE CASCADE,
  numero         varchar(20) NOT NULL,
  descripcion    text NULL,
  is_active      bool DEFAULT true NOT NULL,
  sort_order     int4 DEFAULT 0 NOT NULL,
  created_at     timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_restaurante_mesas_restaurante
  ON public.restaurante_mesas(restaurante_id, is_active);

-- ---------------------------------------------------------------------------
-- 6a. fn_select_pedido_reutilizable (firma con bigint)
--     Añade 'recibido' al bloque de estados con ventana modify_window_minutes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(
  p_telefono   text,
  p_session_id text    DEFAULT NULL::text,
  p_pedido_id  bigint  DEFAULT NULL::bigint
)
RETURNS SETOF pedidos
LANGUAGE sql STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',   60) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
  ),
  cand AS (
    SELECT
      p.*,
      COALESCE(p.updated_at, p.created_at, NOW()) AS ref_ts,
      CASE WHEN jsonb_typeof(COALESCE(p.items,'[]'::jsonb)) = 'array'
                AND jsonb_array_length(COALESCE(p.items,'[]'::jsonb)) > 0
           THEN true ELSE false END AS has_items,
      CASE
        WHEN lower(COALESCE(p.estado,'en_curso')) IN ('en_curso','draft')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes FROM cfg))
        WHEN lower(COALESCE(p.estado,'en_curso')) IN ('pendiente_pago','confirmado','pagado','paid','recibido')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_reutilizable
    FROM public.pedidos p
    WHERE p.telefono = p_telefono
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
    CASE WHEN p_pedido_id IS NOT NULL AND c.id = p_pedido_id THEN 0 ELSE 1 END,
    CASE WHEN p_session_id IS NOT NULL AND COALESCE(c.session_id,'') = p_session_id THEN 0 ELSE 1 END,
    CASE WHEN c.has_items THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado,'en_curso')) IN ('en_curso','recibido') THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.id DESC
  LIMIT 1;
$function$;

-- ---------------------------------------------------------------------------
-- 6b. fn_select_pedido_reutilizable (firma con text + bool)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(
  p_telefono           text,
  p_session_id         text    DEFAULT NULL::text,
  p_pedido_id          text    DEFAULT NULL::text,
  p_forzar_pedido_nuevo boolean DEFAULT false
)
RETURNS TABLE(
  id                varchar, restaurante_id  integer, usuario_id      integer,
  telefono          text,    items           jsonb,   subtotal        numeric,
  tipo_despacho     text,    direccion       text,    lat             numeric,
  lng               numeric, distancia_km    numeric, tiempo_estimado text,
  costo_envio       numeric, total           numeric, metodo_pago     text,
  estado            text,    notas           text,    created_at      timestamp without time zone,
  updated_at        timestamp without time zone,      session_id      text,
  session_started_at timestamp without time zone,     pedido_numero   integer,
  pedido_codigo     text
)
LANGUAGE sql STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',   60) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
  ),
  ref AS (
    SELECT
      trim(COALESCE(p_pedido_id,'')) AS pedido_ref,
      regexp_replace(COALESCE(p_pedido_id,''), '[^0-9]','','g') AS pedido_digits
  ),
  cand AS (
    SELECT
      p.*,
      COALESCE(p.updated_at,p.created_at,NOW()) AS ref_ts,
      CASE WHEN jsonb_typeof(COALESCE(p.items,'[]'::jsonb)) = 'array'
                AND jsonb_array_length(COALESCE(p.items,'[]'::jsonb)) > 0
           THEN true ELSE false END AS has_items,
      CASE
        WHEN p_forzar_pedido_nuevo THEN false
        WHEN lower(COALESCE(p.estado,'en_curso')) IN ('en_curso','draft')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes FROM cfg))
        WHEN lower(COALESCE(p.estado,'en_curso')) IN ('pendiente_pago','confirmado','pagado','paid','recibido')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_reutilizable
    FROM public.pedidos p
    WHERE p.telefono = p_telefono
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
        OR lower(COALESCE(c.pedido_codigo,'')) = lower(ref.pedido_ref)
        OR lower(COALESCE(c.pedido_codigo,'')) LIKE lower(ref.pedido_ref) || '%'
        OR (length(ref.pedido_digits) >= 3 AND right(COALESCE(c.pedido_codigo,''), length(ref.pedido_digits)) = ref.pedido_digits)
      ) THEN 0 ELSE 1
    END,
    CASE WHEN p_session_id IS NOT NULL AND COALESCE(c.session_id,'') = p_session_id THEN 0 ELSE 1 END,
    CASE WHEN c.has_items THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado,'en_curso')) IN ('en_curso','recibido') THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.id DESC
  LIMIT 1;
$function$;

-- ---------------------------------------------------------------------------
-- 7. fn_listar_pedidos_modificables — incluir 'recibido'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_listar_pedidos_modificables(p_telefono text)
RETURNS TABLE(
  pedido_id       text, pedido_codigo text, estado text,
  tipo_despacho   text, total         numeric,
  updated_at      timestamp without time zone,
  es_modificable  boolean
)
LANGUAGE sql STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',   60) AS cart_expiry_minutes,
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
      WHEN lower(COALESCE(p.estado,'en_curso')) IN ('en_curso','draft')
        THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes FROM cfg))
      WHEN lower(COALESCE(p.estado,'en_curso')) IN ('pendiente_pago','confirmado','pagado','paid','recibido')
        THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
      ELSE false
    END AS es_modificable
  FROM public.pedidos p
  WHERE p.telefono = p_telefono
  ORDER BY COALESCE(p.updated_at,p.created_at) DESC, p.id DESC;
$function$;

-- ---------------------------------------------------------------------------
-- 8. fn_resolver_pedido_referencia — incluir 'recibido'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolver_pedido_referencia(
  p_telefono   text,
  p_referencia text
)
RETURNS TABLE(
  pedido_id       text, pedido_codigo   text, estado         text,
  tipo_despacho   text, subtotal        numeric, total        numeric,
  updated_at      timestamp without time zone,
  items           jsonb, direccion       text, tiempo_estimado text,
  metodo_pago     text, es_modificable  boolean
)
LANGUAGE sql STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',   60) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
  ),
  ref AS (
    SELECT
      trim(COALESCE(p_referencia,'')) AS r,
      regexp_replace(COALESCE(p_referencia,''), '[^0-9]','','g') AS digits
  ),
  base AS (
    SELECT
      p.id::text AS pedido_id,
      p.pedido_codigo, p.estado, p.tipo_despacho,
      p.subtotal, p.total, p.updated_at, p.items,
      p.direccion, p.tiempo_estimado, p.metodo_pago,
      CASE
        WHEN lower(COALESCE(p.estado,'en_curso')) IN ('en_curso','draft')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes FROM cfg))
        WHEN lower(COALESCE(p.estado,'en_curso')) IN ('pendiente_pago','confirmado','pagado','paid','recibido')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_modificable
    FROM public.pedidos p
    WHERE p.telefono = p_telefono
  )
  SELECT
    b.pedido_id, b.pedido_codigo, b.estado, b.tipo_despacho,
    b.subtotal, b.total, b.updated_at, b.items,
    b.direccion, b.tiempo_estimado, b.metodo_pago, b.es_modificable
  FROM base b
  CROSS JOIN ref
  WHERE
    lower(COALESCE(b.pedido_codigo,'')) = lower(ref.r)
    OR lower(COALESCE(b.pedido_codigo,'')) LIKE lower(ref.r) || '%'
    OR b.pedido_id = ref.r
    OR (length(ref.digits) >= 3 AND right(COALESCE(b.pedido_codigo,''), length(ref.digits)) = ref.digits)
  ORDER BY
    CASE WHEN lower(COALESCE(b.pedido_codigo,'')) = lower(ref.r) THEN 0 ELSE 1 END,
    CASE WHEN b.pedido_id = ref.r THEN 0 ELSE 1 END,
    CASE WHEN length(ref.digits) >= 3 AND right(COALESCE(b.pedido_codigo,''), length(ref.digits)) = ref.digits THEN 0 ELSE 1 END,
    COALESCE(b.updated_at, NOW()) DESC,
    b.pedido_id DESC
  LIMIT 1;
$function$;

COMMIT;

-- =============================================================================
-- INSTRUCCIONES DE EJECUCIÓN
-- Conectarse a la BD restaurante_mvp y ejecutar este archivo completo.
-- Verificar con:
--   SELECT column_default FROM information_schema.columns
--   WHERE table_name='pedidos' AND column_name='estado';
--   -- Debe retornar: 'recibido'
--
--   SELECT COUNT(*) FROM escalaciones;      -- debe existir
--   SELECT COUNT(*) FROM restaurante_mesas; -- debe existir
-- =============================================================================
