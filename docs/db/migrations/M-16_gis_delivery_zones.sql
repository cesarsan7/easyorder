-- M-16: GIS delivery zones — geographic center + radius per zone
-- ─────────────────────────────────────────────────────────────────────────────
-- OBJETIVO
--   Permitir definir zonas de delivery por coordenada + radio circular,
--   como alternativa (o complemento) al actual matching por postal_code.
--   No requiere PostGIS — la validación usa la fórmula de Haversine en la API.
--
-- RETROCOMPATIBILIDAD
--   - postal_code pasa de NOT NULL → NULL (nullable).
--     n8n sigue leyendo postal_code cuando no es NULL; las zonas puramente
--     geográficas tendrán postal_code = NULL.
--   - La UNIQUE constraint existente sobre postal_code se reemplaza por una
--     UNIQUE NULLS NOT DISTINCT (PG 15+) o se deja con NULLs distintos (PG <15).
--     En ambos casos, dos filas con postal_code = NULL son filas distintas.
--   - Ninguna columna existente se elimina ni renombra.
--
-- NUEVAS COLUMNAS en delivery_zone
--   lat_center   NUMERIC(10,8)  — latitud del centro de la zona
--   lng_center   NUMERIC(11,8)  — longitud del centro de la zona
--   radius_km    NUMERIC(6,3)   — radio de cobertura en km (Haversine)
--
-- CONSTRAINT de integridad
--   Cada fila debe tener al menos un identificador geográfico:
--     postal_code IS NOT NULL  OR  (lat_center + lng_center + radius_km) completos.
--
-- RESTAURANTE
--   restaurante.lat, restaurante.long y restaurante.radio_cobertura_km ya
--   existen en el DDL base — no se tocan en esta migración.
--   Solo se agregan comentarios para documentar su propósito dentro del SaaS.
--
-- SEGURO: todas las operaciones son ADD COLUMN IF NOT EXISTS / ADD CONSTRAINT
--   condicional. Se puede ejecutar más de una vez sin efecto secundario.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Hacer postal_code nullable
--    (solo si actualmente es NOT NULL — el IF NOT EXISTS equivalente para
--    ALTER COLUMN es verificar el catálogo)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'delivery_zone'
       AND column_name  = 'postal_code'
       AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.delivery_zone
      ALTER COLUMN postal_code DROP NOT NULL;
    RAISE NOTICE 'M-16: postal_code set to nullable.';
  ELSE
    RAISE NOTICE 'M-16: postal_code already nullable — skipped.';
  END IF;
END;
$$;

-- 2. Agregar columnas geográficas (idempotentes)
ALTER TABLE public.delivery_zone
  ADD COLUMN IF NOT EXISTS lat_center NUMERIC(10, 8) NULL,
  ADD COLUMN IF NOT EXISTS lng_center NUMERIC(11, 8) NULL,
  ADD COLUMN IF NOT EXISTS radius_km  NUMERIC(6, 3)  NULL;

-- 3. Constraint: cada zona debe tener postal_code OR (lat + lng + radius)
--    Se agrega solo si no existe todavía.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema    = 'public'
       AND table_name      = 'delivery_zone'
       AND constraint_name = 'delivery_zone_geo_or_postal_check'
  ) THEN
    ALTER TABLE public.delivery_zone
      ADD CONSTRAINT delivery_zone_geo_or_postal_check CHECK (
        postal_code IS NOT NULL
        OR (lat_center IS NOT NULL AND lng_center IS NOT NULL AND radius_km IS NOT NULL)
      );
    RAISE NOTICE 'M-16: geo_or_postal CHECK constraint added.';
  ELSE
    RAISE NOTICE 'M-16: geo_or_postal CHECK constraint already exists — skipped.';
  END IF;
END;
$$;

-- 4. Índice de consulta: filtrar zonas activas por restaurante (ya existía
--    implícito en queries, se formaliza aquí)
CREATE INDEX IF NOT EXISTS idx_delivery_zone_restaurante_active
  ON public.delivery_zone (restaurante_id, is_active);

-- 5. Comentarios
COMMENT ON COLUMN public.delivery_zone.postal_code IS
  'Código postal de la zona. Nullable desde M-16: puede ser NULL si la zona
   se define exclusivamente por coordenadas (lat_center + lng_center + radius_km).
   n8n Despacho subflujo sigue usando este campo para matching cuando no es NULL.';

COMMENT ON COLUMN public.delivery_zone.lat_center IS
  'Latitud WGS-84 del centro geográfico de la zona de delivery.
   Se usa junto con lng_center y radius_km para validación por Haversine en la API.
   NULL si la zona se identifica solo por postal_code.';

COMMENT ON COLUMN public.delivery_zone.lng_center IS
  'Longitud WGS-84 del centro geográfico de la zona de delivery.';

COMMENT ON COLUMN public.delivery_zone.radius_km IS
  'Radio de cobertura en kilómetros desde lat_center/lng_center.
   La API valida: haversine(pedido.lat, pedido.lng, lat_center, lng_center) <= radius_km.';

COMMENT ON COLUMN public.restaurante.lat IS
  'Latitud WGS-84 del local. Usada como punto de referencia en el mapa del dashboard
   y como fallback para calcular distancia cuando no hay zonas de delivery configuradas.';

COMMENT ON COLUMN public.restaurante.long IS
  'Longitud WGS-84 del local. Nombre legacy (long); en pedidos se usa lng.
   No renombrar: n8n puede referenciar este campo directamente.';

COMMENT ON COLUMN public.restaurante.radio_cobertura_km IS
  'Radio general de cobertura del local en km. Valor por defecto para locales
   sin zonas de delivery granulares. Visible y editable desde el dashboard.';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POST-MIGRACIÓN (ejecutar manualmente si se desea)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'delivery_zone'
--  ORDER BY ordinal_position;
--
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'public.delivery_zone'::regclass;
-- ─────────────────────────────────────────────────────────────────────────────
