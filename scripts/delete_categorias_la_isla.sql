-- ============================================================
-- Eliminar categorías y todo su contenido asociado
-- Restaurante: La Isla (restaurante_id = 11)
-- Categorías:  Aborrajados, Alipapas, Hamburguesas,
--              Entradas, Charcutería
-- ============================================================
-- IMPORTANTE: Ejecutar dentro de una transacción para poder
-- hacer ROLLBACK si algo no es como se esperaba.
-- ============================================================

BEGIN;

-- 1. Identificar las categorías objetivo (verificación previa)
SELECT menu_category_id, name, is_active
FROM public.menu_category
WHERE restaurante_id = 11
  AND name IN ('Aborrajados','Alipapas','Hamburguesas','Entradas','Charcutería');

-- ─────────────────────────────────────────────────────────────
-- 2. CTE con los IDs de las categorías a eliminar
-- ─────────────────────────────────────────────────────────────
WITH cats AS (
  SELECT menu_category_id
  FROM public.menu_category
  WHERE restaurante_id = 11
    AND name IN ('Aborrajados','Alipapas','Hamburguesas','Entradas','Charcutería')
),

-- 3. IDs de los items que pertenecen a esas categorías
items AS (
  SELECT mi.menu_item_id
  FROM public.menu_item mi
  JOIN cats c ON c.menu_category_id = mi.menu_category_id
),

-- 4. IDs de extras que SOLO están asociados a esos items
--    (no se comparten con items de otras categorías)
extras_huerfanos AS (
  SELECT e.extra_id
  FROM public.extra e
  JOIN public.menu_item_extra mie ON mie.extra_id = e.extra_id
  WHERE e.restaurante_id = 11
  GROUP BY e.extra_id
  HAVING COUNT(DISTINCT mie.menu_item_id) =
         COUNT(DISTINCT CASE WHEN mie.menu_item_id IN (SELECT menu_item_id FROM items)
                             THEN mie.menu_item_id END)
),

-- 5. Eliminar relaciones item ↔ extra de los items objetivo
del_mie AS (
  DELETE FROM public.menu_item_extra
  WHERE menu_item_id IN (SELECT menu_item_id FROM items)
  RETURNING extra_id
),

-- 6. Eliminar variantes de los items objetivo
del_var AS (
  DELETE FROM public.menu_variant
  WHERE menu_item_id IN (SELECT menu_item_id FROM items)
  RETURNING menu_variant_id
),

-- 7. Eliminar los items
del_items AS (
  DELETE FROM public.menu_item
  WHERE menu_item_id IN (SELECT menu_item_id FROM items)
  RETURNING menu_item_id
),

-- 8. Eliminar extras huérfanos (quedaron sin ningún item)
del_extras AS (
  DELETE FROM public.extra
  WHERE extra_id IN (SELECT extra_id FROM extras_huerfanos)
  RETURNING extra_id
),

-- 9. Eliminar las categorías
del_cats AS (
  DELETE FROM public.menu_category
  WHERE menu_category_id IN (SELECT menu_category_id FROM cats)
  RETURNING menu_category_id, name
)

-- Resumen de lo eliminado
SELECT
  (SELECT COUNT(*) FROM del_cats)   AS categorias_eliminadas,
  (SELECT COUNT(*) FROM del_items)  AS items_eliminados,
  (SELECT COUNT(*) FROM del_var)    AS variantes_eliminadas,
  (SELECT COUNT(*) FROM del_mie)    AS relaciones_item_extra_eliminadas,
  (SELECT COUNT(*) FROM del_extras) AS extras_huerfanos_eliminados;

-- ─────────────────────────────────────────────────────────────
-- NOTA SOBRE PEDIDOS:
-- Los items de pedido se almacenan como JSONB en pedidos.items.
-- No existen como filas separadas, por lo que los pedidos
-- históricos NO se eliminan (mantienen el historial intacto).
-- Si querés eliminar pedidos de estas categorías específicas,
-- ejecutá por separado el bloque a continuación (descomentalo):
-- ─────────────────────────────────────────────────────────────

/*
DELETE FROM public.pedidos
WHERE restaurante_id = 11
  AND items @> ANY (ARRAY[
    '[{"categoria": "Aborrajados"}]'::jsonb,
    '[{"categoria": "Alipapas"}]'::jsonb,
    '[{"categoria": "Hamburguesas"}]'::jsonb,
    '[{"categoria": "Entradas"}]'::jsonb,
    '[{"categoria": "Charcutería"}]'::jsonb
  ]);
*/

-- Revisá el resumen, luego ejecutá COMMIT para confirmar
-- o ROLLBACK para deshacer todo.
-- COMMIT;
-- ROLLBACK;
