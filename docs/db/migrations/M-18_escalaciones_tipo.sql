-- M-18: Tipo de escalación en tabla escalaciones
-- ─────────────────────────────────────────────────────────────────────────────
-- OBJETIVO
--   Agregar campo tipo_escalacion para distinguir el origen de cada derivación:
--     derivacion_cliente  → cliente pidió hablar con humano
--     error_sistema       → excepción en subflujo del agente
--     ventana_expirada    → modify_window_minutes expirada sin resolver
--     pedido_en_preparacion → cliente quiso modificar pero ya en preparación
--     carrito_expirado    → cron expiró un carrito (informativo)
--
-- REVERSIÓN: ALTER TABLE public.escalaciones DROP COLUMN IF EXISTS tipo_escalacion;
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.escalaciones
  ADD COLUMN IF NOT EXISTS tipo_escalacion varchar(50) DEFAULT 'derivacion_cliente';

-- Backfill: todos los registros previos se asumen derivacion_cliente
-- (el campo contexto.tipo en algunas filas dice 'error_sistema' —
--  si se quiere mayor precisión hacer: UPDATE ... WHERE contexto->>'tipo' = 'error_sistema')
COMMENT ON COLUMN public.escalaciones.tipo_escalacion IS
  'Origen de la escalación: derivacion_cliente | error_sistema | ventana_expirada | pedido_en_preparacion | carrito_expirado';
