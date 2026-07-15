import { Hono } from 'hono';
import sql from '../lib/db.js';
import { validateBearerToken } from '../middleware/auth.js';

const onboardingRoutes = new Hono();

// BAJO-3: same slug format as resolveTenant (tenant.ts)
const SLUG_RE      = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$|^[a-z0-9]$/;
const VALID_TZ_RE  = /^[A-Za-z_/]{3,50}$/;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const DIAS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

const DIA_TO_DIA_SEMANA: Record<string, number> = {
  Lunes: 1, Martes: 2, 'Miércoles': 3, Jueves: 4, Viernes: 5, 'Sábado': 6, Domingo: 0,
};

const DEFAULT_PAYMENT_METHODS = ['efectivo', 'transferencia'];

const TZ_PHONE_PREFIX: Record<string, string> = {
  'Atlantic/Canary':                   '+34',
  'Europe/Madrid':                     '+34',
  'America/Mexico_City':               '+52',
  'America/Bogota':                    '+57',
  'America/Lima':                      '+51',
  'America/Santiago':                  '+56',
  'America/Argentina/Buenos_Aires':    '+54',
  'America/Caracas':                   '+58',
  'America/Guayaquil':                 '+593',
  'America/Montevideo':                '+598',
  'America/Asuncion':                  '+595',
  'America/La_Paz':                    '+591',
  'America/Santo_Domingo':             '+1',
  'America/Costa_Rica':                '+506',
  'America/Guatemala':                 '+502',
  'America/New_York':                  '+1',
  'America/Chicago':                   '+1',
  'America/Denver':                    '+1',
  'America/Los_Angeles':               '+1',
};

function phonePrefixForTz(tz: string): string {
  return TZ_PHONE_PREFIX[tz] ?? '+1';
}

const DEFAULT_CONFIG: { key: string; value: string; desc: string }[] = [
  { key: 'pickup_eta_minutes',      value: '20', desc: 'Tiempo estimado de retiro (minutos)' },
  { key: 'delivery_eta_min_minutes',value: '30', desc: 'ETA delivery mínimo (minutos)' },
  { key: 'delivery_eta_max_minutes',value: '45', desc: 'ETA delivery máximo (minutos)' },
  { key: 'cart_expiry_minutes',     value: '30', desc: 'Minutos hasta expirar carrito activo' },
  { key: 'modify_window_minutes',   value: '10', desc: 'Ventana de modificación de pedido confirmado' },
  { key: 'cart_warning_minutes',    value: '5',  desc: 'Advertencia antes de expirar carrito (minutos)' },
];

