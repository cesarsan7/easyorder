-- M-20: Llevar a Mesa — zonas, mesas y asignación desde dashboard
-- ============================================================

-- 1. Zonas de mesa (interior, exterior, sala 1, terraza, etc.)
CREATE TABLE IF NOT EXISTS public.zona_mesa (
  id             BIGSERIAL PRIMARY KEY,
  restaurante_id BIGINT       NOT NULL REFERENCES public.restaurante(id) ON DELETE CASCADE,
  nombre         VARCHAR(80)  NOT NULL,
  orden          SMALLINT     NOT NULL DEFAULT 0,
  activa         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (restaurante_id, nombre)
);
COMMENT ON TABLE public.zona_mesa IS 'Zonas de servicio a mesa (interior, exterior, sala 1, terraza…)';

-- 2. Mesas
CREATE TABLE IF NOT EXISTS public.mesa (
  id             BIGSERIAL PRIMARY KEY,
  restaurante_id BIGINT       NOT NULL REFERENCES public.restaurante(id) ON DELETE CASCADE,
  zona_id        BIGINT       REFERENCES public.zona_mesa(id) ON DELETE SET NULL,
  numero         SMALLINT     NOT NULL,
  nombre         VARCHAR(80)  NOT NULL,           -- ej: "Mesa 3", "Terraza A", "Barra 1"
  capacidad      SMALLINT,                        -- nº de comensales (opcional)
  activa         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (restaurante_id, numero)
);
COMMENT ON TABLE public.mesa IS 'Mesas del restaurante, agrupadas por zona';

-- 3. Columna mesa_id en pedidos
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS mesa_id BIGINT REFERENCES public.mesa(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.pedidos.mesa_id IS
  'Mesa asignada por el operador. NULL cuando tipo_despacho != mesa o aún no asignada.';

-- 4. Toggle de servicio a mesa en la config del restaurante
ALTER TABLE public.restaurante
  ADD COLUMN IF NOT EXISTS servicio_mesa_habilitado BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN public.restaurante.servicio_mesa_habilitado IS
  'Habilita el tipo de despacho "llevar a mesa" para este restaurante.';

-- 5. Índices útiles
CREATE INDEX IF NOT EXISTS idx_mesa_restaurante  ON public.mesa(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mesa_zona         ON public.mesa(zona_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_id   ON public.pedidos(mesa_id);
