import { Hono } from 'hono';
import type { Variables } from '../../types.js';
import sql from '../../lib/db.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireAuth } from '../../middleware/auth.js';

const menuItemsRoutes = new Hono<{ Variables: Variables }>();

menuItemsRoutes.use('/:slug/*', resolveTenant, requireAuth);

// ----------------------------------------------------------------------------
// GET /dashboard/:slug/menu/items
//
// Returns all items for the tenant. Ordered by sort_order ASC nulls last,
// then name ASC. Includes category association and image_url (null until
// migration adds the column).
// ----------------------------------------------------------------------------
menuItemsRoutes.get('/:slug/menu/items', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  try {
    const rows = await sql<ItemRow[]>`
      SELECT
        mi.menu_item_id,
        mi.menu_category_id,
        mi.name,
        mi.description,
        mi.is_pizza,
        mi.is_active,
        mi.tags,
        mi.image_url,
        mi.restaurante_id
      FROM menu_item mi
      WHERE mi.restaurante_id = ${restaurante_id}
      ORDER BY mi.name ASC
    `;

    return c.json({ items: rows.map(mapItem) });

  } catch (err) {
    console.error('[GET /dashboard/:slug/menu/items] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// POST /dashboard/:slug/menu/items
//
// Creates a new menu item. restaurante_id comes exclusively from resolveTenant
// — never from the body.
//
// Required body fields: name (string, 1-150), menu_category_id (integer >= 1)
// Optional body fields: description (string, max 500), is_pizza (boolean),
//                       is_active (boolean, default true), tags (string, max 300)
// ----------------------------------------------------------------------------
menuItemsRoutes.post('/:slug/menu/items', async (c) => {
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
  if (!('name' in raw) || typeof raw['name'] !== 'string' || raw['name'].trim().length === 0) {
    return c.json({ error: 'name_required', detail: 'name must be a non-empty string' }, 400);
  }
  const name = raw['name'].trim();
  if (name.length > 150) {
    return c.json({ error: 'name_too_long', max_length: 150, received: name.length }, 400);
  }

  // --- Validate menu_category_id ----------------------------------------------
  if (
    !('menu_category_id' in raw) ||
    !Number.isInteger(raw['menu_category_id']) ||
    (raw['menu_category_id'] as number) < 1
  ) {
    return c.json({ error: 'menu_category_id_required', detail: 'must be a positive integer' }, 400);
  }
  const menu_category_id = raw['menu_category_id'] as number;

  // --- Validate description (optional) ----------------------------------------
  let description: string | null = null;
  if ('description' in raw && raw['description'] !== null && raw['description'] !== undefined) {
    if (typeof raw['description'] !== 'string') {
      return c.json({ error: 'invalid_description', detail: 'must be a string' }, 400);
    }
    const desc = raw['description'].trim();
    if (desc.length > 500) {
      return c.json({ error: 'description_too_long', max_length: 500, received: desc.length }, 400);
    }
    description = desc.length > 0 ? desc : null;
  }

  // --- Validate is_pizza (optional, default false) ---------------------------
  let is_pizza = false;
  if ('is_pizza' in raw && raw['is_pizza'] !== undefined) {
    if (typeof raw['is_pizza'] !== 'boolean') {
      return c.json({ error: 'invalid_is_pizza', detail: 'must be a boolean' }, 400);
    }
    is_pizza = raw['is_pizza'] as boolean;
  }

  // --- Validate is_active (optional, default true) ---------------------------
  let is_active = true;
  if ('is_active' in raw && raw['is_active'] !== undefined) {
    if (typeof raw['is_active'] !== 'boolean') {
      return c.json({ error: 'invalid_is_active', detail: 'must be a boolean' }, 400);
    }
    is_active = raw['is_active'] as boolean;
  }

  // --- Validate tags (optional) -----------------------------------------------
  let tags: string | null = null;
  if ('tags' in raw && raw['tags'] !== null && raw['tags'] !== undefined) {
    if (typeof raw['tags'] !== 'string') {
      return c.json({ error: 'invalid_tags', detail: 'must be a string' }, 400);
    }
    const t = raw['tags'].trim();
    if (t.length > 300) {
      return c.json({ error: 'tags_too_long', max_length: 300, received: t.length }, 400);
    }
    tags = t.length > 0 ? t : null;
  }

  // --- Validate image_url (optional) ------------------------------------------
  let image_url: string | null = null;
  if ('image_url' in raw && raw['image_url'] !== null && raw['image_url'] !== undefined) {
    if (typeof raw['image_url'] !== 'string') {
      return c.json({ error: 'invalid_image_url', detail: 'must be a string or null' }, 400);
    }
    const u = raw['image_url'].trim();
    if (u.length > 500) {
      return c.json({ error: 'image_url_too_long', max_length: 500, received: u.length }, 400);
    }
    image_url = u.length > 0 ? u : null;
  }

  try {
    // Verify menu_category_id belongs to this tenant before inserting.
    const catRows = await sql<{ menu_category_id: number }[]>`
      SELECT menu_category_id
      FROM menu_category
      WHERE menu_category_id = ${menu_category_id}
        AND restaurante_id   = ${restaurante_id}
      LIMIT 1
    `;

    if (catRows.length === 0) {
      return c.json({ error: 'category_not_found', detail: 'menu_category_id does not exist for this restaurant' }, 404);
    }

    const rows = await sql<ItemRow[]>`
      INSERT INTO menu_item
        (restaurante_id, menu_category_id, name, description, is_pizza, is_active, tags, image_url)
      VALUES
        (${restaurante_id}, ${menu_category_id}, ${name}, ${description}, ${is_pizza}, ${is_active}, ${tags}, ${image_url})
      RETURNING menu_item_id, menu_category_id, name, description, is_pizza, is_active, tags, image_url, restaurante_id
    `;

    return c.json(mapItem(rows[0]), 201);

  } catch (err) {
    console.error('[POST /dashboard/:slug/menu/items] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PATCH /dashboard/:slug/menu/items/:item_id
//
// Updates an existing item. Verifies tenant ownership before updating.
// All fields are optional but at least one must be provided.
//
// Updatable: name, menu_category_id, description, is_pizza, is_active, tags
// Not updatable by this endpoint: restaurante_id, menu_item_id
// ----------------------------------------------------------------------------
menuItemsRoutes.patch('/:slug/menu/items/:item_id', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const itemIdParam = c.req.param('item_id');
  const item_id = parseInt(itemIdParam, 10);
  if (!Number.isInteger(item_id) || item_id < 1) {
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
  const updates: Record<string, unknown> = {};

  if ('name' in raw) {
    if (typeof raw['name'] !== 'string' || raw['name'].trim().length === 0) {
      return c.json({ error: 'invalid_name', detail: 'name must be a non-empty string' }, 400);
    }
    const name = raw['name'].trim();
    if (name.length > 150) {
      return c.json({ error: 'name_too_long', max_length: 150, received: name.length }, 400);
    }
    updates['name'] = name;
  }

  if ('menu_category_id' in raw) {
    if (!Number.isInteger(raw['menu_category_id']) || (raw['menu_category_id'] as number) < 1) {
      return c.json({ error: 'invalid_menu_category_id', detail: 'must be a positive integer' }, 400);
    }
    updates['menu_category_id'] = raw['menu_category_id'];
  }

  if ('description' in raw) {
    // null is accepted to clear the description
    if (raw['description'] !== null) {
      if (typeof raw['description'] !== 'string') {
        return c.json({ error: 'invalid_description', detail: 'must be a string or null' }, 400);
      }
      if ((raw['description'] as string).length > 500) {
        return c.json({ error: 'description_too_long', max_length: 500, received: (raw['description'] as string).length }, 400);
      }
    }
    updates['description'] = raw['description'];
  }

  if ('is_pizza' in raw) {
    if (typeof raw['is_pizza'] !== 'boolean') {
      return c.json({ error: 'invalid_is_pizza', detail: 'must be a boolean' }, 400);
    }
    updates['is_pizza'] = raw['is_pizza'];
  }

  if ('is_active' in raw) {
    if (typeof raw['is_active'] !== 'boolean') {
      return c.json({ error: 'invalid_is_active', detail: 'must be a boolean' }, 400);
    }
    updates['is_active'] = raw['is_active'];
  }

  if ('tags' in raw) {
    // null is accepted to clear tags
    if (raw['tags'] !== null) {
      if (typeof raw['tags'] !== 'string') {
        return c.json({ error: 'invalid_tags', detail: 'must be a string or null' }, 400);
      }
      if ((raw['tags'] as string).length > 300) {
        return c.json({ error: 'tags_too_long', max_length: 300, received: (raw['tags'] as string).length }, 400);
      }
    }
    updates['tags'] = raw['tags'];
  }

  if ('image_url' in raw) {
    // null is accepted to clear the image
    if (raw['image_url'] !== null) {
      if (typeof raw['image_url'] !== 'string') {
        return c.json({ error: 'invalid_image_url', detail: 'must be a string or null' }, 400);
      }
      if ((raw['image_url'] as string).length > 500) {
        return c.json({ error: 'image_url_too_long', max_length: 500, received: (raw['image_url'] as string).length }, 400);
      }
      updates['image_url'] = (raw['image_url'] as string).trim() || null;
    } else {
      updates['image_url'] = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'no_valid_fields', detail: 'body must include at least one updatable field' }, 400);
  }

  try {
    // If menu_category_id is being changed, verify it belongs to this tenant.
    if ('menu_category_id' in updates) {
      const catRows = await sql<{ menu_category_id: number }[]>`
        SELECT menu_category_id
        FROM menu_category
        WHERE menu_category_id = ${updates['menu_category_id'] as number}
          AND restaurante_id   = ${restaurante_id}
        LIMIT 1
      `;

      if (catRows.length === 0) {
        return c.json({ error: 'category_not_found', detail: 'menu_category_id does not exist for this restaurant' }, 404);
      }
    }

    const rows = await sql<ItemRow[]>`
      UPDATE menu_item
      SET ${sql(updates)}
      WHERE menu_item_id  = ${item_id}
        AND restaurante_id = ${restaurante_id}
      RETURNING menu_item_id, menu_category_id, name, description, is_pizza, is_active, tags, image_url, restaurante_id
    `;

    if (rows.length === 0) {
      return c.json({ error: 'item_not_found' }, 404);
    }

    return c.json(mapItem(rows[0]));

  } catch (err) {
    console.error('[PATCH /dashboard/:slug/menu/items/:item_id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// DELETE /dashboard/:slug/menu/items/:item_id
//
// Soft-deletes an item by setting is_active = false. Never issues a physical
// DELETE. Verifies tenant ownership before updating.
// ----------------------------------------------------------------------------
menuItemsRoutes.delete('/:slug/menu/items/:item_id', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const itemIdParam = c.req.param('item_id');
  const item_id = parseInt(itemIdParam, 10);
  if (!Number.isInteger(item_id) || item_id < 1) {
    return c.json({ error: 'invalid_item_id' }, 400);
  }

  try {
    const rows = await sql<ItemRow[]>`
      UPDATE menu_item
      SET is_active = false
      WHERE menu_item_id  = ${item_id}
        AND restaurante_id = ${restaurante_id}
      RETURNING menu_item_id, menu_category_id, name, description, is_pizza, is_active, tags, image_url, restaurante_id
    `;

    if (rows.length === 0) {
      return c.json({ error: 'item_not_found' }, 404);
    }

    return c.json(mapItem(rows[0]));

  } catch (err) {
    console.error('[DELETE /dashboard/:slug/menu/items/:item_id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PUT /dashboard/:slug/menu/items/:item_id/extras
//
// Replaces the ENTIRE extras list for the item in a single transaction:
//   1. Verify item belongs to tenant → 404
//   2. Verify every extra_id belongs to tenant → 400 with offending id
//   3. DELETE FROM menu_item_extra WHERE menu_item_id = :item_id
//   4. INSERT new rows (skipped if extra_ids is empty)
//   5. Return updated extras list
//
// Body: { "extra_ids": number[] }   (empty array = clear all extras)
// ----------------------------------------------------------------------------
menuItemsRoutes.put('/:slug/menu/items/:item_id/extras', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const itemIdParam = c.req.param('item_id');
  const item_id = parseInt(itemIdParam, 10);
  if (!Number.isInteger(item_id) || item_id < 1) {
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

  if (!('extra_ids' in raw) || !Array.isArray(raw['extra_ids'])) {
    return c.json({ error: 'extra_ids_required', detail: 'extra_ids must be an array' }, 400);
  }

  const rawIds = raw['extra_ids'] as unknown[];
  for (const id of rawIds) {
    if (!Number.isInteger(id) || (id as number) < 1) {
      return c.json({ error: 'invalid_extra_ids', detail: 'all extra_ids must be positive integers' }, 400);
    }
  }
  const extra_ids = rawIds as number[];

  try {
    let updatedExtras: ExtraRow[] = [];

    await sql.begin(async (tx) => {
      // 1. Verify item belongs to this tenant
      const itemRows = await tx`
        SELECT menu_item_id
        FROM menu_item
        WHERE menu_item_id   = ${item_id}
          AND restaurante_id = ${restaurante_id}
        LIMIT 1
      `;
      if (itemRows.length === 0) {
        throw Object.assign(new Error('item_not_found'), { _code: 'ITEM_NOT_FOUND' });
      }

      // 2. Verify every extra_id belongs to this tenant
      if (extra_ids.length > 0) {
        const validRows = await tx`
          SELECT extra_id
          FROM extra
          WHERE extra_id       = ANY(${extra_ids}::bigint[])
            AND restaurante_id = ${restaurante_id}
        `;
        const validSet = new Set(validRows.map((r) => Number(r['extra_id'])));
        const invalid = extra_ids.find((id) => !validSet.has(id));
        if (invalid !== undefined) {
          throw Object.assign(new Error('extra_not_found'), { _code: 'EXTRA_NOT_FOUND', _extra_id: invalid });
        }
      }

      // 3. Delete existing associations
      await tx`
        DELETE FROM menu_item_extra
        WHERE menu_item_id = ${item_id}
      `;

      // 4. Insert new associations (noop when extra_ids is empty)
      if (extra_ids.length > 0) {
        const insertRows = extra_ids.map((eid) => ({ menu_item_id: item_id, extra_id: eid }));
        await tx`INSERT INTO menu_item_extra ${tx(insertRows, 'menu_item_id', 'extra_id')}`;
      }

      // 5. Fetch updated list for response
      updatedExtras = await tx<ExtraRow[]>`
        SELECT e.extra_id, e.name, e.price, e.is_active, e.allergens
        FROM extra e
        JOIN menu_item_extra mie ON mie.extra_id = e.extra_id
        WHERE mie.menu_item_id = ${item_id}
        ORDER BY e.name ASC
      `;
    });

    return c.json({ menu_item_id: item_id, extras: updatedExtras.map(mapExtra) });

  } catch (err: unknown) {
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      if (e['_code'] === 'ITEM_NOT_FOUND') {
        return c.json({ error: 'item_not_found' }, 404);
      }
      if (e['_code'] === 'EXTRA_NOT_FOUND') {
        return c.json({
          error:    'extra_not_found',
          detail:   `extra_id ${e['_extra_id']} does not belong to this restaurant`,
          extra_id: e['_extra_id'],
        }, 400);
      }
    }
    console.error('[PUT /dashboard/:slug/menu/items/:item_id/extras] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// -------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ItemRow {
  menu_item_id:     number;
  menu_category_id: number;
  name:             string;
  description:      string | null;
  is_pizza:         boolean;
  is_active:        boolean;
  tags:             string | null;
  image_url:        string | null;
  restaurante_id:   number;
}

interface ExtraRow {
  extra_id:  number;
  name:      string;
  price:     string;
  is_active: boolean;
  allergens: string | null;
}

function mapExtra(row: ExtraRow) {
  return {
    extra_id:  Number(row.extra_id),
    name:      row.name,
    price:     parseFloat(row.price),
    is_active: row.is_active,
    allergens: row.allergens ?? null,
  };
}

function mapItem(row: ItemRow) {
  return {
    menu_item_id:     Number(row.menu_item_id),
    menu_category_id: Number(row.menu_category_id),
    name:             row.name,
    description:      row.description ?? null,
    is_pizza:         row.is_pizza,
    is_active:        row.is_active,
    tags:             row.tags ?? null,
    image_url:        row.image_url ?? null,
  };
}

export default menuItemsRoutes;