onboardingRoutes.get('/check-slug', async (c) => {
  const raw  = (c.req.query('slug') ?? '').toLowerCase().trim();

  if (!raw || raw.length < 2 || raw.length > 60 || !SLUG_RE.test(raw)) {
    return c.json({ available: false, reason: 'invalid_format', slug: raw });
  }

  try {
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM public.restaurante WHERE slug = ${raw} LIMIT 1
    `;
    return c.json({ available: rows.length === 0, slug: raw });
  } catch (err) {
    console.error('[GET /onboarding/check-slug]', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

onboardingRoutes.post('/complete', async (c) => {
  const user = await validateBearerToken(c.req.header('Authorization'));
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  let body: unknown;
  try { body = await c.req.json(); } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }
  const b = body as Record<string, unknown>;

  const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : '';
  if (!nombre || nombre.length < 2 || nombre.length > 80) {
    return c.json({ error: 'invalid_nombre', detail: 'nombre must be 2–80 characters' }, 400);
  }

  const slug = typeof b.slug === 'string' ? b.slug.toLowerCase().trim() : '';
  if (!slug || !SLUG_RE.test(slug) || slug.length > 60) {
    return c.json({
      error: 'invalid_slug',
      detail: 'slug must be 2–60 lowercase alphanumeric characters or hyphens, no leading/trailing hyphens',
    }, 400);
  }

  const telefono    = typeof b.telefono    === 'string' ? b.telefono.trim()    || null : null;
  const moneda      = typeof b.moneda      === 'string' && b.moneda.trim().length <= 5
    ? b.moneda.trim()
    : '€';
  const zona_horaria = typeof b.zona_horaria === 'string' && VALID_TZ_RE.test(b.zona_horaria.trim())
    ? b.zona_horaria.trim()
    : 'Europe/Madrid';
  const brand_color  = typeof b.brand_color  === 'string' && HEX_COLOR_RE.test(b.brand_color)
    ? b.brand_color
    : '#E63946';

  try {
    const result = await sql.begin(async (tx) => {

      const [newRest] = await tx<{ id: number; nombre: string; slug: string }[]>`
        INSERT INTO public.restaurante
          (nombre, slug, telefono, moneda, zona_horaria, brand_color, payment_methods, created_at)
        VALUES (
          ${nombre},
          ${slug},
          ${telefono},
          ${moneda},
          ${zona_horaria},
          ${brand_color},
          ${sql.json(DEFAULT_PAYMENT_METHODS)},
          NOW()
        )
        RETURNING id, nombre, slug
      `;

      const restaurante_id = newRest.id;

      await tx`
        INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email, created_at)
        VALUES (${user.id}, ${restaurante_id}, 'owner', ${user.email ?? null}, NOW())
        ON CONFLICT (user_id, restaurante_id) DO NOTHING
      `;

      for (const dia of DIAS_ES) {
        await tx`
          INSERT INTO public.horarios (restaurante_id, dia, disponible, apertura_1, cierre_1)
          VALUES (${restaurante_id}, ${dia}, true, '09:00'::time, '22:00'::time)
          ON CONFLICT (restaurante_id, dia) DO NOTHING
        `;
      }

      for (const [, dia_semana] of Object.entries(DIA_TO_DIA_SEMANA)) {
        await tx`
          INSERT INTO public.horario_atencion
            (restaurante_id, dia_semana, hora_apertura, hora_cierre, is_open, updated_at)
          VALUES
            (${restaurante_id}, ${dia_semana}, '09:00'::time, '22:00'::time, true, NOW())
          ON CONFLICT (restaurante_id, dia_semana) DO NOTHING
        `;
      }

      for (const cfg of DEFAULT_CONFIG) {
        await tx`
          INSERT INTO public.restaurante_config
            (restaurante_id, config_key, config_value, description, updated_at)
          VALUES
            (${restaurante_id}, ${cfg.key}, ${cfg.value}, ${cfg.desc}, NOW())
          ON CONFLICT (config_key, restaurante_id) DO NOTHING
        `;
      }

      const phone_prefix = phonePrefixForTz(zona_horaria);
      await tx`
        INSERT INTO public.restaurante_config
          (restaurante_id, config_key, config_value, description, updated_at)
        VALUES
          (${restaurante_id}, 'phone_prefix', ${phone_prefix},
           'Prefijo telefónico del país (ej: +34, +52). Usado en el menú público.', NOW())
        ON CONFLICT (config_key, restaurante_id) DO NOTHING
      `;

      return newRest;
    });

    return c.json({
      restaurante_id: result.id,
      slug:           result.slug,
      nombre:         result.nombre,
      public_url:     `/${result.slug}`,
      dashboard_url:  `/dashboard/${result.slug}`,
    }, 201);

  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === '23505') {
      return c.json({ error: 'slug_taken', detail: `El slug '${slug}' ya está en uso.` }, 409);
    }
    console.error('[POST /onboarding/complete]', pgErr.message ?? err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ─── POST /onboarding/bot-config ─────────────────────────────────────────────
// Saves WhatsApp / Chatwoot bot configuration for an existing restaurant.
// The user must be owner/admin of the restaurant identified by slug.
onboardingRoutes.post('/bot-config', async (c) => {
  const user = await validateBearerToken(c.req.header('Authorization'));
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  let body: unknown;
  try { body = await c.req.json(); } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }
  const b = body as Record<string, unknown>;

  const slug = typeof b.slug === 'string' ? b.slug.toLowerCase().trim() : '';
  if (!slug) return c.json({ error: 'missing_slug' }, 400);

  try {
    // Verify the user owns this restaurant
    const rows = await sql<{ id: number }[]>`
      SELECT r.id FROM public.restaurante r
      JOIN public.local_memberships lm ON lm.restaurante_id = r.id
      WHERE r.slug     = ${slug}
        AND lm.user_id = ${user.id}
      LIMIT 1
    `;
    if (!rows.length) return c.json({ error: 'forbidden' }, 403);

    const restaurante_id = rows[0].id;

    const botConfig: Record<string, string> = {
      bot_activo:            b.bot_activo === true ? 'true' : 'false',
      whatsapp_number:       typeof b.whatsapp_number       === 'string' ? b.whatsapp_number.trim()       : '',
      chatwoot_webhook_prod: typeof b.chatwoot_webhook_prod === 'string' ? b.chatwoot_webhook_prod.trim() : '',
      chatwoot_webhook_test: typeof b.chatwoot_webhook_test === 'string' ? b.chatwoot_webhook_test.trim() : '',
      chatwoot_inbox_id:     typeof b.chatwoot_inbox_id     === 'string' ? b.chatwoot_inbox_id.trim()     : '',
    };

    // Upsert each key into restaurante_config
    for (const [key, value] of Object.entries(botConfig)) {
      await sql`
        INSERT INTO public.restaurante_config
          (restaurante_id, config_key, config_value, description, updated_at)
        VALUES (
          ${restaurante_id}, ${key}, ${value},
          ${'Configuración del agente WhatsApp — establecida en onboarding'},
          NOW()
        )
        ON CONFLICT (config_key, restaurante_id)
        DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW()
      `;
    }

    return c.json({ ok: true, restaurante_id }, 200);

  } catch (err: unknown) {
    console.error('[POST /onboarding/bot-config]', (err as Error).message ?? err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

export default onboardingRoutes;
