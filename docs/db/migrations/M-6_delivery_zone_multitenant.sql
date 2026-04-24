-- Migration M-6: Fix delivery_zone multi-tenant constraint
-- Problem:  UNIQUE (postal_code) blocks two tenants from sharing the same
--           postal code. restaurante_id is nullable and has no FK.
-- Fix:      Drop the single-column unique, add composite unique
--           (postal_code, restaurante_id), make restaurante_id NOT NULL with FK.
-- Safe to run on:  La Isla (restaurante_id = 1) with existing rows.
-- Rollback:        See ROLLBACK section at the bottom.

BEGIN;

-- Step 1: Assign restaurante_id = 1 to any orphaned rows before the NOT NULL
-- constraint is applied. In practice La Isla has none, but this prevents the
-- migration from failing if legacy rows exist.
UPDATE public.delivery_zone
SET    restaurante_id = 1
WHERE  restaurante_id IS NULL;

-- Step 2: Drop the bad single-column unique constraint.
ALTER TABLE public.delivery_zone
  DROP CONSTRAINT delivery_zone_postal_code_key;

-- Step 3: Make restaurante_id NOT NULL now that orphans are resolved.
ALTER TABLE public.delivery_zone
  ALTER COLUMN restaurante_id SET NOT NULL;

-- Step 4: Add FK to restaurante so the DB enforces tenant integrity.
ALTER TABLE public.delivery_zone
  ADD CONSTRAINT delivery_zone_restaurante_fk
    FOREIGN KEY (restaurante_id)
    REFERENCES public.restaurante (id)
    ON DELETE CASCADE;

-- Step 5: Add the correct composite unique constraint.
-- Two different tenants can have zones with the same postal code; the same
-- tenant cannot have two zones for the same postal code.
ALTER TABLE public.delivery_zone
  ADD CONSTRAINT delivery_zone_postal_restaurante_key
    UNIQUE (postal_code, restaurante_id);

-- Verify result (optional — run manually to inspect):
-- SELECT conname, contype, pg_get_constraintdef(oid)
-- FROM   pg_constraint
-- WHERE  conrelid = 'public.delivery_zone'::regclass
-- ORDER  BY contype;

COMMIT;

-- ----------------------------------------------------------------------------
-- ROLLBACK (run only if you need to undo):
-- ----------------------------------------------------------------------------
-- BEGIN;
-- ALTER TABLE public.delivery_zone
--   DROP CONSTRAINT IF EXISTS delivery_zone_postal_restaurante_key;
-- ALTER TABLE public.delivery_zone
--   DROP CONSTRAINT IF EXISTS delivery_zone_restaurante_fk;
-- ALTER TABLE public.delivery_zone
--   ALTER COLUMN restaurante_id DROP NOT NULL;
-- ALTER TABLE public.delivery_zone
--   ADD CONSTRAINT delivery_zone_postal_code_key UNIQUE (postal_code);
-- COMMIT;
