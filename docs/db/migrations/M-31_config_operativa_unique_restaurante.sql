-- M-31: Agregar UNIQUE constraint en config_operativa(restaurante_id)
-- Necesario para que PATCH /dashboard/:slug/config-keys use ON CONFLICT (restaurante_id).
-- La tabla puede tener filas duplicadas por restaurante_id si se crearon antes — revisar primero.

-- ── Diagnóstico (ejecutar antes si hay dudas) ────────────────────────────────
-- SELECT restaurante_id, COUNT(*) FROM public.config_operativa
--   GROUP BY restaurante_id HAVING COUNT(*) > 1;

-- ── Si hay duplicados, conservar sólo la fila más reciente por restaurante ───
-- DELETE FROM public.config_operativa co
--   WHERE id NOT IN (
--     SELECT MAX(id) FROM public.config_operativa GROUP BY restaurante_id
--   );

-- ── Agregar el constraint ────────────────────────────────────────────────────
ALTER TABLE public.config_operativa
  ADD CONSTRAINT uq_config_operativa_restaurante
  UNIQUE (restaurante_id);
