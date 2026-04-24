import { Hono } from 'hono';
import type { Variables } from '../../types.js';
import sql from '../../lib/db.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireAuth } from '../../middleware/auth.js';

const hoursRoutes = new Hono<{ Variables: Variables }>();

hoursRoutes.use('/:slug/*', resolveTenant, requireAuth);

// All 7 days of the week (0 = Sunday … 6 = Saturday).
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ----------------------------------------------------------------------------
// GET /dashboard/:slug/hours
//
// Returns all 7 days. Days without a DB row are filled with is_open: false
// and null times so the frontend always receives a stable 7-element array.
// ----------------------------------------------------------------------------
hoursRoutes.get('/:slug/hours', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  try {
    const rows = await sql<HoraRow[]>`
      SELECT dia_semana, hora_apertura, hora_cierre, is_open
      FROM horario_atencion
      WHERE restaurante_id = ${restaurante_id}
      ORDER BY dia_semana ASC
    `;

    const byDay = new Map<number, HoraRow>();
    for (const row of rows) byDay.set(row.dia_semana, row);

    const result = ALL_DAYS.map((day) => {
      const row = byDay.get(day);
      return row
        ? mapHora(row)
        : { dia_semana: day, hora_apertura: null, hora_cierre: null, is_open: false };
    });

    return c.json({ hours: result });

  } catch (err) {
    console.error('[GET /dashboard/:slug/hours] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PUT /dashboard/:slug/hours
//
// Accepts an array of up to 7 schedule objects. Each object is UPSERTed by
// (restaurante_id, dia_semana). After the upsert, returns all 7 days.
//
// Time validation rules:
//   - hora_apertura and hora_cierre must match HH:MM (00:00 – 23:59).
//   - hora_cierre !== hora_apertura (identical times are meaningless).
//   - hora_cierre > hora_apertura  → normal day schedule (e.g. 09:00 – 22:00).
//   - hora_cierre < hora_apertura  → midnight-crossing schedule, also valid
//     (e.g. 22:00 – 02:00). The application layer handles the cross-day logic.
//   - When is_open is false, hour values are stored as-is without validation.
// ----------------------------------------------------------------------------
hoursRoutes.put('/:slug/hours', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  if (!Array.isArray(body)) {
    return c.json({ error: 'body_must_be_array', detail: 'expected an array of schedule objects' }, 400);
  }

  if (body.length === 0 || body.length > 7) {
    return c.json({ error: 'invalid_array_length', detail: 'array must have 1 to 7 elements' }, 400);
  }

  const validated: ValidatedHora[] = [];

  for (let i = 0; i < body.length; i++) {
    const item = body[i] as Record<string, unknown>;
    const prefix = `item[${i}]`;

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return c.json({ error: 'invalid_item', index: i }, 400);
    }

    // --- dia_semana --------------------------------------------------------
    if (!('dia_semana' in item) || !Number.isInteger(item['dia_semana'])) {
      return c.json({ error: 'dia_semana_required', detail: `${prefix}.dia_semana must be an integer`, index: i }, 400);
    }
    const dia_semana = item['dia_semana'] as number;
    if (dia_semana < 0 || dia_semana > 6) {
      return c.json({ error: 'dia_semana_out_of_range', detail: `${prefix}.dia_semana must be 0 (Sun) to 6 (Sat)`, index: i }, 400);
    }

    // --- is_open -----------------------------------------------------------
    if (!('is_open' in item) || typeof item['is_open'] !== 'boolean') {
      return c.json({ error: 'is_open_required', detail: `${prefix}.is_open must be a boolean`, index: i }, 400);
    }
    const is_open = item['is_open'] as boolean;

    // --- hora_apertura / hora_cierre --------------------------------------
    let hora_apertura: string | null = null;
    let hora_cierre: string | null = null;

    if ('hora_apertura' in item && item['hora_apertura'] !== null && item['hora_apertura'] !== undefined) {
      if (typeof item['hora_apertura'] !== 'string' || !TIME_RE.test(item['hora_apertura'] as string)) {
        return c.json({ error: 'invalid_hora_apertura', detail: `${prefix}.hora_apertura must be HH:MM`, index: i }, 400);
      }
      hora_apertura = item['hora_apertura'] as string;
    }

    if ('hora_cierre' in item && item['hora_cierre'] !== null && item['hora_cierre'] !== undefined) {
      if (typeof item['hora_cierre'] !== 'string' || !TIME_RE.test(item['hora_cierre'] as string)) {
        return c.json({ error: 'invalid_hora_cierre', detail: `${prefix}.hora_cierre must be HH:MM`, index: i }, 400);
      }
      hora_cierre = item['hora_cierre'] as string;
    }

    // Validate time logic only when the day is open and both times are provided.
    if (is_open && hora_apertura !== null && hora_cierre !== null) {
      if (hora_apertura === hora_cierre) {
        return c.json({
          error:  'identical_times',
          detail: `${prefix}: hora_apertura and hora_cierre cannot be the same`,
          index: i,
        }, 400);
      }
      // hora_cierre > hora_apertura → normal schedule.
      // hora_cierre < hora_apertura → midnight-crossing schedule — both are valid.
    }

    // Duplicate dia_semana within the same payload.
    if (validated.some((v) => v.dia_semana === dia_semana)) {
      return c.json({ error: 'duplicate_dia_semana', detail: `${prefix}: dia_semana ${dia_semana} appears more than once`, index: i }, 400);
    }

    validated.push({ dia_semana, hora_apertura, hora_cierre, is_open });
  }

  try {
    if (validated.length > 0) {
      const insertRows = validated.map((v) => ({
        restaurante_id,
        dia_semana:    v.dia_semana,
        hora_apertura: v.hora_apertura,
        hora_cierre:   v.hora_cierre,
        is_open:       v.is_open,
      }));

      await sql`
        INSERT INTO horario_atencion
          ${sql(insertRows, 'restaurante_id', 'dia_semana', 'hora_apertura', 'hora_cierre', 'is_open')}
        ON CONFLICT (restaurante_id, dia_semana)
        DO UPDATE SET
          hora_apertura = EXCLUDED.hora_apertura,
          hora_cierre   = EXCLUDED.hora_cierre,
          is_open       = EXCLUDED.is_open,
          updated_at    = NOW()
      `;
    }

    // Return the full 7-day schedule after the upsert.
    const rows = await sql<HoraRow[]>`
      SELECT dia_semana, hora_apertura, hora_cierre, is_open
      FROM horario_atencion
      WHERE restaurante_id = ${restaurante_id}
      ORDER BY dia_semana ASC
    `;

    const byDay = new Map<number, HoraRow>();
    for (const row of rows) byDay.set(row.dia_semana, row);

    const result = ALL_DAYS.map((day) => {
      const row = byDay.get(day);
      return row
        ? mapHora(row)
        : { dia_semana: day, hora_apertura: null, hora_cierre: null, is_open: false };
    });

    return c.json({ hours: result });

  } catch (err) {
    console.error('[PUT /dashboard/:slug/hours] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface HoraRow {
  dia_semana:    number;
  hora_apertura: string | null;
  hora_cierre:   string | null;
  is_open:       boolean;
}

interface ValidatedHora {
  dia_semana:    number;
  hora_apertura: string | null;
  hora_cierre:   string | null;
  is_open:       boolean;
}

function mapHora(row: HoraRow) {
  return {
    dia_semana:    row.dia_semana,
    hora_apertura: row.hora_apertura ?? null,
    hora_cierre:   row.hora_cierre ?? null,
    is_open:       row.is_open,
  };
}

export default hoursRoutes;
