import type { Context, Next } from 'hono';
import sql from '../lib/db.js';

// BAJO-3: only allow safe slug characters before hitting the DB.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Resolves :slug → restaurante_id and stores it in context.
// Returns 404 immediately if the slug has no matching restaurant.
// This runs before any handler — no external param can override restaurante_id.
export async function resolveTenant(c: Context, next: Next) {
  const slug = c.req.param('slug');

  // BAJO-3: reject malformed slugs early — no DB round-trip needed.
  if (!slug || slug.length > 100 || !SLUG_RE.test(slug)) {
    return c.json({ error: 'restaurant_not_found' }, 404);
  }

  // CRÍTICO-1: wrap DB access so infrastructure errors return controlled JSON.
  let rows: { id: number }[];
  try {
    rows = await sql<{ id: number }[]>`
      SELECT id
      FROM restaurante
      WHERE slug = ${slug}
      LIMIT 1
    `;
  } catch {
    return c.json({ error: 'service_unavailable' }, 503);
  }

  if (rows.length === 0) {
    return c.json({ error: 'restaurant_not_found' }, 404);
  }
  c.set('restaurante_id', rows[0].id);
  await next();
}
