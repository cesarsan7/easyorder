-- M-16b: Fix UNIQUE constraint on delivery_zone.postal_code — scope to (restaurante_id, postal_code)
-- ─────────────────────────────────────────────────────────────────────────────
-- PROBLEMA
--   El DDL original tiene UNIQUE (postal_code) sin restaurante_id.
--   Esto impide que dos restaurantes distintos registren la misma zona postal.
--   Es un bug multi-tenant.
--
-- FIX
--   Eliminar la constraint global y crear una nueva por (restaurante_id, postal_code).
--   Con postal_code nullable (tras M-16), dos filas con postal_code=NULL se tratan
--   como distintas (PG <15 default: NULLs are NOT distinct in UNIQUE indexes).
--   Si el servidor es PG 15+, añadir NULLS NOT DISTINCT para mayor seguridad.
--
-- DEPENDENCIA: ejecutar DESPUÉS de M-16_gis_delivery_zones.sql
-- SEGURO: idempotente — IF NOT EXISTS / IF EXISTS en todas las operaciones.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Eliminar constraint global si existe
ALTER TABLE public.delivery_zone
  DROP CONSTRAINT IF EXISTS delivery_zone_postal_code_key;

-- 2. Crear constraint por (restaurante_id, postal_code)
--    Solo aplica cuando postal_code IS NOT NULL (NULLs son distintos por defecto en PG <15,
--    y explícitamente en PG 15+ con NULLS NOT DISTINCT si se desea).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema    = 'public'
       AND table_name      = 'delivery_zone'
       AND constraint_name = 'delivery_zone_restaurante_postal_key'
  ) THEN
    ALTER TABLE public.delivery_zone
      ADD CONSTRAINT delivery_zone_restaurante_postal_key
      UNIQUE (restaurante_id, postal_code);
    RAISE NOTICE 'M-16b: UNIQUE (restaurante_id, postal_code) añadida.';
  ELSE
    RAISE NOTICE 'M-16b: constraint ya existe — skipped.';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POST-MIGRACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'public.delivery_zone'::regclass;
-- ─────────────────────────────────────────────────────────────────────────────
