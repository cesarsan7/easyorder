-- M-7: horario_atencion
--
-- New table replacing the legacy `horarios` table for the SaaS dashboard.
-- One row per day of the week per tenant, with a simple open/close pair and
-- an is_open flag. Midnight-crossing schedules are supported: a row where
-- hora_cierre < hora_apertura (e.g. 22:00 to 02:00) is treated as crossing
-- midnight by the application layer — no DB constraint enforces direction.
--
-- dia_semana: 0 = Sunday … 6 = Saturday (ISO-compatible, same as JS Date.getDay())

CREATE TABLE IF NOT EXISTS public.horario_atencion (
  id              SERIAL PRIMARY KEY,
  restaurante_id  INT4 NOT NULL
    REFERENCES public.restaurante(id) ON DELETE CASCADE,
  dia_semana      INT2 NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_apertura   TIME,
  hora_cierre     TIME,
  is_open         BOOL NOT NULL DEFAULT true,
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT horario_atencion_tenant_day_unique
    UNIQUE (restaurante_id, dia_semana)
);

CREATE INDEX IF NOT EXISTS idx_horario_atencion_restaurante
  ON public.horario_atencion (restaurante_id);
