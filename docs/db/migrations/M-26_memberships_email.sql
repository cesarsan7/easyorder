-- ─────────────────────────────────────────────────────────────────────────────
-- M-26: Agregar columna email a local_memberships
-- ─────────────────────────────────────────────────────────────────────────────
-- OBJETIVO
--   Persistir el email del usuario Supabase en local_memberships al momento
--   del onboarding, para facilitar búsquedas de soporte y futuros envíos
--   de correo sin tener que hacer round-trip a Supabase Auth.
--
-- SEGURO: ADD COLUMN IF NOT EXISTS — idempotente, nullable, sin default.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.local_memberships
  ADD COLUMN IF NOT EXISTS email TEXT NULL;

COMMENT ON COLUMN public.local_memberships.email IS
  'Email del usuario en Supabase Auth. Se guarda en el onboarding y al unirse por invitación. Cache local — la fuente de verdad es auth.users.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POST-MIGRACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'local_memberships' AND column_name = 'email';
-- ─────────────────────────────────────────────────────────────────────────────
