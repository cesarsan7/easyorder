import { Hono } from 'hono';
import type { Variables } from '../../types.js';
import sql from '../../lib/db.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireAuth } from '../../middleware/auth.js';

const menuVariantsRoutes = new Hono<{ Variables: Variables }>();

menuVariantsRoutes.use('/:slug/*', resolveTenant, requireAuth);

// ----------------------------------------------------------------------------
// GET /dashboard/:slug/menu/items/:item_id/variants
//
// Returns all variants for a given menu item. Verifies item belongs to the
// tenant before querying variants.
//
// Ordered by is_default DESC NULLS LAST (default variant first), then
// variant_name ASC. menu_variant has no sort_order column.
// ----------------------------------------------------------------------------
menuVariantsRoutes.get('/:slug/menu/items/:item_id/variants', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const item_id = parsePositiveInt(c.req.param('item_id'));
  if (item_id === null) {
    return c.json({ error: 'invalid_item_id' }, 400);
  }

  try {
    const itemRows = await sql<{ menu_item_id: number }[]>`
      SELECT menu_item_id
      FROM menu_item
      WHERE menu_item_id  = ${item_id}
        AND restaurante_id = ${restaurante_id}
      LIMIT 1
    `;

    if (itemRows.length === 0) {
      return c.json({ error: 'item_not_found' }, 404);
    }

    const rows = await sql<VariantRow[]>`
      SELECT
        menu_variant_id,
        menu_item_id,
        variant_name,
        price,
        sku,
        is_default,
        is_active,
        restaurante_id
      FROM menu_variant
      WHERE menu_item_id  = ${item_id}
        AND restaurante_id = ${restaurante_id}
      ORDER BY is_default DESC NULLS LAST, variant_name ASC
    `;

    return c.json({ variants: rows.map(mapVariant) });

  } catch (err) {
    console.error('[GET /dashboard/:slug/menu/items/:item_id/variants] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// POST /dashboard/:slug/menu/items/:item_id/variants
//
// Creates a new variant under the given menu item.
// restaurante_id comes exclusively from resolveTenant — never from the body.
//
// Required body fields: variant_name (string, 1-80), price (number >= 0)
// Optional body fields: sku (string, max 50), is_default (boolean),
//                       is_active (boolean, default true)
// ----------------------------------------------------------------------------
menuVariantsRoutes.post('/:slug/menu/items/:item_id/variants', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const item_id = parsePositiveInt(c.req.param('item_id'));
  if (item_id === null) {
    return c.json({ error: 'invalid_item_id' }, 400);
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

  // --- Validate variant_name --------------------------------------------------
  if (
    !('variant_name' in raw) ||
    typeof raw['variant_name'] !== 'string' ||
    raw['variant_name'].trim().length === 0
  ) {
    return c.json({ error: 'variant_name_required', detail: 'variant_name must be a non-empty string' }, 400);
  }
  const variant_name = raw['variant_name'].trim();
  if (variant_name.length > 80) {
    return c.json({ error: 'variant_name_too_long', max_length: 80, received: variant_name.length }, 400);
  }

  // --- Validate price ---------------------------------------------------------
  if (!('price' in raw) || typeof raw['price'] !== 'number' || !isFinite(raw['price']) || raw['price'] < 0) {
    return c.json({ error: 'price_required', detail: 'price must be a non-negative number' }, 400);
  }
  const price = raw['price'] as number;

  // --- Validate sku (optional) ------------------------------------------------
  let sku: string | null = null;
  if ('sku' in raw && raw['sku'] !== null && raw['sku'] !== undefined) {
    if (typeof raw['sku'] !== 'string') {
      return c.json({ error: 'invalid_sku', detail: 'must be a string' }, 400);
    }
    const s = raw['sku'].trim();
    if (s.length > 50) {
      return c.json({ error: 'sku_too_long', max_length: 50, received: s.length }, 400);
    }
    sku = s.length > 0 ? s : null;
  }

  // --- Validate is_default (optional, default false) -------------------------
  let is_default = false;
  if ('is_default' in raw && raw['is_default'] !== undefined) {
    if (typeof raw['is_default'] !== 'boolean') {
      return c.json({ error: 'invalid_is_default', detail: 'must be a boolean' }, 400);
    }
    is_default = raw['is_default'] as boolean;
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
    const itemRows = await sql<{ menu_item_id: number }[]>`
      SELECT menu_item_id
      FROM menu_item
      WHERE menu_item_id  = ${item_id}
        AND restaurante_id = ${restaurante_id}
      LIMIT 1
    `;

    if (itemRows.length === 0) {
      return c.json({ error: 'item_not_found' }, 404);
    }

    const rows = await sql<VariantRow[]>`
      INSERT INTO menu_variant
        (restaurante_id, menu_item_id, variant_name, price, sku, is_default, is_active)
      VALUES
        (${restaurante_id}, ${item_id}, ${variant_name}, ${price}, ${sku}, ${is_default}, ${is_active})
      RETURNING menu_variant_id, menu_item_id, variant_name, price, sku, is_default, is_active, restaurante_id
    `;

    return c.json(mapVariant(rows[0]), 201);

  } catch (err) {
    console.error('[POST /dashboard/:slug/menu/items/:item_id/variants] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PATCH /dashboard/:slug/menu/items/:item_id/variants/:variant_id
//
// Updates an existing variant. Verifies tenant ownership before updating.
// All fields are optional but at least one must be provided.
//
// Updatable: variant_name (string, 1-80), price (number >= 0),
//            sku (string | null), is_default (boolean), is_active (boolean)
// Not updatable: menu_variant_id, menu_item_id, restaurante_id
// ----------------------------------------------------------------------------
menuVariantsRoutes.patch('/:slug/menu/items/:item_id/variants/:variant_id', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const item_id = parsePositiveInt(c.req.param('item_id'));
  if (item_id === null) {
    return c.json({ error: 'invalid_item_id' }, 400);
  }

  const variant_id = parsePositiveInt(c.req.param('variant_id'));
  if (variant_id === null) {
    return c.json({ error: 'invalid_variant_id' }, 400);
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

  if ('variant_name' in raw) {
    if (typeof raw['variant_name'] !== 'string' || raw['variant_name'].trim().length === 0) {
      return c.json({ error: 'invalid_variant_name', detail: 'must be a non-empty string' }, 400);
    }
    const variant_name = raw['variant_name'].trim();
    if (variant_name.length > 80) {
      return c.json({ error: 'variant_name_too_long', max_length: 80, received: variant_name.length }, 400);
    }
    updates['variant_name'] = variant_name;
  }

  if ('price' in raw) {
    if (typeof raw['price'] !== 'number' || !isFinite(raw['price'] as number) || (raw['price'] as number) < 0) {
      return c.json({ error: 'invalid_price', detail: 'must be a non-negative number' }, 400);
    }
    updates['price'] = raw['price'];
  }

  if ('sku' in raw) {
    // null is accepted to clear sku
    if (raw['sku'] !== null) {
      if (typeof raw['sku'] !== 'string') {
        return c.json({ error: 'invalid_sku', detail: 'must be a string or null' }, 400);
      }
      if ((raw['sku'] as string).length > 50) {
        return c.json({ error: 'sku_too_long', max_length: 50, received: (raw['sku'] as string).length }, 400);
      }
    }
    updates['sku'] = raw['sku'];
  }

  if ('is_default' in raw) {
    if (typeof raw['is_default'] !== 'boolean') {
      return c.json({ error: 'invalid_is_default', detail: 'must be a boolean' }, 400);
    }
    updates['is_default'] = raw['is_default'];
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
    const rows = await sql<VariantRow[]>`
      UPDATE menu_variant
      SET ${sql(updates)}
      WHERE menu_variant_id = ${variant_id}
        AND menu_item_id    = ${item_id}
        AND restaurante_id  = ${restaurante_id}
      RETURNING menu_variant_id, menu_item_id, variant_name, price, sku, is_default, is_active, restaurante_id
    `;

    if (rows.length === 0) {
      return c.json({ error: 'variant_not_found' }, 404);
    }

    return c.json(mapVariant(rows[0]));

  } catch (err) {
    console.error('[PATCH /dashboard/:slug/menu/items/:item_id/variants/:variant_id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// DELETE /dashboard/:slug/menu/items/:item_id/variants/:variant_id
//
// Soft-deletes a variant by setting is_active = false. Never issues a
// physical DELETE. Verifies tenant ownership via restaurante_id + item_id.
// ----------------------------------------------------------------------------
menuVariantsRoutes.delete('/:slug/menu/items/:item_id/variants/:variant_id', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const item_id = parsePositiveInt(c.req.param('item_id'));
  if (item_id === null) {
    return c.json({ error: 'invalid_item_id' }, 400);
  }

  const variant_id = parsePositiveInt(c.req.param('variant_id'));
  if (variant_id === null) {
    return c.json({ error: 'invalid_variant_id' }, 400);
  }

  try {
    const rows = await sql<VariantRow[]>`
      UPDATE menu_variant
      SET is_active = false
      WHERE menu_variant_id = ${variant_id}
        AND menu_item_id    = ${item_id}
        AND restaurante_id  = ${restaurante_id}
      RETURNING menu_variant_id, menu_item_id, variant_name, price, sku, is_default, is_active, restaurante_id
    `;

    if (rows.length === 0) {
      return c.json({ error: 'variant_not_found' }, 404);
    }

    return c.json(mapVariant(rows[0]));

  } catch (err) {
    console.error('[DELETE /dashboard/:slug/menu/items/:item_id/variants/:variant_id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface VariantRow {
  menu_variant_id: number;
  menu_item_id:    number;
  variant_name:    string;
  price:           string;   // postgres returns numeric as string
  sku:             string | null;
  is_default:      boolean;
  is_active:       boolean;
  restaurante_id:  number;
}

function mapVariant(row: VariantRow) {
  return {
    menu_variant_id: row.menu_variant_id,
    menu_item_id:    row.menu_item_id,
    variant_name:    row.variant_name,
    price:           parseFloat(row.price),
    sku:             row.sku ?? null,
    is_default:      row.is_default,
    is_active:       row.is_active,
  };
}

function parsePositiveInt(param: string | undefined): number | null {
  if (!param) return null;
  const n = parseInt(param, 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export default menuVariantsRoutes;
