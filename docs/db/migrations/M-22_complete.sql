-- ──────────────────────────────────────────────────────────────────────────────
-- M-22_complete: Versión corregida y completa de M-22 + M-22b
-- Reemplaza M-22 y M-22b — aplicar SOLO este archivo.
--
-- Fixes aplicados:
--   A. ::text explícito en literales pasados a fn_get_rest_config_int
--      (evita ambigüedad de tipo unknown en overloads)
--   B. Script 9: RETURNS TABLE(7 cols) en lugar de SETOF pedidos
--      (pedidos tiene más columnas de las que el DDL base muestra)
--   C. Scripts 2, 7, 8, 9, 10: añadir recibido/en_preparacion a estados reutilizables
--      (alineado con migración 003)
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. fn_get_rest_config_int ─────────────────────────────────────────────────

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


-- ── 2. fn_listar_pedidos_modificables ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_listar_pedidos_modificables(
  p_telefono       text,
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
  )
  SELECT
    p.id::text,
    p.pedido_codigo,
    p.estado,
    p.tipo_despacho,
    p.total,
    p.updated_at,
    CASE
      WHEN lower(COALESCE(p.estado,'recibido')) IN ('en_curso','draft','recibido')
        THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
      WHEN lower(COALESCE(p.estado,'recibido')) IN ('pendiente_pago','confirmado','en_preparacion','pagado','paid')
        THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
      ELSE false
    END AS es_modificable
  FROM public.pedidos p
  WHERE p.telefono       = p_telefono
    AND p.restaurante_id = p_restaurante_id
  ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.id DESC
$function$;


-- ── 3. fn_menu_catalog ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_menu_catalog(
  p_restaurante_id integer DEFAULT 1
)
RETURNS TABLE(
  categoria          text,
  producto           text,
  descripcion        text,
  variante           text,
  precio             numeric,
  extras_disponibles text,
  disponible         boolean,
  tags               text,
  is_pizza           boolean,
  producto_display   text
)
LANGUAGE sql
STABLE
AS $function$
  WITH extras AS (
    SELECT
      mie.menu_item_id,
      string_agg(
        e.name ||
        CASE
          WHEN COALESCE(e.price, 0) > 0
            THEN ' (' || replace(to_char(e.price, 'FM999999990.00'), '.', ',') || '€)'
          ELSE ''
        END,
        ', ' ORDER BY e.name
      ) AS extras_disponibles
    FROM public.menu_item_extra mie
    JOIN public.extra e ON e.extra_id = mie.extra_id
    WHERE COALESCE(e.is_active, true)
    GROUP BY mie.menu_item_id
  )
  SELECT
    mc.name::text        AS categoria,
    mi.name::text        AS producto,
    mi.description::text AS descripcion,
    mv.variant_name::text AS variante,
    mv.price::numeric    AS precio,
    ex.extras_disponibles::text,
    (
      COALESCE(mc.is_active, true)
      AND COALESCE(mi.is_active, true)
      AND COALESCE(mv.is_active, true)
    )                    AS disponible,
    mi.tags::text        AS tags,
    COALESCE(mi.is_pizza, false) AS is_pizza,
    CASE
      WHEN mv.variant_name IS NULL OR btrim(mv.variant_name) = ''
        THEN mi.name::text
      ELSE mi.name::text || ' - ' || mv.variant_name::text
    END                  AS producto_display
  FROM public.menu_item mi
  JOIN public.menu_category mc
    ON mc.menu_category_id = mi.menu_category_id
   AND mc.restaurante_id   = p_restaurante_id
  LEFT JOIN public.menu_variant mv
    ON mv.menu_item_id = mi.menu_item_id
  LEFT JOIN extras ex
    ON ex.menu_item_id = mi.menu_item_id
  WHERE mc.restaurante_id = p_restaurante_id
    AND COALESCE(mc.is_active, true)
    AND COALESCE(mi.is_active, true)
    AND (mv.menu_variant_id IS NULL OR COALESCE(mv.is_active, true))
$function$;


-- ── 4. fn_menu_lookup ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_menu_lookup(
  p_search         text    DEFAULT NULL::text,
  p_restaurante_id integer DEFAULT 1
)
RETURNS TABLE(
  categoria          text,
  producto           text,
  descripcion        text,
  variante           text,
  precio             numeric,
  extras_disponibles text,
  disponible         boolean,
  tags               text,
  is_pizza           boolean,
  producto_display   text
)
LANGUAGE sql
STABLE
AS $function$
  SELECT *
  FROM public.fn_menu_catalog(p_restaurante_id) c
  WHERE p_search IS NULL
     OR p_search = ''
     OR lower(unaccent(COALESCE(c.categoria,'')))          LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.producto,'')))           LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.variante,'')))           LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.producto_display,'')))   LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.extras_disponibles,''))) LIKE '%' || lower(unaccent(p_search)) || '%'
  ORDER BY c.categoria, c.producto, c.precio
