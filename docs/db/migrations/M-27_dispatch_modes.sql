-- ─────────────────────────────────────────────────────────────────────────────
-- M-27: Columnas delivery_enabled / pickup_enabled en restaurante
-- ─────────────────────────────────────────────────────────────────────────────
-- OBJETIVO
--   Permitir al dueño configurar qué modos de despacho ofrece su restaurante.
--   El menú público ya lee estas columnas (public.ts) y las usa para mostrar
--   u ocultar las opciones de retiro y delivery en el checkout.
--
-- DEFAULTS
--   Ambas columnas default = true → todos los restaurantes existentes siguen
--   funcionando con delivery + retiro habilitados sin intervención manual.
--
-- SEGURO: ADD COLUMN IF NOT EXISTS con DEFAULT NOT NULL. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.restaurante
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pickup_enabled   BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.restaurante.delivery_enabled IS
  'Si false, el menú público no ofrece la opción de delivery.';
COMMENT ON COLUMN public.restaurante.pickup_enabled IS
  'Si false, el menú público no ofrece la opción de retiro en local.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POST-MIGRACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT id, nombre, delivery_enabled, pickup_enabled FROM public.restaurante;
-- ─────────────────────────────────────────────────────────────────────────────
