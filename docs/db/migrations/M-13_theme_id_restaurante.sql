-- M-13: Paleta de colores por restaurante (multi-tenant theming)
-- Agrega la columna `theme_id` a la tabla `restaurante` para que cada local
-- pueda elegir su paleta visual en el dashboard y en el menú público.
--
-- Paletas disponibles (definidas en web/lib/themes.ts):
--   indigo   — Índigo     #6366F1  SaaS moderno y profesional   (default)
--   emerald  — Esmeralda  #10B981  Fresco, natural, saludable
--   rose     — Rosa       #F43F5E  Cálido, artesanal, pastelería
--   amber    — Ámbar      #F59E0B  Energético, pizzería, fast food
--   violet   — Violeta    #8B5CF6  Premium, alta cocina, cocktail bar
--   sky      — Cielo      #0EA5E9  Limpio, versátil, corporativo
--
-- Componente tocado : tabla `restaurante`
-- Reutiliza         : nada (columna nueva)
-- Tablas tocadas    : public.restaurante
-- Riesgo            : bajo — columna nullable con DEFAULT, no rompe filas existentes
-- Fase              : post-MVP (preparación multi-tenant)
--
-- Aplicar con:
--   psql -h <host> -U <user> -d <db> -f M-13_theme_id_restaurante.sql

-- ── 1. Crear tipo ENUM para los theme_id válidos ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'theme_id_enum') THEN
    CREATE TYPE public.theme_id_enum AS ENUM (
      'indigo',
      'emerald',
      'rose',
      'amber',
      'violet',
      'sky'
    );
  END IF;
END;
$$;

-- ── 2. Agregar columna theme_id a restaurante ─────────────────────────────────
ALTER TABLE public.restaurante
  ADD COLUMN IF NOT EXISTS theme_id public.theme_id_enum NOT NULL DEFAULT 'indigo';

-- ── 3. Comentario descriptivo en la columna ──────────────────────────────────
COMMENT ON COLUMN public.restaurante.theme_id IS
  'Paleta de color del dashboard y menú público. Valores válidos: indigo | emerald | rose | amber | violet | sky. Ver web/lib/themes.ts.';

-- ── 4. Verificación rápida ────────────────────────────────────────────────────
-- Ejecutar después de aplicar para confirmar:
--   SELECT id, nombre, theme_id FROM public.restaurante;
