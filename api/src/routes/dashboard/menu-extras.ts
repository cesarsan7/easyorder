import { Hono } from 'hono';
import type { Variables } from '../../types.js';
import sql from '../../lib/db.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireAuth } from '../../middleware/auth.js';

const menuExtrasRoutes = new Hono<{ Variables: Variables }>();

menuExtrasRoutes.use('/:slug/*', resolveTenant, requireAuth);

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

menuExtrasRoutes.post('/:slug/menu/extras', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: 'invalid_body' }, 400);
  const raw = body as Record<string, unknown>;

  if (!('name' in raw) || typeof raw['name'] !== 'string' || raw['name'].trim().length === 0)
    return c.json({ error: 'name_required', detail: 'name must be a non-empty string' }, 400);
  const name = raw['name'].trim();
  if (name.length > 120) return c.json({ error: 'name_too_long', max_length: 120, received: name.length }, 400);

  let price = 0;
  if ('price' in raw && raw['price'] !== undefined && raw['price'] !== null) {
    if (typeof raw['price'] !== 'number' || !isFinite(raw['price']) || raw['price'] < 0)
      return c.json({ error: 'invalid_price', detail: 'price must be a non-negative number' }, 400);
    price = raw['price'] as number;
  }

  let allergens: string | null = null;
  if ('allergens' in raw && raw['allergens'] !== null && raw['allergens'] !== undefined) {
    if (typeof raw['allergens'] !== 'string') return c.json({ error: 'invalid_allergens', detail: 'must be a string' }, 400);
    const a = raw['allergens'].trim();
    if (a.length > 200) return c.json({ error: 'allergens_too_long', max_length: 200, received: a.length }, 400);
    allergens = a.length > 0 ? a : null;
  }

  let is_active = true;
  if ('is_active' in raw && raw['is_active'] !== undefined) {
    if (typeof raw['is_active'] !== 'boolean') return c.json({ error: 'invalid_is_active', detail: 'must be a boolean' }, 400);
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

menuExtrasRoutes.patch('/:slug/menu/extras/:extra_id', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const extra_id = parsePositiveInt(c.req.param('extra_id'));
  if (extra_id === null) return c.json({ error: 'invalid_extra_id' }, 400);

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: 'invalid_body' }, 400);

  const raw = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if ('name' in raw) {
    if (typeof raw['name'] !== 'string' || raw['name'].trim().length === 0)
      return c.json({ error: 'invalid_name', detail: 'must be a non-empty string' }, 400);
    const name = raw['name'].trim();
    if (name.length > 120) return c.json({ error: 'name_too_long', max_length: 120, received: name.length }, 400);
    updates['name'] = name;
  }
  if ('price' in raw) {
    if (typeof raw['price'] !== 'number' || !isFinite(raw['price'] as number) || (raw['price'] as number) < 0)
      return c.json({ error: 'invalid_price', detail: 'must be a non-negative number' }, 400);
    updates['price'] = raw['price'];
  }
  if ('allergens' in raw) {
    if (raw['allergens'] !== null) {
      if (typeof raw['allergens'] !== 'string') return c.json({ error: 'invalid_allergens', detail: 'must be a string or null' }, 400);
      if ((raw['allergens'] as string).length > 200) return c.json({ error: 'allergens_too_long', max_length: 200, received: (raw['allergens'] as string).length }, 400);
    }
    updates['allergens'] = raw['allergens'];
  }
  if ('is_active' in raw) {
    if (typeof raw['is_active'] !== 'boolean') return c.json({ error: 'invalid_is_active', detail: 'must be a boolean' }, 400);
    updates['is_active'] = raw['is_active'];
  }
  if (Object.keys(updates).length === 0) return c.json({ error: 'no_valid_fields', detail: 'body must include at least one updatable field' }, 400);

  try {
    const rows = await sql<ExtraRow[]>`
      UPDATE extra SET ${sql(updates)}
      WHERE extra_id = ${extra_id} AND restaurante_id = ${restaurante_id}
      RETURNING extra_id, name, price, allergens, is_active, restaurante_id
    `;
    if (rows.length === 0) return c.json({ error: 'extra_not_found' }, 404);
    return c.json(mapExtra(rows[0]));
  } catch (err) {
    console.error('[PATCH /dashboard/:slug/menu/extras/:extra_id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

menuExtrasRoutes.delete('/:slug/menu/extras/:extra_id', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const extra_id = parsePositiveInt(c.req.param('extra_id'));
  if (extra_id === null) return c.json({ error: 'invalid_extra_id' }, 400);

  try {
    const rows = await sql<ExtraRow[]>`
      UPDATE extra SET is_active = false
      WHERE extra_id = ${extra_id} AND restaurante_id = ${restaurante_id}
      RETURNING extra_id, name, price, allergens, is_active, restaurante_id
    `;
    if (rows.length === 0) return c.json({ error: 'extra_not_found' }, 404);
    return c.json(mapExtra(rows[0]));
  } catch (err) {
    console.error('[DELETE /dashboard/:slug/menu/extras/:extra_id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// M-17: Extras vinculados por categoría
// GET  /:slug/menu/categories/:category_id/extras
// PUT  /:slug/menu/categories/:category_id/extras
// ----------------------------------------------------------------------------

menuExtrasRoutes.get('/:slug/menu/categories/:category_id/extras', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const category_id    = parsePositiveInt(c.req.param('category_id'));
  if (!category_id) return c.json({ error: 'invalid_category_id' }, 400);

  try {
    const catRows = await sql<{ menu_category_id: number }[]>`
      SELECT menu_category_id FROM menu_category
      WHERE  menu_category_id = ${category_id}
        AND  restaurante_id   = ${restaurante_id}
      LIMIT  1
    `;
    if (!catRows[0]) return c.json({ error: 'category_not_found' }, 404);

    const rows = await sql<{ extra_id: number; name: string; price: string; allergens: string | null; linked: boolean }[]>`
      SELECT
        e.extra_id,
        e.name,
        e.price,
        e.allergens,
        EXISTS (
          SELECT 1 FROM menu_category_extra mce
          WHERE  mce.extra_id         = e.extra_id
            AND  mce.menu_category_id = ${category_id}
        ) AS linked
      FROM   extra e
      WHERE  e.restaurante_id = ${restaurante_id}
        AND  e.is_active      = true
      ORDER  BY e.name ASC
    `;

    return c.json({
      category_id,
      extras: rows.map(r => ({
        extra_id:  Number(r.extra_id),
        name:      r.name,
        price:     parseFloat(r.price),
        allergens: r.allergens ?? null,
        linked:    r.linked,
      })),
    });
  } catch (err) {
    console.error('[GET /:slug/menu/categories/:category_id/extras]', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

menuExtrasRoutes.put('/:slug/menu/categories/:category_id/extras', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const category_id    = parsePositiveInt(c.req.param('category_id'));
  if (!category_id) return c.json({ error: 'invalid_category_id' }, 400);

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: 'invalid_body' }, 400);
  const raw = body as Record<string, unknown>;

  if (
    !Array.isArray(raw['extra_ids']) ||
    (raw['extra_ids'] as unknown[]).some(id => typeof id !== 'number' || !Number.isInteger(id) || (id as number) < 1)
  ) {
    return c.json({ error: 'extra_ids must be an array of positive integers' }, 400);
  }
  const extra_ids = raw['extra_ids'] as number[];

  try {
    const catRows = await sql<{ menu_category_id: number }[]>`
      SELECT menu_category_id FROM menu_category
      WHERE  menu_category_id = ${category_id}
        AND  restaurante_id   = ${restaurante_id}
      LIMIT  1
    `;
    if (!catRows[0]) return c.json({ error: 'category_not_found' }, 404);

    if (extra_ids.length > 0) {
      const validRows = await sql<{ extra_id: number }[]>`
        SELECT extra_id FROM extra WHERE restaurante_id = ${restaurante_id}
      `;
      const validSet = new Set(validRows.map(r => Number(r.extra_id)));
      const invalid  = extra_ids.filter(id => !validSet.has(id));
      if (invalid.length > 0) return c.json({ error: 'invalid_extra_ids', invalid }, 400);
    }

    await sql.begin(async (tx) => {
      await tx`DELETE FROM menu_category_extra WHERE menu_category_id = ${category_id}`;
      if (extra_ids.length > 0) {
        const rows = extra_ids.map(id => ({ menu_category_id: category_id, extra_id: id }));
        await tx`INSERT INTO menu_category_extra ${tx(rows, 'menu_category_id', 'extra_id')} ON CONFLICT DO NOTHING`;
      }
    });

    return c.json({ ok: true, category_id, extra_ids });
  } catch (err) {
    console.error('[PUT /:slug/menu/categories/:category_id/extras]', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ExtraRow {
  extra_id:       number;
  name:           string;
  price:          string;
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