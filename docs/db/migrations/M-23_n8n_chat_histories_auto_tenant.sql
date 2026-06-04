-- ──────────────────────────────────────────────────────────────────────────────
-- M-23: Auto-poblar restaurante_id en n8n_chat_histories desde session_id
--
-- Problema:
--   El nodo Memory de LangChain (Postgres Chat Memory) escribe en
--   n8n_chat_histories sin conocer nuestra columna restaurante_id.
--   Si la columna es NOT NULL, cada INSERT del nodo falla.
--
-- Solución:
--   1. Asegurar que la columna sea nullable (DROP NOT NULL si aplica).
--   2. Añadir trigger BEFORE INSERT que extrae restaurante_id del prefijo
--      del session_id, que ahora tiene el formato "{restaurante_id}_{key}".
--      Ejemplos: "1_12345" → restaurante_id = 1
--                "2_+34612345678" → restaurante_id = 2
--   3. Fallback a restaurante_id = 1 si el prefijo no es un entero válido
--      (backward compatible con sesiones antiguas sin prefijo).
--
-- Flujo actual del session_id tras los cambios de n8n:
--   Pizzeria  → restaurante_id + '_' + conversation_id
--   Preguntas → restaurante_id + '_' + telefono
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Asegurar que la columna admite NULL (por si tiene NOT NULL constraint) ──

ALTER TABLE public.n8n_chat_histories
  ALTER COLUMN restaurante_id DROP NOT NULL;

-- ── 2. Función del trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_n8n_chat_set_restaurante_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text;
  v_rid    integer;
BEGIN
  -- Solo actuar si restaurante_id llega NULL (el nodo Memory no lo envía)
  IF NEW.restaurante_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- El session_id tiene formato "{restaurante_id}_{resto}"
  -- Extraemos la parte antes del primer '_'
  v_prefix := split_part(COALESCE(NEW.session_id, ''), '_', 1);

  BEGIN
    v_rid := v_prefix::integer;
  EXCEPTION WHEN others THEN
    v_rid := 1;  -- fallback para sesiones antiguas sin prefijo
  END;

  -- Validar que el restaurante existe (evitar FK violation)
  IF NOT EXISTS (SELECT 1 FROM public.restaurante WHERE id = v_rid) THEN
    v_rid := 1;
  END IF;

  NEW.restaurante_id := v_rid;
  RETURN NEW;
END;
$$;

-- ── 3. Crear el trigger ───────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_n8n_chat_set_restaurante_id ON public.n8n_chat_histories;

CREATE TRIGGER trg_n8n_chat_set_restaurante_id
  BEFORE INSERT ON public.n8n_chat_histories
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_n8n_chat_set_restaurante_id();

-- ── 4. Backfill filas existentes sin restaurante_id ──────────────────────────

UPDATE public.n8n_chat_histories
SET restaurante_id = (
  CASE
    WHEN split_part(session_id, '_', 1) ~ '^[0-9]+$'
      AND EXISTS (
        SELECT 1 FROM public.restaurante
        WHERE id = split_part(session_id, '_', 1)::integer
      )
    THEN split_part(session_id, '_', 1)::integer
    ELSE 1
  END
)
WHERE restaurante_id IS NULL;

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────────
-- Verificación post-aplicación:
--
-- -- El trigger existe:
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.n8n_chat_histories'::regclass;
--
-- -- La columna es nullable:
-- SELECT is_nullable FROM information_schema.columns
--  WHERE table_name = 'n8n_chat_histories' AND column_name = 'restaurante_id';
--
-- -- Simular un INSERT sin restaurante_id (debe auto-poblarse desde session_id):
-- INSERT INTO public.n8n_chat_histories (session_id, message)
--   VALUES ('1_test_session', '{"type":"human","data":{"content":"test"}}');
-- SELECT session_id, restaurante_id FROM public.n8n_chat_histories
--  WHERE session_id = '1_test_session';
-- ──────────────────────────────────────────────────────────────────────────────
