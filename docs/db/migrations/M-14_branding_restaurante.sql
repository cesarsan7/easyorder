-- M-14: Campos de branding por restaurante
-- Agrega eslogan, texto_banner y redes_sociales a la tabla restaurante.
-- El objetivo de texto_banner es mostrar promociones en el menú público.
-- redes_sociales es JSONB para soportar múltiples redes sin columnas fijas.
--
-- Estructura esperada de redes_sociales:
--   [
--     { "red": "instagram", "url": "https://instagram.com/laislaPizzeria" },
--     { "red": "tiktok",    "url": "https://tiktok.com/@laislaPizzeria" },
--     { "red": "facebook",  "url": "https://facebook.com/laislaPizzeria" }
--   ]
--   Redes soportadas (sin restricción en DB): instagram, tiktok, facebook,
--   twitter, youtube, whatsapp, telegram, linkedin, pinterest, web.
--
-- Componente tocado : tabla `restaurante`
-- Reutiliza         : nada (columnas nuevas)
-- Tablas tocadas    : public.restaurante
-- Riesgo            : bajo — columnas nullable, no rompe filas existentes
-- Fase              : post-MVP / multi-tenant branding
-- Depende de        : M-13 (theme_id_enum ya debe existir)
--
-- Aplicar con:
--   psql -h <host> -U <user> -d <db> -f M-14_branding_restaurante.sql

-- ── 1. Eslogan del local ──────────────────────────────────────────────────────
ALTER TABLE public.restaurante
  ADD COLUMN IF NOT EXISTS eslogan text NULL;

COMMENT ON COLUMN public.restaurante.eslogan IS
  'Eslogan o tagline del local. Máx ~160 caracteres recomendados. Se muestra en el menú público.';

-- ── 2. Texto de banner promocional ───────────────────────────────────────────
ALTER TABLE public.restaurante
  ADD COLUMN IF NOT EXISTS texto_banner text NULL;

COMMENT ON COLUMN public.restaurante.texto_banner IS
  'Texto de banner promocional. Cuando no es NULL, se muestra como franja destacada en el menú público. Útil para descuentos, eventos o novedades.';

-- ── 3. Redes sociales (JSONB array) ──────────────────────────────────────────
ALTER TABLE public.restaurante
  ADD COLUMN IF NOT EXISTS redes_sociales jsonb NULL;

COMMENT ON COLUMN public.restaurante.redes_sociales IS
  'Array JSONB de redes sociales. Estructura: [{"red":"instagram","url":"https://..."}]. Redes soportadas: instagram, tiktok, facebook, twitter, youtube, whatsapp, telegram, linkedin, pinterest, web.';

-- ── 4. Verificación rápida ────────────────────────────────────────────────────
-- Ejecutar después de aplicar:
--   SELECT id, nombre, eslogan, texto_banner, redes_sociales, theme_id
--   FROM public.restaurante;

-- ── Nota: brand_color ya existe como columna en restaurante (desde DDL original)
-- ── Nota: theme_id fue agregado en M-13
