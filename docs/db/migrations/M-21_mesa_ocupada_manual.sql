-- M-21: agregar columna ocupada_manual a mesa
-- Permite marcar manualmente una mesa como ocupada desde el dashboard
ALTER TABLE public.mesa
  ADD COLUMN IF NOT EXISTS ocupada_manual boolean NOT NULL DEFAULT false;
