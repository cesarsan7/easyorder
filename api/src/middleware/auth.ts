import type { Context, Next } from 'hono';
import { createClient } from '@supabase/supabase-js';
import sql from '../lib/db.js';
import type { Variables } from '../types.js';

// Single shared Supabase client — validates tokens via Supabase Auth (ES256).
const supabase = (() => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url) throw new Error('SUPABASE_URL environment variable is not set');
  if (!key) throw new Error('SUPABASE_ANON_KEY environment variable is not set');
  return createClient(url, key, { auth: { persistSession: false } });
})();

// Exported helper: validates a raw Bearer token (no slug required).
// Returns the Supabase user or null if the token is invalid/expired.
export async function validateBearerToken(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// Verifies the Supabase JWT via supabase.auth.getUser() (works with ES256)
// and checks that the user has a row in local_memberships for the
// restaurante_id resolved by resolveTenant.
// Must run AFTER resolveTenant — depends on restaurante_id being in context.
// On success, sets user_id and rol in context for downstream handlers.
export async function requireAuth(
  c: Context<{ Variables: Variables }>,
  next: Next,
) {
  // Step 1 — Authorization header
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  // Step 2 — Verify token via Supabase Auth (handles both HS256 and ES256)
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  // Step 3 — Extract user_id from user.id (UUID)
  const sub = user.id;

  // Step 4 — restaurante_id already set by resolveTenant middleware
  const restaurante_id = c.get('restaurante_id');

  // Step 5 — Check local_memberships and retrieve role.
  // Column is named `role` in the DDL; alias to `rol` to match the Variables type.
  let rows: { rol: string }[];
  try {
    rows = await sql<{ rol: string }[]>`
      SELECT rol
      FROM   local_memberships
      WHERE  user_id        = ${sub}
        AND  restaurante_id = ${restaurante_id}
      LIMIT  1
    `;
  } catch {
    return c.json({ error: 'service_unavailable' }, 503);
  }

  if (rows.length === 0) {
    return c.json({ error: 'forbidden' }, 403);
  }

  // Step 6 — Attach verified identity to context for downstream handlers
  c.set('user_id', sub);
  c.set('rol', rows[0].rol);

  await next();
}
