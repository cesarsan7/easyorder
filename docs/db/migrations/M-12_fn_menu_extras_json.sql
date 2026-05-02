-- M-12: Exponer menu_item_id, menu_variant_id y extras_json en fn_menu_catalog / fn_menu_lookup
-- Permite al Agente Validador de n8n almacenar extras con extra_id correcto
-- en lugar de guardarlos como texto plano en pedidos.items[].notas
--
-- PostgreSQL no permite cambiar el tipo de retorno con CREATE OR REPLACE,
-- por eso se hace DROP + CREATE en orden correcto (lookup primero porque depende de catalog).

-- ── 0. DROP en orden de dependencia ──────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_menu_lookup(text);
DROP FUNCTION IF EXISTS public.fn_menu_catalog();

-- ── 1. fn_menu_catalog ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_menu_catalog()
 RETURNS TABLE(
   categoria        text,
   producto         text,
   descripcion      text,
   variante         text,
   precio           numeric,
   extras_disponibles text,
   disponible       boolean,
   tags             text,
   is_pizza         boolean,
   producto_display text,
   menu_item_id     int8,
   menu_variant_id  int8,
   extras_json      jsonb
 )
 LANGUAGE sql
 STABLE
AS $function$
  WITH extras_text AS (
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
  ),
  extras_json_cte AS (
    SELECT
      mie.menu_item_id,
      jsonb_agg(
        jsonb_build_object(
          'extra_id',   e.extra_id,
          'name',       e.name,
          'price',      e.price
        )
        ORDER BY e.name
      ) AS extras_json
    FROM public.menu_item_extra mie
    JOIN public.extra e ON e.extra_id = mie.extra_id
    WHERE COALESCE(e.is_active, true)
    GROUP BY mie.menu_item_id
  )
  SELECT
    mc.name::text                      AS categoria,
    mi.name::text                      AS producto,
    mi.description::text               AS descripcion,
    mv.variant_name::text              AS variante,
    mv.price::numeric                  AS precio,
    et.extras_disponibles::text,
    (
      COALESCE(mc.is_active, true)
      AND COALESCE(mi.is_active, true)
      AND COALESCE(mv.is_active, true)
    )                                  AS disponible,
    mi.tags::text                      AS tags,
    COALESCE(mi.is_pizza, false)       AS is_pizza,
    CASE
      WHEN mv.variant_name IS NULL OR btrim(mv.variant_name) = ''
        THEN mi.name::text
      ELSE mi.name::text || ' - ' || mv.variant_name::text
    END                                AS producto_display,
    mi.menu_item_id::int8              AS menu_item_id,
    mv.menu_variant_id::int8           AS menu_variant_id,
    ej.extras_json                     AS extras_json
  FROM public.menu_item mi
  JOIN public.menu_category mc
    ON mc.menu_category_id = mi.menu_category_id
  LEFT JOIN public.menu_variant mv
    ON mv.menu_item_id = mi.menu_item_id
  LEFT JOIN extras_text et
    ON et.menu_item_id = mi.menu_item_id
  LEFT JOIN extras_json_cte ej
    ON ej.menu_item_id = mi.menu_item_id
  WHERE
    COALESCE(mc.is_active, true)
    AND COALESCE(mi.is_active, true)
    AND (
      mv.menu_variant_id IS NULL
      OR COALESCE(mv.is_active, true)
    );
$function$;


-- ── 2. fn_menu_lookup ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_menu_lookup(p_search text DEFAULT NULL::text)
 RETURNS TABLE(
   categoria        text,
   producto         text,
   descripcion      text,
   variante         text,
   precio           numeric,
   extras_disponibles text,
   disponible       boolean,
   tags             text,
   is_pizza         boolean,
   producto_display text,
   menu_item_id     int8,
   menu_variant_id  int8,
   extras_json      jsonb
 )
 LANGUAGE sql
 STABLE
AS $function$
  SELECT *
  FROM public.fn_menu_catalog() c
  WHERE p_search IS NULL
     OR p_search = ''
     OR lower(unaccent(COALESCE(c.categoria,'')))         LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.producto,'')))          LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.variante,'')))          LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.producto_display,'')))  LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.extras_disponibles,''))) LIKE '%' || lower(unaccent(p_search)) || '%'
  ORDER BY c.categoria, c.producto, c.precio;
$function$;
