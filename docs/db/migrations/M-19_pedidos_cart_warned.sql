-- M-19: cart_warned_at en pedidos + cart_warning_minutes en restaurante_config
-- ─────────────────────────────────────────────────────────────────────────────
-- OBJETIVO
--   Permite enviar una notificación de advertencia ANTES de expirar el carrito.
--   El cron detecta carritos que entraron en la ventana de advertencia y
--   establece cart_warned_at para no volver a notificar.
--
-- REVERSIÓN:
--   ALTER TABLE public.pedidos DROP COLUMN IF EXISTS cart_warned_at;
--   DELETE FROM public.restaurante_config WHERE config_key = 'cart_warning_minutes';
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Columna de control en pedidos
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cart_warned_at timestamp NULL;

COMMENT ON COLUMN public.pedidos.cart_warned_at IS
  'Timestamp en que se envió la notificación de advertencia pre-expiración. NULL = no enviada.';

-- 2. Configuración por restaurante (default = 5 minutos antes de expirar)
--    Ajustar el valor según necesidad de negocio.
INSERT INTO public.restaurante_config (config_key, config_value, restaurante_id)
VALUES ('cart_warning_minutes', '5', 1)
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;
