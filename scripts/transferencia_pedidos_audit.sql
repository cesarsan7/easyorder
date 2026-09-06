-- ============================================================
-- Auditoría y limpieza de pedidos con metodo_pago='transferencia'
-- ============================================================
-- PASO 1: Ver cuántos pedidos afectados (por restaurante)
SELECT restaurante_id, estado, COUNT(*) AS total
FROM public.pedidos
WHERE metodo_pago = 'transferencia'
GROUP BY restaurante_id, estado
ORDER BY restaurante_id, estado;

-- PASO 2: Ver detalle completo
SELECT id, pedido_codigo, restaurante_id, estado, metodo_pago, created_at
FROM public.pedidos
WHERE metodo_pago = 'transferencia'
ORDER BY restaurante_id, created_at DESC;

-- PASO 3 (OPCIONAL): Migrar transferencia → efectivo en pedidos históricos
-- Descomentá si querés reclasificarlos:
/*
BEGIN;
UPDATE public.pedidos
SET metodo_pago = 'efectivo'
WHERE metodo_pago = 'transferencia';
-- Verificá con: SELECT COUNT(*) FROM pedidos WHERE metodo_pago='transferencia';
-- COMMIT;  <-- confirmar
-- ROLLBACK; <-- deshacer
*/
