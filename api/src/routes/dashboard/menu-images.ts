/**
 * menu-images.ts
 *
 * POST   /dashboard/:slug/menu/upload-image     → sube imagen, devuelve URL pública
 * DELETE /dashboard/:slug/menu/items/:id/image  → elimina imagen del storage y DB
 *
 * El backend sube a Supabase Storage con service_role key (bypasea RLS).
 * Bucket: menu-images  (debe existir en Supabase con acceso público)
 * Path:   {restaurante_id}/{timestamp}-{random}.{ext}
 */

import { Hono }           from 'hono';
import type { Variables } from '../../types.js';
import sql                from '../../lib/db.js';
import supabaseAdmin      from '../../lib/supabase-admin.js';
import { resolveTenant }  from '../../middleware/tenant.js';
import { requireAuth }    from '../../middleware/auth.js';

const BUCKET       = 'menu-images';
const MAX_SIZE_MB  = 5;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

const menuImagesRoutes = new Hono<{ Variables: Variables }>();
menuImagesRoutes.use('/:slug/*', resolveTenant, requireAuth);

// ─── POST /dashboard/:slug/menu/upload-image ─────────────────────────────────
// Sube la imagen al bucket y devuelve la URL pública.
// Funciona tanto al crear un producto (sin item_id) como al editar uno existente.
// La URL resultante se guarda junto con el resto del producto al hacer POST/PATCH.
menuImagesRoutes.post('/:slug/menu/upload-image', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  let file: File | null = null;
  try {
    const body = await c.req.parseBody({ all: true });
    const raw  = body['file'];
    if (!raw || typeof raw === 'string') {
      return c.json({ error: 'missing_file', detail: 'Envía un campo "file" con la imagen' }, 400);
    }
    file = raw as File;
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  if (!ALLOWED_MIME.includes(file.type)) {
    return c.json({ error: 'invalid_type', detail: `Tipo permitido: ${ALLOWED_MIME.join(', ')}` }, 400);
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return c.json({ error: 'file_too_large', detail: `Máximo ${MAX_SIZE_MB}MB` }, 400);
  }

  const ext    = file.type.split('/')[1].replace('jpeg', 'jpg');
  const random = Math.random().toString(36).slice(2, 8);
  const path   = `${restaurante_id}/${Date.now()}-${random}.${ext}`;
  const buffer = await file.arrayBuffer();

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, cacheControl: '3600', upsert: false });

  if (uploadError) {
    console.error('[menu-images] upload error:', uploadError.message);
    return c.json({ error: 'upload_failed', detail: uploadError.message }, 500);
  }

  const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return c.json({ ok: true, image_url: urlData.publicUrl });
});

// ─── DELETE /dashboard/:slug/menu/items/:id/image ────────────────────────────
menuImagesRoutes.delete('/:slug/menu/items/:id/image', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const item_id        = Number(c.req.param('id'));

  if (!item_id || isNaN(item_id)) return c.json({ error: 'invalid_id' }, 400);

  const [item] = await sql<{ image_url: string | null }[]>`
    SELECT image_url FROM menu_item
    WHERE menu_item_id = ${item_id} AND restaurante_id = ${restaurante_id}
    LIMIT 1
  `;
  if (!item) return c.json({ error: 'not_found' }, 404);

  if (item.image_url) {
    const storagePath = extractStoragePath(item.image_url);
    if (storagePath) {
      const { error } = await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
      if (error) console.warn('[menu-images] delete storage error:', error.message);
    }
  }

  await sql`
    UPDATE menu_item
    SET image_url  = NULL,
        updated_at = NOW()
    WHERE menu_item_id = ${item_id} AND restaurante_id = ${restaurante_id}
  `;

  return c.json({ ok: true });
});

// ─── POST /dashboard/:slug/upload-logo ───────────────────────────────────────
// Sube el logo del restaurante al bucket 'logos' y devuelve la URL pública.
const LOGO_BUCKET      = 'logos';
const LOGO_ALLOWED     = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const LOGO_MAX_SIZE_MB = 2;

menuImagesRoutes.post('/:slug/upload-logo', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const slug           = c.req.param('slug');

  let file: File | null = null;
  try {
    const body = await c.req.parseBody({ all: true });
    const raw  = body['file'];
    if (!raw || typeof raw === 'string') {
      return c.json({ error: 'missing_file', detail: 'Envía un campo "file" con la imagen' }, 400);
    }
    file = raw as File;
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  if (!LOGO_ALLOWED.includes(file.type)) {
    return c.json({ error: 'invalid_type', detail: `Tipo permitido: ${LOGO_ALLOWED.join(', ')}` }, 400);
  }
  if (file.size > LOGO_MAX_SIZE_MB * 1024 * 1024) {
    return c.json({ error: 'file_too_large', detail: `Máximo ${LOGO_MAX_SIZE_MB}MB` }, 400);
  }

  const ext    = file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[1].replace('jpeg', 'jpg');
  const path   = `${restaurante_id}/logo.${ext}`;
  const buffer = await file.arrayBuffer();

  // Upsert (overwrite) logo
  const { error: uploadError } = await supabaseAdmin.storage
    .from(LOGO_BUCKET)
    .upload(path, buffer, { contentType: file.type, cacheControl: '3600', upsert: true });

  if (uploadError) {
    console.error('[upload-logo] upload error:', uploadError.message);
    return c.json({ error: 'upload_failed', detail: uploadError.message }, 500);
  }

  const { data: urlData } = supabaseAdmin.storage.from(LOGO_BUCKET).getPublicUrl(path);
  const logo_url = urlData.publicUrl + '?t=' + Date.now();

  // Persist logo_url in restaurante table
  await sql`
    UPDATE restaurante
    SET logo_url   = ${urlData.publicUrl},
        updated_at = NOW()
    WHERE restaurante_id = ${restaurante_id}
  `.catch(() => null); // non-fatal if column doesn't exist yet

  return c.json({ ok: true, logo_url, slug });
});

// ─── Helper ───────────────────────────────────────────────────────────────────
// Extrae el path relativo dentro del bucket desde la URL pública de Supabase
function extractStoragePath(url: string): string | null {
  try {
    const u   = new URL(url);
    // e.g. /storage/v1/object/public/menu-images/11/123-456.jpg
    const idx = u.pathname.indexOf(`/${BUCKET}/`);
    if (idx === -1) return null;
    return u.pathname.slice(idx + `/${BUCKET}/`.length);
  } catch {
    return null;
  }
}

export default menuImagesRoutes;
