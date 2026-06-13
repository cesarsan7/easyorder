-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Configuración mínima para restaurante "test" (id = 4)
-- ─────────────────────────────────────────────────────────────────────────────
-- Ejecutar en la base restaurante_mvp para que el restaurante "test" pueda:
--   1. Recibir pedidos web (is_open = true)
--   2. Aceptar pago en efectivo (payment_methods)
--   3. Mostrar tiempo estimado de retiro (restaurante_config)
--
-- SEGURO: todos los INSERT usan ON CONFLICT DO NOTHING o DO UPDATE.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Asegurarse que payment_methods incluye los métodos básicos ─────────────
--    Si la columna ya tiene valor, no la sobrescribe (WHERE payment_methods IS NULL).
--    Si necesitas AGREGAR a un array existente, ver comentario abajo.

UPDATE public.restaurante
SET    payment_methods = '["efectivo", "transferencia"]'::jsonb
WHERE  id              = 4
  AND  (payment_methods IS NULL OR payment_methods = '[]'::jsonb);

-- Para AGREGAR efectivo a un array existente sin perder otros métodos:
-- UPDATE public.restaurante
-- SET    payment_methods = payment_methods || '["efectivo"]'::jsonb
-- WHERE  id = 4
--   AND  NOT (payment_methods @> '["efectivo"]'::jsonb);

-- ── 2. Override de horario: dejar el restaurante "siempre abierto" en pruebas ─
--    Esto evita que calcIsOpen bloquee los pedidos de prueba.
--    QUITAR este override antes de pasar a producción real.

INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
VALUES (4, 'is_open_override', 'true')
ON CONFLICT (restaurante_id, config_key)
DO UPDATE SET config_value = 'true';

-- ── 3. Tiempo estimado de retiro (usado en POST /orders para tipo_despacho=retiro) ─

INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
VALUES (4, 'pickup_eta_minutes', '20')
ON CONFLICT (restaurante_id, config_key)
DO UPDATE SET config_value = '20';

-- ── 4. Horarios de prueba (opcional — la override del paso 2 los bypasea) ─────
--    Si prefieres quitar el override y usar horarios reales, descomentar:
--
-- INSERT INTO public.horarios (restaurante_id, dia, disponible, apertura_1, cierre_1)
-- VALUES
--   (4, 'lunes',     true, '09:00', '23:00'),
--   (4, 'martes',    true, '09:00', '23:00'),
--   (4, 'miercoles', true, '09:00', '23:00'),
--   (4, 'jueves',    true, '09:00', '23:00'),
--   (4, 'viernes',   true, '09:00', '23:00'),
--   (4, 'sabado',    true, '10:00', '23:00'),
--   (4, 'domingo',   true, '10:00', '22:00')
-- ON CONFLICT (restaurante_id, dia) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT id, slug, payment_methods FROM public.restaurante WHERE id = 4;
-- SELECT config_key, config_value FROM public.restaurante_config WHERE restaurante_id = 4;
-- ─────────────────────────────────────────────────────────────────────────────
