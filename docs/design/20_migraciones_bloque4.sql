-- ============================================================
-- FASE 3 — Endurecer tablas de catálogo (C2 → C1)
-- Plan de referencia: docs/design/02_plan_migracion_multitenant.md
-- Pasos del plan: 9, 10, 11, 12
-- ============================================================
-- Prerequisito: Fase 1 completada (todos los restaurante_id
--   ya poblados con valor 1 en las 4 tablas).
--
-- Riesgo: MEDIO
--   Si el backfill de Fase 1 dejó algún NULL, el ALTER TABLE
--   a NOT NULL fallará. La verificación previa lo detecta y
--   aborta la transacción antes de tocar ninguna estructura.
--
-- Rollback por tabla (en orden inverso a las dependencias):
--   ALTER TABLE public.extra        DROP CONSTRAINT extra_restaurante_id_fkey;
--   ALTER TABLE public.extra        ALTER COLUMN restaurante_id DROP NOT NULL;
--   DROP INDEX IF EXISTS idx_extra_restaurante;
--
--   ALTER TABLE public.menu_variant DROP CONSTRAINT menu_variant_restaurante_id_fkey;
--   ALTER TABLE public.menu_variant ALTER COLUMN restaurante_id DROP NOT NULL;
--   DROP INDEX IF EXISTS idx_menu_variant_restaurante;
--
--   ALTER TABLE public.menu_item    DROP CONSTRAINT menu_item_restaurante_id_fkey;
--   ALTER TABLE public.menu_item    ALTER COLUMN restaurante_id DROP NOT NULL;
--   DROP INDEX IF EXISTS idx_menu_item_restaurante;
--
--   ALTER TABLE public.menu_category DROP CONSTRAINT menu_category_restaurante_id_fkey;
--   ALTER TABLE public.menu_category ALTER COLUMN restaurante_id DROP NOT NULL;
--   DROP INDEX IF EXISTS idx_menu_category_restaurante;
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- STEP 0: Verificación previa — abortar si hay NULLs pendientes
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_nulls_menu_category  bigint;
  v_nulls_menu_item      bigint;
  v_nulls_menu_variant   bigint;
  v_nulls_extra          bigint;
  v_msg                  text := '';
BEGIN
  SELECT COUNT(*) INTO v_nulls_menu_category
    FROM public.menu_category WHERE restaurante_id IS NULL;

  SELECT COUNT(*) INTO v_nulls_menu_item
    FROM public.menu_item WHERE restaurante_id IS NULL;

  SELECT COUNT(*) INTO v_nulls_menu_variant
    FROM public.menu_variant WHERE restaurante_id IS NULL;

  SELECT COUNT(*) INTO v_nulls_extra
    FROM public.extra WHERE restaurante_id IS NULL;

  IF v_nulls_menu_category > 0 THEN
    v_msg := v_msg || format('menu_category: %s fila(s) con restaurante_id NULL. ', v_nulls_menu_category);
  END IF;
  IF v_nulls_menu_item > 0 THEN
    v_msg := v_msg || format('menu_item: %s fila(s) con restaurante_id NULL. ', v_nulls_menu_item);
  END IF;
  IF v_nulls_menu_variant > 0 THEN
    v_msg := v_msg || format('menu_variant: %s fila(s) con restaurante_id NULL. ', v_nulls_menu_variant);
  END IF;
  IF v_nulls_extra > 0 THEN
    v_msg := v_msg || format('extra: %s fila(s) con restaurante_id NULL. ', v_nulls_extra);
  END IF;

  IF v_msg <> '' THEN
    RAISE EXCEPTION
      'FASE 3 BLOQUEADA — NULLs sin backfill detectados: %'
      'Ejecutar Fase 1 (docs/design/02_plan_migracion_multitenant.md) antes de continuar.',
      v_msg;
  END IF;

  RAISE NOTICE 'Verificación OK — sin NULLs en restaurante_id. Procediendo con Fase 3.';
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- STEP 1 (plan ítem 9): menu_category — FK + NOT NULL + índice
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.menu_category
  ADD CONSTRAINT menu_category_restaurante_id_fkey
    FOREIGN KEY (restaurante_id)
    REFERENCES public.restaurante(id)
    ON DELETE CASCADE;

ALTER TABLE public.menu_category
  ALTER COLUMN restaurante_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_menu_category_restaurante
  ON public.menu_category USING btree (restaurante_id);

-- ─────────────────────────────────────────────────────────────
-- STEP 2 (plan ítem 10): menu_item — FK + NOT NULL + índice
--
-- Nota de diseño existente: menu_item.menu_category_id tiene
-- FK a menu_category SIN CASCADE. Si se elimina un restaurante,
-- el CASCADE de restaurante→menu_category dejará menu_item
-- con referencias rotas a menos que menu_item también sea
-- eliminado primero. Este gap es pre-existente y está fuera
-- del alcance de Fase 3 — registrado para Fase 4 / post-MVP.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.menu_item
  ADD CONSTRAINT menu_item_restaurante_id_fkey
    FOREIGN KEY (restaurante_id)
    REFERENCES public.restaurante(id)
    ON DELETE CASCADE;

ALTER TABLE public.menu_item
  ALTER COLUMN restaurante_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_menu_item_restaurante
  ON public.menu_item USING btree (restaurante_id);

-- ─────────────────────────────────────────────────────────────
-- STEP 3 (plan ítem 11): menu_variant — FK + NOT NULL + índice
--
-- Ya existe: ix_menu_variant_item_active (menu_item_id, is_active)
-- El nuevo índice apoya filtros directos por tenant sobre
-- menu_variant sin pasar por el join con menu_item.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.menu_variant
  ADD CONSTRAINT menu_variant_restaurante_id_fkey
    FOREIGN KEY (restaurante_id)
    REFERENCES public.restaurante(id)
    ON DELETE CASCADE;

ALTER TABLE public.menu_variant
  ALTER COLUMN restaurante_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_menu_variant_restaurante
  ON public.menu_variant USING btree (restaurante_id);

-- ─────────────────────────────────────────────────────────────
-- STEP 4 (plan ítem 12): extra — FK + NOT NULL + índice
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.extra
  ADD CONSTRAINT extra_restaurante_id_fkey
    FOREIGN KEY (restaurante_id)
    REFERENCES public.restaurante(id)
    ON DELETE CASCADE;

ALTER TABLE public.extra
  ALTER COLUMN restaurante_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_extra_restaurante
  ON public.extra USING btree (restaurante_id);

COMMIT;
