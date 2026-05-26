import { Hono } from 'hono';
import type { Variables } from '../../types.js';
import sql from '../../lib/db.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireAuth } from '../../middleware/auth.js';

const membersRoutes = new Hono<{ Variables: Variables }>();

membersRoutes.use('/:slug/*', resolveTenant, requireAuth);

// ----------------------------------------------------------------------------
// GET /dashboard/:slug/members
// Lista todos los miembros del restaurante.
// Accesible para cualquier rol autenticado del restaurante.
// ----------------------------------------------------------------------------
membersRoutes.get('/:slug/members', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  try {
    const rows = await sql<{ user_id: string; rol: string; email: string | null; created_at: string }[]>`
      SELECT user_id, rol, email, created_at
      FROM   local_memberships
      WHERE  restaurante_id = ${restaurante_id}
      ORDER  BY created_at ASC
    `;

    return c.json({ members: rows.map(r => ({
      user_id:    r.user_id,
      rol:        r.rol,
      email:      r.email ?? null,
      created_at: r.created_at,
    })) });

  } catch (err) {
    console.error('[GET /dashboard/:slug/members] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// POST /dashboard/:slug/members/invite
// Genera un token de invitación (válido 7 días) para un rol dado.
// Solo owner y manager pueden invitar.
// Body: { rol: 'manager' | 'staff' }
// ----------------------------------------------------------------------------
membersRoutes.post('/:slug/members/invite', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const created_by     = c.get('user_id');
  const rol_caller     = c.get('rol');

  if (rol_caller !== 'owner' && rol_caller !== 'manager') {
    return c.json({ error: 'forbidden', detail: 'owner or manager required' }, 403);
  }

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }

  const b = body as Record<string, unknown>;
  const rol = b['rol'] as string | undefined;

  if (!rol || !['manager', 'staff'].includes(rol)) {
    return c.json({ error: 'invalid_rol', detail: "rol must be 'manager' or 'staff'" }, 400);
  }

  // Managers can only invite staff (not other managers)
  if (rol_caller === 'manager' && rol !== 'staff') {
    return c.json({ error: 'forbidden', detail: 'managers can only invite staff' }, 403);
  }

  try {
    const [invite] = await sql<{ token: string; expires_at: string }[]>`
      INSERT INTO restaurant_invites (restaurante_id, rol, created_by)
      VALUES (${restaurante_id}, ${rol}, ${created_by})
      RETURNING token, expires_at
    `;

    return c.json({ token: invite.token, expires_at: invite.expires_at, rol }, 201);

  } catch (err) {
    console.error('[POST /dashboard/:slug/members/invite] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PATCH /dashboard/:slug/members/:user_id/rol
// Cambia el rol de un miembro. Solo owner puede hacerlo.
// Body: { rol: 'manager' | 'staff' }
// No puede cambiar su propio rol.
// ----------------------------------------------------------------------------
membersRoutes.patch('/:slug/members/:target_user_id/rol', async (c) => {
  const restaurante_id   = c.get('restaurante_id');
  const caller_user_id   = c.get('user_id');
  const rol_caller       = c.get('rol');
  const target_user_id   = c.req.param('target_user_id');

  if (rol_caller !== 'owner') {
    return c.json({ error: 'forbidden', detail: 'only owner can change roles' }, 403);
  }

  if (caller_user_id === target_user_id) {
    return c.json({ error: 'cannot_change_own_role' }, 400);
  }

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }

  const b = body as Record<string, unknown>;
  const new_rol = b['rol'] as string | undefined;

  if (!new_rol || !['manager', 'staff'].includes(new_rol)) {
    return c.json({ error: 'invalid_rol', detail: "rol must be 'manager' or 'staff'" }, 400);
  }

  try {
    const rows = await sql`
      UPDATE local_memberships
      SET    rol = ${new_rol}
      WHERE  user_id        = ${target_user_id}
        AND  restaurante_id = ${restaurante_id}
        AND  rol            != 'owner'
      RETURNING user_id
    `;

    if ((rows as unknown[]).length === 0) {
      return c.json({ error: 'member_not_found' }, 404);
    }

    return c.json({ ok: true, user_id: target_user_id, rol: new_rol });

  } catch (err) {
    console.error('[PATCH /dashboard/:slug/members/:user_id/rol] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// DELETE /dashboard/:slug/members/:user_id
// Elimina un miembro del restaurante. Solo owner puede hacerlo.
// No puede eliminar al owner (a sí mismo o a otro owner).
// ----------------------------------------------------------------------------
membersRoutes.delete('/:slug/members/:target_user_id', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const caller_user_id = c.get('user_id');
  const rol_caller     = c.get('rol');
  const target_user_id = c.req.param('target_user_id');

  if (rol_caller !== 'owner') {
    return c.json({ error: 'forbidden', detail: 'only owner can remove members' }, 403);
  }

  if (caller_user_id === target_user_id) {
    return c.json({ error: 'cannot_remove_self' }, 400);
  }

  try {
    const rows = await sql`
      DELETE FROM local_memberships
      WHERE  user_id        = ${target_user_id}
        AND  restaurante_id = ${restaurante_id}
        AND  rol            != 'owner'
      RETURNING user_id
    `;

    if ((rows as unknown[]).length === 0) {
      return c.json({ error: 'member_not_found_or_is_owner' }, 404);
    }

    return c.json({ ok: true });

  } catch (err) {
    console.error('[DELETE /dashboard/:slug/members/:user_id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

export default membersRoutes;
