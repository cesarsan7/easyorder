-- ============================================================
-- Script: Borrar todos los pedidos del restaurante id = 11
-- Uso: ejecutar en psql o en el SQL editor de Supabase/pgAdmin
-- ============================================================

BEGIN;

-- 1. Mostrar cuántos pedidos se van a borrar (confirmar antes del DELETE)
SELECT COUNT(*) AS pedidos_a_borrar,
       restaurante_id
FROM public.pedidos
WHERE restaurante_id = 11
GROUP BY restaurante_id;

-- 2. Borrar los pedidos
DELETE FROM public.pedidos
WHERE restaurante_id = 11;

-- 3. Confirmar cuántos quedaron (debe ser 0)
SELECT COUNT(*) AS pedidos_restantes
FROM public.pedidos
WHERE restaurante_id = 11;

COMMIT;
