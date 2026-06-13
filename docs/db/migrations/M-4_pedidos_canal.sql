-- ─────────────────────────────────────────────────────────────────────────────
-- M-4: Agregar columna canal a pedidos
-- ─────────────────────────────────────────────────────────────────────────────
-- OBJETIVO
--   Diferenciar el canal de origen de cada pedido:
--     'whatsapp'  → generado por el agente n8n
--     'web'       → generado por el checkout web (EasyOrder SaaS)
--
-- NOTA HISTÓRICA
--   Esta migración corresponde al "M-4" referenciado en los comentarios de
--   orders.ts y en las funciones de 001_fase1_recibido.sql. Se creó el archivo
--   tarde; el ADD COLUMN IF NOT EXISTS la hace idempotente.
--
-- CAUSA DEL BUG service_unavailable (503)
--   El INSERT en POST /public/:slug/orders incluía `canal = 'web'` pero la
--   columna no existía en pedidos → PostgreSQL lanzaba error → catch → 503.
--
-- SEGURO: ADD COLUMN IF NOT EXISTS — idempotente, no rompe datos existentes.
-- DEFAULT 'whatsapp' → todos los pedidos históricos quedan con el canal correcto.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS canal VARCHAR(20) DEFAULT 'whatsapp' NULL;

COMMENT ON COLUMN public.pedidos.canal IS
  'Canal de origen del pedido. Valores: whatsapp (agente n8n) | web (checkout EasyOrder).
   DEFAULT whatsapp preserva correctamente todos los pedidos históricos del agente.';

CREATE INDEX IF NOT EXISTS idx_pedidos_canal
  ON public.pedidos (canal)
  WHERE canal IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POST-MIGRACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name   = 'pedidos'
--    AND column_name  = 'canal';
-- -- Debe retornar: canal | character varying | 'whatsapp'::character varying | YES
--
-- -- Verificar que pedidos existentes tienen el default:
-- SELECT canal, COUNT(*) FROM public.pedidos GROUP BY canal;
-- ─────────────────────────────────────────────────────────────────────────────
