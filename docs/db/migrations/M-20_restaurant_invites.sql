-- M-20: Gestión de miembros del equipo
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Añade columna `email` a local_memberships para mostrarla en UI sin
--    necesitar la service role key de Supabase.
-- 2. Crea tabla restaurant_invites para el flujo de invitación por token.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Email en membresías (nullable — las anteriores no tienen email)
ALTER TABLE public.local_memberships
  ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL;

-- 2. Tabla de invitaciones
CREATE TABLE IF NOT EXISTS public.restaurant_invites (
  id             SERIAL PRIMARY KEY,
  restaurante_id INTEGER     NOT NULL REFERENCES public.restaurante(id) ON DELETE CASCADE,
  rol            VARCHAR(20) NOT NULL DEFAULT 'staff',
  token          UUID        NOT NULL DEFAULT gen_random_uuid(),
  created_by     UUID        NOT NULL,   -- user_id del owner que generó la invitación
  expires_at     TIMESTAMP   NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  used_by        UUID        NULL,
  used_at        TIMESTAMP   NULL,
  CONSTRAINT restaurant_invites_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_invites_restaurante
  ON public.restaurant_invites (restaurante_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_invites_token
  ON public.restaurant_invites (token);

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'local_memberships' AND column_name = 'email';
-- SELECT COUNT(*) FROM restaurant_invites;
-- ─────────────────────────────────────────────────────────────────────────────
