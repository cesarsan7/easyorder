-- ──────────────────────────────────────────────────────────────────────────────
-- M-21: Multi-tenant schema fixes
-- Prerequisito para onboarding de segundo restaurante.
--
-- Problemas corregidos:
--   1. usuarios.telefono: UNIQUE solo por telefono impide que dos restaurantes
--      tengan el mismo número de cliente → se reemplaza por UNIQUE (restaurante_id, telefono)
--   2. contexto: tabla sin PK declarada → se agrega id SERIAL como PK
--   3. n8n_chat_histories: sin restaurante_id → se agrega columna nullable,
--      backfill con restaurante_id = 1, índice compuesto para búsqueda por tenant
--
-- Impacto en producción (1 restaurante activo):
--   - Sin downtime: todas las operaciones son ADD COLUMN / DROP INDEX / CREATE INDEX
--   - Backfill trivial: solo filas del restaurante 1
--   - n8n sigue funcionando sin cambios: columna nullable por defecto
--
-- Post-requisitos (tareas separadas):
--   - n8n Pizzeria + Preguntas: cambiar session_key de {session_id}
--     a {restaurante_id}_{session_id} en nodos Memory
--   - Una vez actualizado n8n: ALTER TABLE n8n_chat_histories
--     ALTER COLUMN restaurante_id SET NOT NULL
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. usuarios: ampliar UNIQUE a (restaurante_id, telefono) ─────────────────

-- Eliminar el índice único actual que solo cubre telefono
DROP INDEX IF EXISTS public.usuarios_telefono_key;

-- Nuevo índice único por tenant: permite el mismo teléfono en distintos restaurantes
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_restaurante_telefono_key
  ON public.usuarios (restaurante_id, telefono);

-- ── 2. contexto: agregar PK explícita (id SERIAL) ────────────────────────────

-- Agregar columna id si no existe
ALTER TABLE public.contexto
  ADD COLUMN IF NOT EXISTS id SERIAL;

-- Declarar PK solo si no existe ya una
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conrelid = 'public.contexto'::regclass
      AND  contype  = 'p'
  ) THEN
    ALTER TABLE public.contexto
      ADD CONSTRAINT contexto_pkey PRIMARY KEY (id);
  END IF;
END
$$;

-- Índice único por tenant sobre (restaurante_id, telefono) para evitar contextos
-- duplicados del mismo cliente en el mismo restaurante
CREATE UNIQUE INDEX IF NOT EXISTS uq_contexto_restaurante_telefono
  ON public.contexto (restaurante_id, telefono)
  WHERE restaurante_id IS NOT NULL;

-- ── 3. n8n_chat_histories: agregar restaurante_id ────────────────────────────

-- Añadir columna nullable (sin NOT NULL hasta que n8n sea actualizado)
ALTER TABLE public.n8n_chat_histories
  ADD COLUMN IF NOT EXISTS restaurante_id INTEGER
    REFERENCES public.restaurante(id) ON DELETE CASCADE;

-- Backfill: todas las filas existentes pertenecen a restaurante_id = 1 (La Isla)
UPDATE public.n8n_chat_histories
  SET    restaurante_id = 1
  WHERE  restaurante_id IS NULL;

-- Índice compuesto para búsqueda eficiente por tenant
CREATE INDEX IF NOT EXISTS ix_n8n_chat_histories_tenant
  ON public.n8n_chat_histories (restaurante_id, session_id);

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────────
-- Verificación post-aplicación:
--
-- SELECT indexname, indexdef
--   FROM pg_indexes
--  WHERE tablename = 'usuarios'
--    AND indexname = 'usuarios_restaurante_telefono_key';
--
-- SELECT conname, contype
--   FROM pg_constraint
--  WHERE conrelid = 'public.contexto'::regclass;
--
-- SELECT column_name, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'n8n_chat_histories'
--    AND column_name = 'restaurante_id';
-- ──────────────────────────────────────────────────────────────────────────────
