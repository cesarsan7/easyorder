-- ─────────────────────────────────────────────────────────────────────────────
-- M-28: Función delete_restaurante(p_id, p_nombre)
-- ─────────────────────────────────────────────────────────────────────────────
-- OBJETIVO
--   Eliminar un restaurante y todos sus datos relacionados de forma segura
--   y atómica. Solo se necesita uno de los dos parámetros (id o nombre).
--
-- TABLAS AFECTADAS (en orden de dependencia):
--
--   1. Eliminación explícita (FK sin CASCADE o sin FK formal):
--      - public.menu_item_extra        → FK a menu_item (sin CASCADE)
--      - public.menu_item              → FK a restaurante via restaurante_id
--      - public.menu_variant           → FK a restaurante via restaurante_id
--      - public.menu_category          → FK a restaurante via restaurante_id
--      - public.extra                  → FK a restaurante via restaurante_id
--      - public.delivery_zone          → FK a restaurante via restaurante_id
--      - public.restaurante_config     → FK a restaurante via restaurante_id
--
--   2. ON DELETE CASCADE (auto-eliminadas al borrar restaurante):
--      - public.config_operativa
--      - public.contexto
--      - public.faqs
--      - public.horarios
--      - public.horario_atencion       (M-7)
--      - public.usuarios
--      - public.pedidos
--      - public.local_memberships      (M-8)
--      - public.n8n_chat_histories     (M-21)
--
-- SEGURO: La función es idempotente en errores (RAISE EXCEPTION hace rollback).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_restaurante(
  p_id     INT  DEFAULT NULL,
  p_nombre TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_id     INT;
  v_nombre TEXT;
BEGIN
  -- Validar que al menos un parámetro fue provisto
  IF p_id IS NULL AND (p_nombre IS NULL OR trim(p_nombre) = '') THEN
    RAISE EXCEPTION 'Se requiere p_id o p_nombre para identificar el restaurante';
  END IF;

  -- Resolver id
  SELECT id, nombre
    INTO v_id, v_nombre
    FROM public.restaurante
   WHERE (p_id     IS NOT NULL AND id     = p_id)
      OR (p_nombre IS NOT NULL AND nombre = trim(p_nombre))
   LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Restaurante no encontrado: id=%, nombre=%', p_id, p_nombre;
  END IF;

  RAISE NOTICE 'Eliminando restaurante id=% nombre="%"', v_id, v_nombre;

  -- ── 1. menu_item_extra (depende de menu_item) ─────────────────────────────
  DELETE FROM public.menu_item_extra
   WHERE menu_item_id IN (
     SELECT menu_item_id FROM public.menu_item WHERE restaurante_id = v_id
   );

  -- ── 2. menu_item ──────────────────────────────────────────────────────────
  DELETE FROM public.menu_item     WHERE restaurante_id = v_id;

  -- ── 3. menu_variant ───────────────────────────────────────────────────────
  DELETE FROM public.menu_variant  WHERE restaurante_id = v_id;

  -- ── 4. menu_category ──────────────────────────────────────────────────────
  DELETE FROM public.menu_category WHERE restaurante_id = v_id;

  -- ── 5. extra ──────────────────────────────────────────────────────────────
  DELETE FROM public.extra         WHERE restaurante_id = v_id;

  -- ── 6. delivery_zone ──────────────────────────────────────────────────────
  DELETE FROM public.delivery_zone WHERE restaurante_id = v_id;

  -- ── 7. restaurante_config ─────────────────────────────────────────────────
  DELETE FROM public.restaurante_config WHERE restaurante_id = v_id;

  -- ── 8. Eliminar el restaurante (CASCADE borra el resto) ───────────────────
  DELETE FROM public.restaurante WHERE id = v_id;

  RETURN format('Restaurante id=%s nombre="%s" eliminado correctamente', v_id, v_nombre);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- USO
-- ─────────────────────────────────────────────────────────────────────────────
-- Por id:
--   SELECT public.delete_restaurante(p_id => 4);
--
-- Por nombre:
--   SELECT public.delete_restaurante(p_nombre => 'test');
--
-- VERIFICACIÓN POST-EJECUCIÓN:
--   SELECT id, nombre FROM public.restaurante;
-- ─────────────────────────────────────────────────────────────────────────────
