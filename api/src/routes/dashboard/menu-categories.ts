import { Hono } from 'hono';
import type { Variables } from '../../types.js';
import sql from '../../lib/db.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireAuth } from '../../middleware/auth.js';

const menuCategoriesRoutes = new Hono<{ Variables: Variables }>();

// '*' covers all nested segments (e.g. /:slug/menu/categories/:id) without
// ambiguity around how Hono resolves multi-segment wildcards in sub-routers.
menuCategoriesRoutes.use('/:slug/*', resolveTenant, requireAuth);

// ----------------------------------------------------------------------------
// GET /dashboard/:slug/menu/categories
//
// Returns all categories for the tenant ordered by sort_order ASC nulls last,
// then name ASC.
// ----------------------------------------------------------------------------
menuCategoriesRoutes.get('/:slug/menu/categories', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  try {
    const rows = await sql<CategoryRow[]>`
      SELECT
        menu_category_id,
        name,
        sort_order,
        is_active
      FROM menu_category
      WHERE restaurante_id = ${restaurante_id}
      ORDER BY sort_order ASC NULLS LAST, name ASC
    `;

    return c.json({ categories: rows.map(mapCategory) });

  } catch (err) {
    console.error('[GET /dashboard/:slug/menu/categories] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

const MAX_CATEGORIES_PER_TENANT = 100;

// ----------------------------------------------------------------------------
// POST /dashboard/:slug/menu/categories
//
// Creates a new category. restaurante_id comes exclusively from resolveTenant —
// it is never read from the body.
//
// Required body fields: name (string, 1-100 chars)
// Optional body fields: sort_order (integer >= 0), is_active (boolean, default true)
// ----------------------------------------------------------------------------
menuCategoriesRoutes.post('/:slug/menu/categories', async (c) => {
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
  if (name.length > 100) {
    return c.json({ error: 'name_too_long', max_length: 100, received: name.length }, 400);
  }

  // --- Validate sort_order (optional) ----------------------------------------
  let sort_order: number | null = null;
  if ('sort_order' in raw && raw['sort_order'] !== null && raw['sort_order'] !== undefined) {
    if (!Number.isInteger(raw['sort_order']) || (raw['sort_order'] as number) < 0) {
      return c.json({ error: 'invalid_sort_order', detail: 'must be a non-negative integer' }, 400);
    }
    sort_order = raw['sort_order'] as number;
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
    const countRows = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM menu_category WHERE restaurante_id = ${restaurante_id}
    `;
    if (parseInt(countRows[0]!.count, 10) >= MAX_CATEGORIES_PER_TENANT) {
      return c.json({ error: 'category_limit_reached', max: MAX_CATEGORIES_PER_TENANT }, 422);
    }

    const rows = await sql<CategoryRow[]>`
      INSERT INTO menu_category (restaurante_id, name, sort_order, is_active)
      VALUES (${restaurante_id}, ${name}, ${sort_order ?? 0}, ${is_active})
      RETURNING menu_category_id, name, sort_order, is_active
    `;

    return c.json(mapCategory(rows[0]), 201);

  } catch (err) {
    console.error('[POST /dashboard/:slug/menu/categories] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PATCH /dashboard/:slug/menu/categories/:category_id
//
// Updates an existing category. Verifies tenant ownership before updating.
// All fields are optional but at least one must be provided.
//
// Updatable fields: name (string, 1-100), sort_order (integer >= 0 | null),
//                   is_active (boolean)
// ----------------------------------------------------------------------------
menuCategoriesRoutes.patch('/:slug/menu/categories/:category_id', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const categoryIdParam = c.req.param('category_id');
  if (!/^\d+$/.test(categoryIdParam)) {
    return c.json({ error: 'invalid_category_id' }, 400);
  }
  const category_id = parseInt(categoryIdParam, 10);
  if (category_id < 1) {
    return c.json({ error: 'invalid_category_id' }, 400);
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

  // --- Collect and validate fields to update ----------------------------------
  const updates: Record<string, unknown> = {};

  if ('name' in raw) {
    if (typeof raw['name'] !== 'string' || raw['name'].trim().length === 0) {
      return c.json({ error: 'invalid_name', detail: 'name must be a non-empty string' }, 400);
    }
    const name = raw['name'].trim();
    if (name.length > 100) {
      return c.json({ error: 'name_too_long', max_length: 100, received: name.length }, 400);
    }
    updates['name'] = name;
  }

  if ('sort_order' in raw) {
    // null is allowed to clear the sort order
    if (raw['sort_order'] !== null) {
      if (!Number.isInteger(raw['sort_order']) || (raw['sort_order'] as number) < 0) {
        return c.json({ error: 'invalid_sort_order', detail: 'must be a non-negative integer or null' }, 400);
      }
    }
    updates['sort_order'] = raw['sort_order'];
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
    const rows = await sql<CategoryRow[]>`
      UPDATE menu_category
      SET ${sql(updates)}
      WHERE menu_category_id = ${category_id}
        AND restaurante_id   = ${restaurante_id}
      RETURNING menu_category_id, name, sort_order, is_active
    `;

    if (rows.length === 0) {
      return c.json({ error: 'category_not_found' }, 404);
    }

    return c.json(mapCategory(rows[0]));

  } catch (err) {
    console.error('[PATCH /dashboard/:slug/menu/categories/:category_id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// DELETE /dashboard/:slug/menu/categories/:category_id
//
// Soft-deletes a category by setting is_active = false.
// Never issues a physical DELETE.
// Verifies tenant ownership before updating.
// ----------------------------------------------------------------------------
menuCategoriesRoutes.delete('/:slug/menu/categories/:category_id', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const categoryIdParam = c.req.param('category_id');
  if (!/^\d+$/.test(categoryIdParam)) {
    return c.json({ error: 'invalid_category_id' }, 400);
  }
  const category_id = parseInt(categoryIdParam, 10);
  if (category_id < 1) {
    return c.json({ error: 'invalid_category_id' }, 400);
  }

  try {
    const rows = await sql<{ menu_category_id: number }[]>`
      UPDATE menu_category
      SET is_active = false
      WHERE menu_category_id = ${category_id}
        AND restaurante_id   = ${restaurante_id}
      RETURNING menu_category_id
    `;

    if (rows.length === 0) {
      return c.json({ error: 'category_not_found' }, 404);
    }

    return c.newResponse(null, 204);

  } catch (err) {
    console.error('[DELETE /dashboard/:slug/menu/categories/:category_id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CategoryRow {
  menu_category_id: number;
  name:             string;
  sort_order:       number | null;
  is_active:        boolean;
}

function mapCategory(row: CategoryRow) {
  return {
    menu_category_id: row.menu_category_id,
    name:             row.name,
    sort_order:       row.sort_order ?? null,
    is_active:        row.is_active,
  };
}

export default menuCategoriesRoutes;
