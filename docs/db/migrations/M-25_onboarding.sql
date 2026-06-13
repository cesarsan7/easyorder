-- ─────────────────────────────────────────────────────────────────────────────
-- M-25: Constraints de soporte para self-service onboarding
-- ─────────────────────────────────────────────────────────────────────────────
-- OBJETIVO
--   Garantizar integridad en las tablas que onboarding toca:
--   1. restaurante.slug debe ser UNIQUE (puede ya existir — IF NOT EXISTS es seguro)
--   2. horarios(restaurante_id, dia) UNIQUE → permite ON CONFLICT seguro en seed
--   3. horario_atencion ya tiene UNIQUE(restaurante_id, dia_semana) desde M-7
--
-- SEGURO: todos los blocos son idempotentes (IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. restaurante.slug — UNIQUE ─────────────────────────────────────────────
-- El endpoint resolveTenant ya usa slug para lookup, por lo que la columna
-- existe. Solo aseguramos el índice único.

CREATE UNIQUE INDEX IF NOT EXISTS ux_restaurante_slug
  ON public.restaurante (slug)
  WHERE slug IS NOT NULL;

-- ── 2. horarios(restaurante_id, dia) — UNIQUE ────────────────────────────────
-- La tabla horarios usa dia TEXT (ej: 'Lunes', 'Miércoles').
-- Sin este índice, un INSERT duplicado crea filas repetidas.
-- Con él, el seed de onboarding puede usar ON CONFLICT DO NOTHING.

CREATE UNIQUE INDEX IF NOT EXISTS ux_horarios_restaurante_dia
  ON public.horarios (restaurante_id, dia);

-- ── 3. restaurante_config — asegurar PK compuesta ────────────────────────────
-- Ya existe (config_key, restaurante_id) como PK según DDL.
-- No se modifica — ya soporta ON CONFLICT (config_key, restaurante_id).

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POST-MIGRACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT indexname, indexdef
--   FROM pg_indexes
--  WHERE tablename IN ('restaurante', 'horarios')
--    AND indexname IN ('ux_restaurante_slug', 'ux_horarios_restaurante_dia');
-- ─────────────────────────────────────────────────────────────────────────────
