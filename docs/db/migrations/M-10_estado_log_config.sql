-- =============================================================================
-- M-10: pedido_estado_log + trigger + config keys
-- =============================================================================
-- Contexto:
--   REQ 4 — trazabilidad de transiciones de estado de pedidos.
--   Registra cada cambio de estado con origen y actor para analítica operativa.
--   Se agregan también dos config keys para gestionar retención y polling.
--
-- Impacto:
--   - Solo lectura existente en ningún flujo (tabla nueva).
--   - Trigger AFTER UPDATE on pedidos — no bloquea escrituras.
--   - Compatible con todos los estados existentes y con el nuevo 'expirado'.
--
-- Reversión (rollback):
--   DROP TRIGGER IF EXISTS trg_log_estado_pedido ON public.pedidos;
--   DROP FUNCTION IF EXISTS public.fn_log_estado_pedido();
--   DROP TABLE IF EXISTS public.pedido_estado_log;
--   DELETE FROM public.restaurante_config
--     WHERE config_key IN ('log_retention_days','dashboard_polling_seconds');
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabla pedido_estado_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pedido_estado_log (
  id              BIGSERIAL    PRIMARY KEY,
  pedido_id       INTEGER      NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  restaurante_id  INTEGER      NOT NULL,
  estado_anterior TEXT,                          -- NULL en la primera transición
  estado_nuevo    TEXT         NOT NULL,
  origen          TEXT         NOT NULL DEFAULT 'trigger',
  -- 'dashboard' | 'n8n' | 'cron' | 'api' | 'trigger' | 'cliente'
  actor           TEXT,
  -- user email (dashboard) | 'sistema' | telefono (cliente) | NULL
  motivo          TEXT,
  -- contexto libre: 'ventana_expirada', 'derivar_humano', 'cron_expiry', etc.
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Índices para queries analíticas y de timeline
CREATE INDEX IF NOT EXISTS idx_estado_log_pedido
  ON public.pedido_estado_log (pedido_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_estado_log_restaurante
  ON public.pedido_estado_log (restaurante_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_estado_log_estado_nuevo
  ON public.pedido_estado_log (restaurante_id, estado_nuevo, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Función del trigger
--    Lee el origen y actor desde variables de sesión si están disponibles.
--    La API puede hacer: SET LOCAL app.origen = 'dashboard'; SET LOCAL app.actor = 'user@email.com';
--    antes del UPDATE para enriquecer el log con contexto real.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_log_estado_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_origen TEXT;
  v_actor  TEXT;
BEGIN
  -- Solo loguear si el estado realmente cambió
  IF OLD.estado IS NOT DISTINCT FROM NEW.estado THEN
    RETURN NEW;
  END IF;

  -- Leer contexto de sesión si fue seteado por la capa de aplicación
  BEGIN
    v_origen := current_setting('app.origen', true);
  EXCEPTION WHEN OTHERS THEN
    v_origen := NULL;
  END;

  BEGIN
    v_actor := current_setting('app.actor', true);
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  INSERT INTO public.pedido_estado_log (
    pedido_id,
    restaurante_id,
    estado_anterior,
    estado_nuevo,
    origen,
    actor,
    created_at
  ) VALUES (
    NEW.id,
    NEW.restaurante_id,
    OLD.estado,
    NEW.estado,
    COALESCE(NULLIF(v_origen, ''), 'trigger'),
    NULLIF(v_actor, ''),
    NOW()
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Trigger en tabla pedidos
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_log_estado_pedido ON public.pedidos;

CREATE TRIGGER trg_log_estado_pedido
  AFTER UPDATE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_log_estado_pedido();

-- ---------------------------------------------------------------------------
-- 4. Config keys nuevas
--    log_retention_days       → días de retención del historial de estados
--    dashboard_polling_seconds → intervalo de polling del dashboard
-- ---------------------------------------------------------------------------
INSERT INTO public.restaurante_config
  (config_key, config_value, description, restaurante_id, updated_at)
VALUES
  (
    'log_retention_days',
    '90',
    'Días de retención del historial de transiciones de estado de pedidos (pedido_estado_log)',
    1,
    NOW()
  ),
  (
    'dashboard_polling_seconds',
    '30',
    'Intervalo en segundos para el polling de notificaciones en el dashboard',
    1,
    NOW()
  )
ON CONFLICT (config_key, restaurante_id) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description  = EXCLUDED.description,
      updated_at   = NOW();
-- Nota: el PK real de restaurante_config es (config_key, restaurante_id) compuesto,
-- aunque el DDL documentado muestra solo (config_key). La BD real tiene PK compuesto.

-- ---------------------------------------------------------------------------
-- 5. Verificación post-migración
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table_exists  BOOLEAN;
  v_trigger_exists BOOLEAN;
  v_config_count  INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pedido_estado_log'
  ) INTO v_table_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_log_estado_pedido'
  ) INTO v_trigger_exists;

  SELECT COUNT(*) INTO v_config_count
  FROM public.restaurante_config
  WHERE config_key IN ('log_retention_days', 'dashboard_polling_seconds');

  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'M-10 FAILED: tabla pedido_estado_log no fue creada';
  END IF;
  IF NOT v_trigger_exists THEN
    RAISE EXCEPTION 'M-10 FAILED: trigger trg_log_estado_pedido no fue creado';
  END IF;
  IF v_config_count < 2 THEN
    RAISE EXCEPTION 'M-10 FAILED: config keys incompletas (encontradas: %)', v_config_count;
  END IF;

  RAISE NOTICE 'M-10 OK: tabla ✓  trigger ✓  config keys ✓';
END;
$$;
