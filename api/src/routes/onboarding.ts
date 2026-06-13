import { Hono } from 'hono';
import sql from '../lib/db.js';
import { validateBearerToken } from '../middleware/auth.js';

const onboardingRoutes = new Hono();

// BAJO-3: same slug format as resolveTenant (tenant.ts)
const SLUG_RE      = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$|^[a-z0-9]$/;
const VALID_TZ_RE  = /^[A-Za-z_/]{3,50}$/;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

// Spanish weekday names that calcIsOpen (is-open.ts) expects.
// Intl.DateTimeFormat('es-ES', {weekday:'long'}) returns lowercase; the
// helper does .charAt(0).toUpperCase() + rest → these values must match exactly.
const DIAS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

// horario_atencion uses ISO weekday numbers: 0=Sunday … 6=Saturday.
// The JS Date convention means index 0 (Monday in UI) = dia_semana 1.
//   Lunes=1, Martes=2, Miércoles=3, Jueves=4, Viernes=5, Sábado=6, Domingo=0
const DIA_TO_DIA_SEMANA: Record<string, number> = {
  Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5, Sábado: 6, Domingo: 0,
};

// Default payment methods for a new restaurant
const DEFAULT_PAYMENT_METHODS = ['efectivo', 'transferencia'];

// Default restaurante_config key-values seeded for every new restaurant
const DEFAULT_CONFIG: { key: string; value: string; desc: string }[] = [
  { key: 'pickup_eta_minutes',      value: '20', desc: 'Tiempo estimado de retiro (minutos)' },
  { key: 'delivery_eta_min_minutes',value: '30', desc: 'ETA delivery mínimo (minutos)' },
  { key: 'delivery_eta_max_minutes',value: '45', desc: 'ETA delivery máximo (minutos)' },
  { key: 'cart_expiry_minutes',     value: '30', desc: 'Minutos hasta expirar carrito activo' },
  { key: 'modify_window_minutes',   value: '10', desc: 'Ventana de modificación de pedido confirmado' },
  { key: 'cart_warning_minutes',    value: '5',  desc: 'Advertencia antes de expirar carrito (minutos)' },
];

// ---------------------------------------------------------------------------
// GET /onboarding/check-slug?slug=xxx
//
// Public — no auth required.
// Returns { available: boolean, slug: string }.
// Use for real-time slug availability feedback in the registration form.
// Rate-limited by Hono's rate-limit lib is NOT applied here — the endpoint
// is read-only and any abuse only reveals "slug taken" booleans.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /onboarding/complete
//
// Protected — requires valid Supabase Bearer token.
// Does NOT require a pre-existing local_memberships row (the user has no
// restaurant yet — that's the whole point of this endpoint).
//
// Creates everything needed for a new restaurant in a single transaction:
//   1. INSERT restaurante
//   2. INSERT local_memberships (rol='owner')
//   3. INSERT 7 rows in horarios  (for calcIsOpen / n8n agent)
//   4. INSERT 7 rows in horario_atencion (for dashboard hours editor)
//   5. INSERT restaurante_config defaults
//
// Body: {
//   nombre:        string  (required, 2–80 chars)
//   slug:          string  (required, 2–60 chars, [a-z0-9-])
//   telefono?:     string
//   moneda?:       string  (default '€')
//   zona_horaria?: string  (IANA tz, default 'Europe/Madrid')
//   brand_color?:  string  (hex #RRGGBB, default '#E63946')
// }
//
// Returns 201: { restaurante_id, slug, nombre, public_url, dashboard_url }
// Returns 409: { error: 'slug_taken' } if slug already in use
// ---------------------------------------------------------------------------
onboardingRoutes.post('/complete', async (c) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const user = await validateBearerToken(c.req.header('Authorization'));
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try { body = await c.req.json(); } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }
  const b = body as Record<string, unknown>;

  // ── Validate nombre ───────────────────────────────────────────────────────
  const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : '';
  if (!nombre || nombre.length < 2 || nombre.length > 80) {
    return c.json({ error: 'invalid_nombre', detail: 'nombre must be 2–80 characters' }, 400);
  }

  // ── Validate slug ─────────────────────────────────────────────────────────
  const slug = typeof b.slug === 'string' ? b.slug.toLowerCase().trim() : '';
  if (!slug || !SLUG_RE.test(slug) || slug.length > 60) {
    return c.json({
      error: 'invalid_slug',
      detail: 'slug must be 2–60 lowercase alphanumeric characters or hyphens, no leading/trailing hyphens',
    }, 400);
  }

  // ── Optional fields ───────────────────────────────────────────────────────
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
    // ── Transaction ───────────────────────────────────────────────────────
    const result = await sql.begin(async (tx) => {

      // 1. Insert restaurante — PG unique constraint on slug raises 23505 on conflict
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

      // 2. Membership — owner rol
      await tx`
        INSERT INTO public.local_memberships (user_id, restaurante_id, rol, created_at)
        VALUES (${user.id}, ${restaurante_id}, 'owner', NOW())
        ON CONFLICT (user_id, restaurante_id) DO NOTHING
      `;

      // 3. horarios — legacy table used by calcIsOpen (orders.ts) and n8n agent.
      //    Seeds all 7 days as open (09:00–22:00). Owner can adjust from dashboard.
      for (const dia of DIAS_ES) {
        await tx`
          INSERT INTO public.horarios (restaurante_id, dia, disponible, apertura_1, cierre_1)
          VALUES (${restaurante_id}, ${dia}, true, '09:00'::time, '22:00'::time)
          ON CONFLICT (restaurante_id, dia) DO NOTHING
        `;
      }

      // 4. horario_atencion — new table used by dashboard hours editor (hours.ts).
      //    dia_semana: 0=Sunday … 6=Saturday. Seeds all 7 as open (09:00–22:00).
      for (const [dia, dia_semana] of Object.entries(DIA_TO_DIA_SEMANA)) {
        void dia; // used only as Object.keys key
        await tx`
          INSERT INTO public.horario_atencion
            (restaurante_id, dia_semana, hora_apertura, hora_cierre, is_open, updated_at)
          VALUES
            (${restaurante_id}, ${dia_semana}, '09:00'::time, '22:00'::time, true, NOW())
          ON CONFLICT (restaurante_id, dia_semana) DO NOTHING
        `;
      }

      // 5. restaurante_config defaults
      for (const cfg of DEFAULT_CONFIG) {
        await tx`
          INSERT INTO public.restaurante_config
            (restaurante_id, config_key, config_value, description, updated_at)
          VALUES
            (${restaurante_id}, ${cfg.key}, ${cfg.value}, ${cfg.desc}, NOW())
          ON CONFLICT (config_key, restaurante_id) DO NOTHING
        `;
      }

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
      // Unique constraint violation on slug
      return c.json({ error: 'slug_taken', detail: `El slug '${slug}' ya está en uso.` }, 409);
    }
    console.error('[POST /onboarding/complete]', pgErr.message ?? err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

export default onboardingRoutes;
