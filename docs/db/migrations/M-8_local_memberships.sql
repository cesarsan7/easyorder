-- =============================================================================
-- Migration M-8: Create local_memberships table (multi-tenant auth)
-- Purpose:  Asocia usuarios Supabase con restaurantes y les asigna un rol.
--           Requerida para autenticación multi-tenant en el dashboard.
-- Safe to run multiple times: CREATE TABLE IF NOT EXISTS + IF NOT EXISTS indexes.
-- =============================================================================

BEGIN;

-- Step 1: Create table if not already present.
CREATE TABLE IF NOT EXISTS public.local_memberships (
  id             SERIAL PRIMARY KEY,
  user_id        UUID        NOT NULL,    -- auth.users.id de Supabase (sin FK cross-DB)
  restaurante_id INTEGER     NOT NULL REFERENCES public.restaurante(id) ON DELETE CASCADE,
  rol            VARCHAR(20) NOT NULL DEFAULT 'owner',
  created_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
  CONSTRAINT local_memberships_user_restaurante_unique UNIQUE (user_id, restaurante_id)
);

-- Step 2: Index for fast lookup by user (used on every authenticated request).
CREATE INDEX IF NOT EXISTS idx_local_memberships_user
  ON public.local_memberships (user_id);

-- NOTA: No se crea FK hacia auth.users porque esa tabla vive en Supabase Cloud
-- (instancia externa). La validación del user_id ocurre al verificar el JWT —
-- si el JWT es válido, el sub es un UUID real de auth.users.

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (ejecutar manualmente después de aplicar):
-- =============================================================================

-- Confirmar que la tabla existe con sus columnas:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'local_memberships'
-- ORDER BY ordinal_position;

-- Confirmar que el índice existe:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'local_memberships';

-- Confirmar que la constraint UNIQUE existe:
-- SELECT conname, contype, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.local_memberships'::regclass;
