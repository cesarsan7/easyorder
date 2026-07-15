-- M-30: Agregar UNIQUE constraints en tablas de menú
-- Necesarias para que la importación Excel use ON CONFLICT correctamente.
-- Si existen duplicados en producción, el script fallará — revisar primero con las
-- queries de diagnóstico comentadas al final.

-- ── 1. menu_category: único por (restaurante_id, name) ──────────────────────
ALTER TABLE public.menu_category
  ADD CONSTRAINT uq_menu_category_restaurante_name
  UNIQUE (restaurante_id, name);

-- ── 2. menu_item: único por (restaurante_id, menu_category_id, name) ─────────
ALTER TABLE public.menu_item
  ADD CONSTRAINT uq_menu_item_restaurante_cat_name
  UNIQUE (restaurante_id, menu_category_id, name);

-- ── 3. menu_variant: único por (menu_item_id, variant_name) ──────────────────
ALTER TABLE public.menu_variant
  ADD CONSTRAINT uq_menu_variant_item_name
  UNIQUE (menu_item_id, variant_name);

-- ── 4. extra: único por (restaurante_id, name) ───────────────────────────────
ALTER TABLE public.extra
  ADD CONSTRAINT uq_extra_restaurante_name
  UNIQUE (restaurante_id, name);


-- ── Queries de diagnóstico (ejecutar antes si hay dudas) ─────────────────────
-- Duplicados en menu_category:
-- SELECT restaurante_id, name, COUNT(*) FROM menu_category GROUP BY restaurante_id, name HAVING COUNT(*) > 1;

-- Duplicados en menu_item:
-- SELECT restaurante_id, menu_category_id, name, COUNT(*) FROM menu_item GROUP BY restaurante_id, menu_category_id, name HAVING COUNT(*) > 1;

-- Duplicados en menu_variant:
-- SELECT menu_item_id, variant_name, COUNT(*) FROM menu_variant GROUP BY menu_item_id, variant_name HAVING COUNT(*) > 1;

-- Duplicados en extra:
-- SELECT restaurante_id, name, COUNT(*) FROM extra GROUP BY restaurante_id, name HAVING COUNT(*) > 1;
