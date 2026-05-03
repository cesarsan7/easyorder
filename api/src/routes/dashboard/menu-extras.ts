import { Hono } from 'hono';
import type { Variables } from '../../types.js';
import sql from '../../lib/db.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireAuth } from '../../middleware/auth.js';

const menuExtrasRoutes = new Hono<{ Variables: Variables }>();

menuExtrasRoutes.use('/:slug/*', resolveTenant, requireAuth);

// ----------------------------------------------------------------------------
// GET /dashboard/:slug/menu/extras
//
// Returns all extras for the tenant.
// extra has no sort_order column — ordered by name ASC.
// ----------------------------------------------------------------------------
menuExtrasRoutes.get('/:slug/menu/extras', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  try {
    const rows = await sql<ExtraRow[]>`
      SELECT extra_id, name, price, allergens, is_active, restaurante_id
      FROM extra
      WHERE restaurante_id = ${restaurante_id}
      ORDER BY name ASC
    `;

    return c.json({ extras: rows.map(mapExtra) });

  } catch (err) {
    console.error('[GET /dashboard/:slug/menu/extras] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// POST /dashboard/:slug/menu/extras
//
// Creates a new extra.
// restaurante_id comes exclusively from resolveTenant — never from the body.
//
// Required body fields: name (string, 1-120)
// Optional body fields: price (number >= 0, default 0),
//                       allergens (string, max 200),
//                       is_active (boolean, default true)
// ----------------------------------------------------------------------------
menuExtrasRoutes.post('/:slug/menu/extras', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const raw = body as Record<string, unknown>;

  // --- Validate name ----------------------------------------------------------
  if (
    !('name' in raw) ||
    typeof raw['name'] !== 'string' ||
    raw['name'].trim().length === 0
  ) {
    return c.json({ error: 'name_required', detail: 'name must be a non-empty string' }, 400);
  }
  const name = raw['name'].trim();
  if (name.length > 120) {
    return c.json({ error: 'name_too_long', max_length: 120, received: name.length }, 400);
  }

  // --- Validate price (optional, default 0) ----------------------------------
  let price = 0;
  if ('price' in raw && raw['price'] !== undefined && raw['price'] !== null) {
    if (typeof raw['price'] !== 'number' || !isFinite(raw['price']) || raw['price'] < 0) {
      return c.json({ error: 'invalid_price', detail: 'price must be a non-negative number' }, 400);
    }
    price = raw['price'] as number;
  }

  // --- Validate allergens (optional) -----------------------------------------
  let allergens: string | null = null;
  if ('allergens' in raw && raw['allergens'] !== null && raw['allergens'] !== undefined) {
    if (typeof raw['allergens'] !== 'string') {
      return c.json({ error: 'invalid_allergens', detail: 'must be a string' }, 400);
    }
    const a = raw['allergens'].trim();
    if (a.length > 200) {
      return c.json({ error: 'allergens_too_long', max_length: 200, received: a.length }, 400);
    }
    allergens = a.length > 0 ? a : null;
  }

  // --- Validate is_active (optional, default true) ---------------------------
  let is_active = true;
  if ('is_active' in raw && raw['is_active'] !== undefined) {
    if (typeof raw['is_active'] !== 'boolean') {
      return c.json({ error: 'invalid_is_active', detail: 'must be a boolean' }, 400);
    }
    is_active = raw['is_active'] as boolean;
  }

  try {
    const rows = await sql<ExtraRow[]>`
      INSERT INTO extra (restaurante_id, name, price, allergens, is_active)
      VALUES (${restaurante_id}, ${name}, ${price}, ${allergens}, ${is_active})
      RETURNING extra_id, name, price, allergens, is_active, restaurante_id
    `;

    return c.json(mapExtra(rows[0]), 201);

  } catch (err) {
    console.error('[POST /dashboard/:slug/menu/extras] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PATCH /dashboard/:slug/menu/extras/:extra_id
//
// Updates an existing extra. Verifies tenant ownership before updating.
// All fields are optional but at least one must be provided.
//
// Updatable: name (string, 1-120), price (number >= 0),
//            allergens (string | null), is_active (boolean)
// Not updatable: extra_id, restaurante_id
// ----------------------------------------------------------------------------
menuExtrasRoutes.patch('/:slug/menu/extras/:extra_id', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const extra_id = parsePositiveInt(c.req.param('extra_id'));
  if (extra_id === null) {
    return c.json({ error: 'invalid_extra_id' }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const raw = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if ('name' in raw) {
    if (typeof raw['name'] !== 'string' || raw['name'].trim().length === 0) {
      return c.json({ error: 'invalid_name', detail: 'must be a non-empty string' }, 400);
    }
    const name = raw['name'].trim();
    if (name.length > 120) {
      return c.json({ error: 'name_too_long', max_length: 120, received: name.length }, 400);
    }
    updates['name'] = name;
  }

  if ('price' in raw) {
    if (typeof raw['price'] !== 'number' || !isFinite(raw['price'] as number) || (raw['price'] as number) < 0) {
      return c.json({ error: 'invalid_price', detail: 'must be a non-negative number' }, 400);
    }
    updates['price'] = raw['price'];
  }

  if ('allergens' in raw) {
    // null is accepted to clear allergens
    if (raw['allergens'] !== null) {
      if (typeof raw['allergens'] !== 'string') {
        return c.json({ error: 'invalid_allergens', detail: 'must be a string or null' }, 400);
      }
      if ((raw['allergens'] as string).length > 200) {
        return c.json({ error: 'allergens_too_long', max_length: 200, received: (raw['allergens'] as string).length }, 400);
      }
    }
    updates['allergens'] = raw['allergens'];
  }

  if ('is_active' in raw) {
    if (typeof raw['is_active'] !== 'boolean') {
      return c.json({ error: 'invalid_is_active', detail: 'must be a boolean' }, 400);
    }
    updates['is_active'] = raw['is_active'];
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'no_valid_fields', detail: 'body must include at least one updatable field' }, 400);
  }

  try {
    const rows = await sql<ExtraRow[]>`
      UPDATE extra
      SET ${sql(updates)}
      WHERE extra_id       = ${extra_id}
        AND restaurante_id = ${restaurante_id}
      RETURNING extra_id, name, price, allergens, is_active, restaurante_id
    `;

    if (rows.length === 0) {
      return c.json({ error: 'extra_not_found' }, 404);
    }

    return c.json(mapExtra(rows[0]));

  } catch (err) {
    console.error('[PATCH /dashboard/:slug/menu/extras/:extra_id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// DELETE /dashboard/:slug/menu/extras/:extra_id
//
// Soft-deletes an extra by setting is_active = false. Never issues a
// physical DELETE. Verifies tenant ownership via restaurante_id.
// ----------------------------------------------------------------------------
menuExtrasRoutes.delete('/:slug/menu/extras/:extra_id', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const extra_id = parsePositiveInt(c.req.param('extra_id'));
  if (extra_id === null) {
    return c.json({ error: 'invalid_extra_id' }, 400);
  }

  try {
    const rows = await sql<ExtraRow[]>`
      UPDATE extra
      SET is_active = false
      WHERE extra_id       = ${extra_id}
        AND restaurante_id = ${restaurante_id}
      RETURNING extra_id, name, price, allergens, is_active, restaurante_id
    `;

    if (rows.length === 0) {
      return c.json({ error: 'extra_not_found' }, 404);
    }

    return c.json(mapExtra(rows[0]));

  } catch (err) {
    console.error('[DELETE /dashboard/:slug/menu/extras/:extra_id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ExtraRow {
  extra_id:       number;
  name:           string;
  price:          string;   // postgres returns numeric as string
  allergens:      string | null;
  is_active:      boolean;
  restaurante_id: number;
}

function mapExtra(row: ExtraRow) {
  return {
    extra_id:  Number(row.extra_id),
    name:      row.name,
    price:     parseFloat(row.price),
    allergens: row.allergens ?? null,
    is_active: row.is_active,
  };
}

function parsePositiveInt(param: string | undefined): number | null {
  if (!param) return null;
  const n = parseInt(param, 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export default menuExtrasRoutes;
