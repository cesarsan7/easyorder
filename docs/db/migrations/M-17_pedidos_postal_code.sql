-- M-17: Agregar postal_code a pedidos
-- ─────────────────────────────────────────────────────────────────────────────
-- OBJETIVO
--   Guardar el código postal resuelto en cada pedido delivery.
--   Permite trazabilidad por zona sin depender de re-lookup en delivery_zone.
--   Rellena postal_code en el UPDATE de Despacho subflujo (node: Actualizar Pedido Delivery).
--
-- FUENTE DEL VALOR
--   a) CP explícito que el cliente dice por WhatsApp o web checkout.
--   b) CP resuelto desde delivery_zone.postal_code cuando el cliente dice el nombre de la zona.
--   c) NULL si pedido es retiro.
--
-- SEGURO: ADD COLUMN IF NOT EXISTS — idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS postal_code varchar(10) NULL;

COMMENT ON COLUMN public.pedidos.postal_code IS
  'Código postal de la zona de delivery. Resuelto en Despacho subflujo.
   NULL si pedido es retiro o si no se pudo determinar la zona.
   Fuente: input directo del cliente o lookup en delivery_zone.postal_code.';

CREATE INDEX IF NOT EXISTS idx_pedidos_postal_code
  ON public.pedidos (postal_code)
  WHERE postal_code IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POST-MIGRACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'pedidos'
--    AND column_name = 'postal_code';
-- ─────────────────────────────────────────────────────────────────────────────
