-- ──────────────────────────────────────────────────────────────────────────────
-- M-22: Parametrizar funciones SQL para multi-tenant
--
-- Problema: todas las funciones de negocio ignoran el tenant (restaurante_id).
-- Con un único restaurante esto no genera errores, pero al agregar el segundo:
--   • fn_get_rest_config_int   → lee config de todos los restaurantes mezclados
--   • fn_menu_catalog/lookup   → devuelve menús de todos los restaurantes
--   • fn_select_pedido_*       → puede devolver pedidos de otro restaurante
--   • fn_upsert_usuario_perfil → ON CONFLICT (telefono) roto tras M-21
--
-- Estrategia: añadir p_restaurante_id INTEGER DEFAULT 1 a cada función.
--   - DEFAULT 1 garantiza que n8n sigue funcionando SIN CAMBIOS en los workflows.
--   - Las nuevas llamadas desde la API web ya pasan el restaurante_id explícito.
--   - Una vez n8n actualizado → quitar el DEFAULT (tarea separada).
--
-- URGENTE: fn_upsert_usuario_perfil está rota desde M-21 porque usaba
--   ON CONFLICT (telefono) y ese índice único fue eliminado.
--   Esta migración la corrige a ON CONFLICT (restaurante_id, telefono).
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. fn_get_rest_config_int ─────────────────────────────────────────────────
-- Añade p_restaurante_id para leer config del tenant correcto.

CREATE OR REPLACE FUNCTION public.fn_get_rest_config_int(
  p_key           text,
  p_default       integer,
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
  pedido_id       text,
  pedido_codigo   text,
  estado          text,
  tipo_despacho   text,
  total           numeric,
  updated_at      timestamp without time zone,
  es_modificable  boolean
)
LANGUAGE sql
STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',  60, p_restaurante_id) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes',30, p_restaurante_id) AS modify_window_minutes
  )
  SELECT
    p.id::text,
    p.pedido_codigo,
    p.estado,
    p.tipo_despacho,
    p.total,
    p.updated_at,
    CASE
      WHEN lower(COALESCE(p.estado,'en_curso')) IN ('en_curso','draft')
        THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
      WHEN lower(COALESCE(p.estado,'en_curso')) IN ('pendiente_pago','confirmado','pagado','paid')
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
  categoria           text,
  producto            text,
  descripcion         text,
  variante            text,
  precio              numeric,
  extras_disponibles  text,
  disponible          boolean,
  tags                text,
  is_pizza            boolean,
  producto_display    text
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
    AND (
      mv.menu_variant_id IS NULL
      OR COALESCE(mv.is_active, true)
    )
$function$;


-- ── 4. fn_menu_lookup ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_menu_lookup(
  p_search         text    DEFAULT NULL::text,
  p_restaurante_id integer DEFAULT 1
)
RETURNS TABLE(
  categoria           text,
  producto            text,
  descripcion         text,
  variante            text,
  precio              numeric,
  extras_disponibles  text,
  disponible          boolean,
  tags                text,
  is_pizza            boolean,
  producto_display    text
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
-- Secuencia de número de pedido scoped por restaurante.

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
-- El código incluye fecha como prefijo → mantiene unicidad global.
-- Se añade p_restaurante_id para scope correcto de la secuencia diaria.

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
  WHERE pedido_codigo   ~ ('^' || prefijo || '-[0-9]{4}$')
    AND restaurante_id  = p_restaurante_id;

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
  pedido_id      text,
  pedido_codigo  text,
  estado         text,
  tipo_despacho  text,
  subtotal       numeric,
  total          numeric,
  updated_at     timestamp without time zone,
  items          jsonb,
  direccion      text,
  tiempo_estimado text,
  metodo_pago    text,
  es_modificable boolean
)
LANGUAGE sql
STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',  60, p_restaurante_id) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes',30, p_restaurante_id) AS modify_window_minutes
  ),
  ref AS (
    SELECT
      trim(COALESCE(p_referencia, ''))                                          AS r,
      regexp_replace(COALESCE(p_referencia, ''), '[^0-9]', '', 'g')            AS digits
  ),
  base AS (
    SELECT
      p.id::text          AS pedido_id,
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
        WHEN lower(COALESCE(p.estado,'en_curso')) IN ('en_curso','draft')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado,'en_curso')) IN ('pendiente_pago','confirmado','pagado','paid')
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
    CASE WHEN lower(COALESCE(b.pedido_codigo,'')) = lower(ref.r) THEN 0 ELSE 1 END,
    CASE WHEN b.pedido_id = ref.r THEN 0 ELSE 1 END,
    CASE WHEN length(ref.digits) >= 3 AND right(COALESCE(b.pedido_codigo,''), length(ref.digits)) = ref.digits THEN 0 ELSE 1 END,
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
  SELECT
    r.pedido_id, r.pedido_codigo, r.estado, r.tipo_despacho,
    r.total, r.updated_at, r.es_modificable
  FROM public.fn_resolver_pedido_referencia(p_telefono, p_referencia, p_restaurante_id) r
  WHERE r.es_modificable
  LIMIT 1
$function$;