$function$;


-- ── 5. fn_next_pedido_numero ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_next_pedido_numero(
  p_restaurante_id integer DEFAULT 1
)
RETURNS integer
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(MAX(pedido_numero), 0) + 1
  FROM   public.pedidos
  WHERE  restaurante_id = p_restaurante_id
$function$;


-- ── 6. fn_next_pedido_codigo ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_next_pedido_codigo(
  p_fecha          date    DEFAULT CURRENT_DATE,
  p_restaurante_id integer DEFAULT 1
)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  prefijo   text := to_char(p_fecha, 'YYMMDD');
  siguiente int;
BEGIN
  SELECT COALESCE(MAX(RIGHT(pedido_codigo, 4)::int), 1000) + 1
    INTO siguiente
  FROM public.pedidos
  WHERE pedido_codigo  ~ ('^' || prefijo || '-[0-9]{4}$')
    AND restaurante_id = p_restaurante_id;

  RETURN prefijo || '-' || LPAD(siguiente::text, 4, '0');
END;
$function$;


-- ── 7. fn_resolver_pedido_referencia ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_resolver_pedido_referencia(
  p_telefono       text,
  p_referencia     text,
  p_restaurante_id integer DEFAULT 1
)
RETURNS TABLE(
  pedido_id       text,
  pedido_codigo   text,
  estado          text,
  tipo_despacho   text,
  subtotal        numeric,
  total           numeric,
  updated_at      timestamp without time zone,
  items           jsonb,
  direccion       text,
  tiempo_estimado text,
  metodo_pago     text,
  es_modificable  boolean
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
      trim(COALESCE(p_referencia, ''))                                        AS r,
      regexp_replace(COALESCE(p_referencia, ''), '[^0-9]', '', 'g')          AS digits
  ),
  base AS (
    SELECT
      p.id::text AS pedido_id,
      p.pedido_codigo, p.estado, p.tipo_despacho,
      p.subtotal, p.total, p.updated_at, p.items,
      p.direccion, p.tiempo_estimado, p.metodo_pago,
      CASE
        WHEN lower(COALESCE(p.estado,'recibido')) IN ('en_curso','draft','recibido')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado,'recibido')) IN ('pendiente_pago','confirmado','en_preparacion','pagado','paid')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_modificable
    FROM public.pedidos p
    WHERE p.telefono       = p_telefono
      AND p.restaurante_id = p_restaurante_id
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
    CASE WHEN lower(COALESCE(b.pedido_codigo,'')) = lower(ref.r)           THEN 0 ELSE 1 END,
    CASE WHEN b.pedido_id = ref.r                                           THEN 0 ELSE 1 END,
    CASE WHEN length(ref.digits)>=3 AND right(COALESCE(b.pedido_codigo,''),length(ref.digits))=ref.digits THEN 0 ELSE 1 END,
    COALESCE(b.updated_at, NOW()) DESC,
    b.pedido_id DESC
  LIMIT 1
$function$;


-- ── 8. fn_resolver_pedido_modificable ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_resolver_pedido_modificable(
  p_telefono       text,
  p_referencia     text,
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
  SELECT r.pedido_id, r.pedido_codigo, r.estado, r.tipo_despacho,
         r.total, r.updated_at, r.es_modificable
  FROM public.fn_resolver_pedido_referencia(p_telefono, p_referencia, p_restaurante_id) r
  WHERE r.es_modificable
  LIMIT 1
$function$;


-- ── 9. fn_select_pedido_reutilizable (bigint + restaurante_id) ───────────────
--
-- Fix B: RETURNS TABLE(7 cols) en lugar de SETOF pedidos.
-- La tabla pedidos tiene columnas extra (chatwoot_conversation_id, postal_code,
-- cart_warned_at, etc.) que SETOF pedidos exigiría devolver todas.
-- La migración 003 ya cambió el overload (text,text,bigint) a RETURNS TABLE(7 cols).
-- Este nuevo overload de 4 parámetros usa el mismo patrón.

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
      CASE WHEN jsonb_typeof(COALESCE(p.items,'[]'::jsonb))='array'
                AND jsonb_array_length(COALESCE(p.items,'[]'::jsonb))>0
           THEN true ELSE false END AS has_items,
      CASE
        WHEN lower(COALESCE(p.estado,'recibido')) IN ('en_curso','draft','recibido')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado,'recibido')) IN ('pendiente_pago','confirmado','en_preparacion','pagado','paid')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
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
    CASE WHEN lower(COALESCE(c.estado,'recibido')) IN ('en_curso','recibido') THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.pedido_id DESC
  LIMIT 1
$function$;


