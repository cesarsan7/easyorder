-- ============================================================
-- M-17: menu_category_extra
-- Vincula extras a categorías (many-to-many) en lugar de
-- hacerlo a nivel de ítem individual (menu_item_extra).
-- Un extra puede pertenecer a varias categorías.
-- La tabla menu_item_extra se mantiene por compatibilidad
-- pero ya no es la fuente principal para el menú público.
-- ============================================================

-- 1. Tabla de relación categoría ↔ extra
CREATE TABLE IF NOT EXISTS public.menu_category_extra (
  menu_category_id bigint NOT NULL,
  extra_id         bigint NOT NULL,
  CONSTRAINT menu_category_extra_pkey PRIMARY KEY (menu_category_id, extra_id),
  CONSTRAINT mce_category_fkey FOREIGN KEY (menu_category_id)
    REFERENCES public.menu_category(menu_category_id) ON DELETE CASCADE,
  CONSTRAINT mce_extra_fkey FOREIGN KEY (extra
    REFERENCES public.extra(extra_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mce_category
  ON public.menu_category_extra (menu_category_id);

CREATE INDEX IF NOT EXISTS idx_mce_extra
  ON public.menu_category_extra (extra_id);

COMMENT ON TABLE public.menu_category_extra IS
  'Relación many-to-many entre categorías de menú y extras disponibles. '
  'Reemplaza menu_item_extra como fuente principal de extras en el menú público. '
  'Un mismo extra puede estar asociado a varias categorías.';

-- 2. Actualizar fn_menu_catalog para usar menu_category_extra
-- DROP obligatorio porque cambian los parámetros OUT de la función
DROP FUNCTION IF EXISTS public.fn_menu_catalog();
CREATE OR REPLACE FUNCTION public.fn_menu_catalog()
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
      mi.menu_item_id,
      string_agg(
        e.name ||
        CASE
          WHEN COALESCE(e.price, 0) > 0
            THEN ' (' || replace(to_char(e.price, 'FM999999990.00'), '.', ',') || '€)'
          ELSE ''
        END,
        ', ' ORDER BY e.name
      ) AS extras_disponibles
    FROM public.menu_item mi
    JOIN public.menu_category_extra mce
      ON mce.menu_category_id = mi.menu_category_id
    JOIN public.extra e
      ON e.extra_id = mce.extra_id
    WHERE COALESCE(e.is_active, true)
    GROUP BY mi.menu_item_id
  )
  SELECT
    mc.name::text AS categoria,
    mi.name::text AS producto,
    mi.description::text AS descripcion,
    mv.variant_name::text AS variante,
    mv.price::numeric AS precio,
    ex.extras_disponibles::text,
    (
      COALESCE(mc.is_active, true)
      AND COALESCE(mi.is_active, true)
      AND COALESCE(mv.is_active, true)
    ) AS disponible,
    mi.tags::text AS tags,
    COALESCE(mi.is_pizza, false) AS is_pizza,
    CASE
      WHEN mv.variant_name IS NULL OR btrim(mv.variant_name) = ''
        THEN mi.name::text
      ELSE mi.name::text || ' - ' || mv.variant_name::text
    END AS producto_display
  FROM public.menu_item mi
  JOIN public.menu_category mc
    ON mc.menu_category_id = mi.menu_category_id
  LEFT JOIN public.menu_variant mv
    ON mv.menu_item_id = mi.menu_item_id
  LEFT JOIN extras ex
    ON ex.menu_item_id = mi.menu_item_id
  WHERE
    COALESCE(mc.is_active, true)
    AND COALESCE(mi.is_active, true)
    AND (
      mv.menu_variant_id IS NULL
      OR COALESCE(mv.is_active, true)
    );
$function$;

-- fn_menu_lookup no necesita cambios: ya usa fn_menu_catalog()

-- 3. Migrar datos existentes de menu_item_extra → menu_category_extra
--    Para cada (extra, menu_item) en menu_item_extra, insertar
--    (extra, menu_category) usando la categoría del item.
--    Se ignoran duplicados con ON CONFLICT.
INSERT INTO public.menu_category_extra (menu_category_id, extra_id)
SELECT DISTINCT mi.menu_category_id, mie.extra_id
FROM   public.menu_item_extra mie
JOIN   public.menu_item mi ON mi.menu_item_id = mie.menu_item_id
ON CONFLICT DO NOTHING;