-- ── 9. fn_select_pedido_reutilizable (bigint) ─────────────────────────────────

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
      public.fn_get_rest_config_int('cart_expiry_minutes',  60, p_restaurante_id) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes',30, p_restaurante_id) AS modify_window_minutes
  ),
  cand AS (
    SELECT
      p.*,
      COALESCE(p.updated_at, p.created_at, NOW()) AS ref_ts,
      CASE
        WHEN jsonb_typeof(COALESCE(p.items,'[]'::jsonb)) = 'array'
         AND jsonb_array_length(COALESCE(p.items,'[]'::jsonb)) > 0
        THEN true ELSE false
      END AS has_items,
      CASE
        WHEN lower(COALESCE(p.estado,'en_curso')) IN ('en_curso','draft')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado,'en_curso')) IN ('pendiente_pago','confirmado','pagado','paid')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
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
    CASE WHEN p_session_id IS NOT NULL AND COALESCE(c.session_id,'') = p_session_id THEN 0 ELSE 1 END,
    CASE WHEN c.has_items THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado,'en_curso')) = 'en_curso' THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.id DESC
  LIMIT 1
$function$;


-- ── 10. fn_select_pedido_reutilizable (text, con forzar_nuevo) ────────────────

CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(
  p_telefono           text,
  p_session_id         text    DEFAULT NULL::text,
  p_pedido_id          text    DEFAULT NULL::text,
  p_forzar_pedido_nuevo boolean DEFAULT false,
  p_restaurante_id     integer DEFAULT 1
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
      public.fn_get_rest_config_int('cart_expiry_minutes',  60, p_restaurante_id) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes',30, p_restaurante_id) AS modify_window_minutes
  ),
  ref AS (
    SELECT
      trim(COALESCE(p_pedido_id,''))                                             AS pedido_ref,
      regexp_replace(COALESCE(p_pedido_id,''), '[^0-9]', '', 'g')               AS pedido_digits
  ),
  cand AS (
    SELECT
      p.*,
      COALESCE(p.updated_at, p.created_at, NOW()) AS ref_ts,
      CASE
        WHEN jsonb_typeof(COALESCE(p.items,'[]'::jsonb)) = 'array'
         AND jsonb_array_length(COALESCE(p.items,'[]'::jsonb)) > 0
        THEN true ELSE false
      END AS has_items,
      CASE
        WHEN p_forzar_pedido_nuevo THEN false
        WHEN lower(COALESCE(p.estado,'en_curso')) IN ('en_curso','draft')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado,'en_curso')) IN ('pendiente_pago','confirmado','pagado','paid')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
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
        OR lower(COALESCE(c.pedido_codigo,'')) = lower(ref.pedido_ref)
        OR lower(COALESCE(c.pedido_codigo,'')) LIKE lower(ref.pedido_ref) || '%'
        OR (length(ref.pedido_digits) >= 3 AND right(COALESCE(c.pedido_codigo,''), length(ref.pedido_digits)) = ref.pedido_digits)
      ) THEN 0 ELSE 1
    END,
    CASE WHEN p_session_id IS NOT NULL AND COALESCE(c.session_id,'') = p_session_id THEN 0 ELSE 1 END,
    CASE WHEN c.has_items  THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado,'en_curso')) = 'en_curso' THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.id DESC
  LIMIT 1
$function$;


-- ── 11. fn_upsert_usuario_perfil ──────────────────────────────────────────────
-- CRÍTICO: ON CONFLICT (telefono) estaba roto desde M-21.
-- Corregido a ON CONFLICT (restaurante_id, telefono).
-- Se añade p_restaurante_id para reemplazar el literal 1.

CREATE OR REPLACE FUNCTION public.fn_upsert_usuario_perfil(
  p_telefono       text,
  p_nombre         text    DEFAULT NULL::text,
  p_direccion      text    DEFAULT NULL::text,
  p_tipo_despacho  text    DEFAULT NULL::text,
  p_restaurante_id integer DEFAULT 1
)
RETURNS TABLE(
  id               integer,
  telefono         text,
  nombre           text,
  direccion_frecuente text,
  updated_name     boolean,
  updated_address  boolean
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
    restaurante_id,
    telefono,
    nombre,
    direccion_frecuente,
    created_at,
    updated_at
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
    NOW(),
    NOW()
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
-- -- Confirmar signatures actualizadas:
-- SELECT p.proname, pg_get_function_arguments(p.oid)
-- FROM   pg_proc p
-- JOIN   pg_namespace n ON n.oid = p.pronamespace
-- WHERE  n.nspname = 'public'
--   AND  p.proname IN (
--     'fn_get_rest_config_int','fn_menu_catalog','fn_menu_lookup',
--     'fn_select_pedido_reutilizable','fn_upsert_usuario_perfil',
--     'fn_next_pedido_numero','fn_resolver_pedido_referencia'
--   )
-- ORDER BY p.proname;
--
-- -- Probar que n8n sigue funcionando (llama sin parámetro → DEFAULT 1):
-- SELECT * FROM public.fn_menu_catalog() LIMIT 3;
-- SELECT * FROM public.fn_get_rest_config_int('cart_expiry_minutes', 60);
-- ──────────────────────────────────────────────────────────────────────────────