-- ── 10. fn_select_pedido_reutilizable (text + forzar_nuevo + restaurante_id) ──

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
      trim(COALESCE(p_pedido_id,''))                                          AS pedido_ref,
      regexp_replace(COALESCE(p_pedido_id,''), '[^0-9]', '', 'g')            AS pedido_digits
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
      CASE WHEN jsonb_typeof(COALESCE(p.items,'[]'::jsonb))='array'
                AND jsonb_array_length(COALESCE(p.items,'[]'::jsonb))>0
           THEN true ELSE false END AS has_items,
      CASE
        WHEN p_forzar_pedido_nuevo THEN false
        WHEN lower(COALESCE(p.estado,'recibido')) IN ('en_curso','draft','recibido')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado,'recibido')) IN ('pendiente_pago','confirmado','en_preparacion','pagado','paid')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
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
        OR lower(COALESCE(c.pedido_codigo,'')) = lower(ref.pedido_ref)
        OR lower(COALESCE(c.pedido_codigo,'')) LIKE lower(ref.pedido_ref) || '%'
        OR (length(ref.pedido_digits)>=3 AND right(COALESCE(c.pedido_codigo,''),length(ref.pedido_digits))=ref.pedido_digits)
      ) THEN 0 ELSE 1
    END,
    CASE WHEN p_session_id IS NOT NULL AND COALESCE(c.session_id,'')=p_session_id THEN 0 ELSE 1 END,
    CASE WHEN c.has_items  THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado,'recibido')) IN ('en_curso','recibido') THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.id DESC
  LIMIT 1
$function$;


-- ── 11. fn_upsert_usuario_perfil ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_upsert_usuario_perfil(
  p_telefono       text,
  p_nombre         text    DEFAULT NULL::text,
  p_direccion      text    DEFAULT NULL::text,
  p_tipo_despacho  text    DEFAULT NULL::text,
  p_restaurante_id integer DEFAULT 1
)
RETURNS TABLE(
  id                  integer,
  telefono            text,
  nombre              text,
  direccion_frecuente text,
  updated_name        boolean,
  updated_address     boolean
)
LANGUAGE sql
AS $function$
WITH prev AS (
  SELECT u.id, u.telefono, u.nombre, u.direccion_frecuente
  FROM   public.usuarios u
  WHERE  u.telefono       = p_telefono
    AND  u.restaurante_id = p_restaurante_id
  LIMIT 1
),
upserted AS (
  INSERT INTO public.usuarios (
    restaurante_id, telefono, nombre, direccion_frecuente, created_at, updated_at
  )
  VALUES (
    p_restaurante_id,
    p_telefono,
    NULLIF(btrim(p_nombre), ''),
    CASE
      WHEN lower(COALESCE(p_tipo_despacho,'')) IN ('delivery','domicilio')
       AND NULLIF(btrim(p_direccion), '') IS NOT NULL
      THEN NULLIF(btrim(p_direccion), '')
      ELSE NULL
    END,
    NOW(), NOW()
  )
  ON CONFLICT (restaurante_id, telefono)
  DO UPDATE SET
    updated_at          = NOW(),
    nombre              = CASE
                            WHEN NULLIF(btrim(p_nombre), '') IS NOT NULL
                            THEN NULLIF(btrim(p_nombre), '')
                            ELSE public.usuarios.nombre
                          END,
    direccion_frecuente = CASE
                            WHEN lower(COALESCE(p_tipo_despacho,'')) IN ('delivery','domicilio')
                             AND NULLIF(btrim(p_direccion), '') IS NOT NULL
                            THEN NULLIF(btrim(p_direccion), '')
                            ELSE public.usuarios.direccion_frecuente
                          END
  RETURNING
    public.usuarios.id,
    public.usuarios.telefono,
    public.usuarios.nombre,
    public.usuarios.direccion_frecuente
)
SELECT
  u.id::int,
  u.telefono::text,
  u.nombre::text,
  u.direccion_frecuente::text,
  (
    NULLIF(btrim(p_nombre), '') IS NOT NULL
    AND (SELECT p.nombre FROM prev p LIMIT 1) IS DISTINCT FROM u.nombre
  ) AS updated_name,
  (
    lower(COALESCE(p_tipo_despacho,'')) IN ('delivery','domicilio')
    AND NULLIF(btrim(p_direccion), '') IS NOT NULL
    AND (SELECT p.direccion_frecuente FROM prev p LIMIT 1) IS DISTINCT FROM u.direccion_frecuente
  ) AS updated_address
FROM upserted u
$function$;

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────────
-- Verificación post-aplicación:
--
-- SELECT * FROM public.fn_get_rest_config_int('cart_expiry_minutes', 60, 1);
-- -- Debe retornar: 30 (o el valor en restaurante_config para restaurante_id=1)
--
-- SELECT * FROM public.fn_menu_catalog(1) LIMIT 3;
-- -- Debe retornar filas del menú
--
-- SELECT proname, pg_get_function_arguments(oid)
--   FROM pg_proc WHERE pronamespace='public'::regnamespace
--   AND proname LIKE 'fn_%' ORDER BY proname;
-- ──────────────────────────────────────────────────────────────────────────────
