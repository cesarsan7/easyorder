import { Hono } from 'hono';
import type { Variables } from '../types.js';
import sql from '../lib/db.js';
import { calcIsOpen, getHorarioHoy, getLocalContext, type Horario } from '../lib/is-open.js';
import { resolveTenant } from '../middleware/tenant.js';
import { requireAuth, validateBearerToken } from '../middleware/auth.js';

const dashboardRoutes = new Hono<{ Variables: Variables }>();

// ---------------------------------------------------------------------------
// Notification helper — fire-and-forget POST to n8n webhook.
// URL is read from N8N_WEBHOOK_NOTIFICACION env var.
// If the var is empty or unset, all notifications are silently skipped.
// Never throws — errors are caught and logged so API responses are never blocked.
// ---------------------------------------------------------------------------
const N8N_NOTIFICACION_URL = process.env['N8N_WEBHOOK_NOTIFICACION'] ?? '';

interface NotificationPayload {
  event_type:      string;
  pedido_id:       number;
  pedido_codigo:   string | null;
  telefono:        string;
  tipo_despacho:   string;
  tiempo_estimado: string | null;
  // Solo presente cuando event_type='confirmado' y metodo_pago='transferencia'
  datos_bancarios?: { banco?: string; titular?: string; cuenta?: string; alias?: string } | null;
}

function fireNotification(payload: NotificationPayload): void {
  if (!N8N_NOTIFICACION_URL) return;
  fetch(N8N_NOTIFICACION_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  }).catch((err: unknown) =>
    console.warn('[fireNotification] webhook call failed:', err instanceof Error ? err.message : err),
  );
}


// ---------------------------------------------------------------------------
// Chatwoot bot-resume helper — reactiva el bot automático en Chatwoot cuando
// el operador resuelve una escalación.
// Variables de entorno requeridas:
//   CHATWOOT_BASE_URL  → ej: https://xxx.easypanel.host
//   CHATWOOT_API_TOKEN → API access token de Chatwoot
// ---------------------------------------------------------------------------
const CHATWOOT_BASE_URL  = process.env['CHATWOOT_BASE_URL']  ?? '';
const CHATWOOT_API_TOKEN = process.env['CHATWOOT_API_TOKEN'] ?? '';

function resumeBot(accountId: string, contactId: string): void {
  if (!CHATWOOT_BASE_URL || !CHATWOOT_API_TOKEN) return;
  const url = `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/${contactId}`;
  fetch(url, {
    method:  'PUT',
    headers: {
      'Content-Type':  'application/json',
      'api_access_token': CHATWOOT_API_TOKEN,
    },
    body: JSON.stringify({ custom_attributes: { bot: 'On' } }),
  }).catch((err: unknown) =>
    console.warn('[resumeBot] Chatwoot call failed:', err instanceof Error ? err.message : err),
  );
}
// ----------------------------------------------------------------------------
// GET /dashboard/me  ← debe estar ANTES del middleware /:slug/*
//
// Retorna los restaurantes a los que pertenece el usuario autenticado.
// No requiere slug — el dashboard index lo llama después del login para
// resolver a dónde redirigir.
// ----------------------------------------------------------------------------
dashboardRoutes.get('/me', async (c) => {
  const user = await validateBearerToken(c.req.header('Authorization'));
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const rows = await sql<{ slug: string; nombre: string; rol: string }[]>`
    SELECT r.slug, r.nombre, lm.rol
    FROM   local_memberships lm
    JOIN   restaurante r ON r.id = lm.restaurante_id
    WHERE  lm.user_id = ${user.id}
    ORDER  BY lm.restaurante_id ASC
    LIMIT  10
  `;

  return c.json({ restaurants: rows });
});

// ----------------------------------------------------------------------------
// POST /dashboard/admin/restaurants
//
// Crea un nuevo restaurante y asigna al usuario autenticado como owner.
// No requiere slug en URL — opera a nivel de usuario, no de tenant.
//
// Body: {
//   nombre:       string (requerido)
//   slug:         string (requerido, solo [a-z0-9-], max 100)
//   zona_horaria?: string  (default: 'Atlantic/Canary')
//   moneda?:      string  (default: '€')
//   telefono?:    string
//   direccion?:   string
//   descripcion?: string
//   brand_color?: string  (hex #RRGGBB, default: '#E63946')
// }
//
// Returns: { id, nombre, slug, rol: 'owner' }
// ----------------------------------------------------------------------------
const SLUG_FORMAT_RE = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$|^[a-z0-9]$/;
const VALID_TZ_RE    = /^[A-Za-z_/]{3,50}$/;
const HEX_COLOR_RE   = /^#[0-9A-Fa-f]{6}$/;

dashboardRoutes.post('/admin/restaurants', async (c) => {
  const user = await validateBearerToken(c.req.header('Authorization'));
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const b = body as Record<string, unknown>;

  // --- nombre ----------------------------------------------------------------
  if (typeof b['nombre'] !== 'string' || b['nombre'].trim() === '') {
    return c.json({ error: 'nombre_required', detail: 'nombre must be a non-empty string' }, 400);
  }
  const nombre = b['nombre'].trim();
  if (nombre.length > 200) {
    return c.json({ error: 'nombre_too_long', detail: 'nombre must be 200 characters or fewer' }, 400);
  }

  // --- slug ------------------------------------------------------------------
  if (typeof b['slug'] !== 'string' || b['slug'].trim() === '') {
    return c.json({ error: 'slug_required', detail: 'slug must be a non-empty string (lowercase letters, numbers, hyphens)' }, 400);
  }
  const slug = b['slug'].trim().toLowerCase();
  if (!SLUG_FORMAT_RE.test(slug)) {
    return c.json({ error: 'slug_invalid', detail: 'slug must contain only lowercase letters, numbers, and hyphens; cannot start or end with a hyphen' }, 400);
  }

  // --- zona_horaria (optional) -----------------------------------------------
  let zona_horaria = 'Atlantic/Canary';
  if (b['zona_horaria'] !== undefined && b['zona_horaria'] !== null) {
    if (typeof b['zona_horaria'] !== 'string' || !VALID_TZ_RE.test(b['zona_horaria'])) {
      return c.json({ error: 'zona_horaria_invalid', detail: 'zona_horaria must be a valid IANA timezone string' }, 400);
    }
    zona_horaria = b['zona_horaria'] as string;
  }

  // --- moneda (optional) -----------------------------------------------------
  let moneda = '€';
  if (b['moneda'] !== undefined && b['moneda'] !== null) {
    if (typeof b['moneda'] !== 'string' || b['moneda'].trim().length > 5) {
      return c.json({ error: 'moneda_invalid', detail: 'moneda must be a string of 5 characters or fewer' }, 400);
    }
    moneda = b['moneda'].trim();
  }

  // --- brand_color (optional) ------------------------------------------------
  let brand_color = '#E63946';
  if (b['brand_color'] !== undefined && b['brand_color'] !== null) {
    if (typeof b['brand_color'] !== 'string' || !HEX_COLOR_RE.test(b['brand_color'])) {
      return c.json({ error: 'brand_color_invalid', detail: 'brand_color must be a hex color string (#RRGGBB)' }, 400);
    }
    brand_color = b['brand_color'] as string;
  }

  // --- optional text fields --------------------------------------------------
  const telefono    = typeof b['telefono']    === 'string' ? b['telefono'].trim()    || null : null;
  const direccion   = typeof b['direccion']   === 'string' ? b['direccion'].trim()   || null : null;
  const descripcion = typeof b['descripcion'] === 'string' ? b['descripcion'].trim() || null : null;

  try {
    const result = await sql.begin(async (tx) => {
      const [newRest] = await tx<{ id: number; nombre: string; slug: string }[]>`
        INSERT INTO restaurante
          (nombre, slug, zona_horaria, moneda, brand_color, telefono, direccion, descripcion)
        VALUES
          (${nombre}, ${slug}, ${zona_horaria}, ${moneda}, ${brand_color},
           ${telefono}, ${direccion}, ${descripcion})
        RETURNING id, nombre, slug
      `;

      await tx`
        INSERT INTO local_memberships (user_id, restaurante_id, rol)
        VALUES (${user.id}, ${newRest.id}, 'owner')
        ON CONFLICT (user_id, restaurante_id) DO NOTHING
      `;

      return newRest;
    });

    return c.json({ id: result.id, nombre: result.nombre, slug: result.slug, rol: 'owner' }, 201);

  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === '23505') {
      return c.json({ error: 'slug_conflict', detail: `A restaurant with slug '${slug}' already exists` }, 409);
    }
    console.error('[POST /dashboard/admin/restaurants]', pgErr.message ?? err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// All dashboard routes: slug resolution first, then JWT auth.
// IMPORTANTE: este middleware va DESPUÉS de /me para que /:slug/* no lo capture.
dashboardRoutes.use('/:slug/*', resolveTenant, requireAuth);

// ----------------------------------------------------------------------------
// GET /dashboard/:slug/orders
//
// Returns a paginated list of the operator's orders for a given day.
//
// Query params:
//   estado (string, optional) — filter by state; if omitted, excludes
//     'entregado' and 'cancelado' (the active-orders view).
//   page  (integer, optional, default 1)
//   limit (integer, optional, default 50, max 200)
//   fecha (ISO date YYYY-MM-DD, optional) — day to query in the restaurant's
//     local timezone; defaults to today.
//
// Multi-tenant guarantee: restaurante_id comes exclusively from the
// resolveTenant middleware (slug → id). It is never read from the request body
// or query params.
// ----------------------------------------------------------------------------
dashboardRoutes.get('/:slug/orders', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  // --- Validate query params ------------------------------------------------
  const estadoParam     = c.req.query('estado');
  const fechaParam      = c.req.query('fecha');
  const fechaDesdeParam = c.req.query('fecha_desde');
  const fechaHastaParam = c.req.query('fecha_hasta');
  const pageParam       = c.req.query('page');
  const limitParam      = c.req.query('limit');

  const VALID_ESTADOS = [
    'recibido', 'en_curso', 'confirmado', 'en_preparacion', 'listo',
    'en_camino', 'pendiente_pago', 'entregado', 'cancelado', 'expirado',
  ];
  if (estadoParam && !VALID_ESTADOS.includes(estadoParam)) {
    return c.json({ error: 'invalid_estado', valid_values: VALID_ESTADOS }, 400);
  }

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (fechaParam) {
    const validFormat = DATE_RE.test(fechaParam);
    const validDate   = validFormat && !isNaN(new Date(fechaParam + 'T00:00:00Z').getTime());
    if (!validFormat || !validDate) {
      return c.json({ error: 'invalid_fecha_format', expected: 'YYYY-MM-DD' }, 400);
    }
  }
  if (fechaDesdeParam && !DATE_RE.test(fechaDesdeParam)) {
    return c.json({ error: 'invalid_fecha_desde', expected: 'YYYY-MM-DD' }, 400);
  }
  if (fechaHastaParam && !DATE_RE.test(fechaHastaParam)) {
    return c.json({ error: 'invalid_fecha_hasta', expected: 'YYYY-MM-DD' }, 400);
  }

  const page  = pageParam  ? parseInt(pageParam,  10) : 1;
  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (!Number.isInteger(page)  || page  < 1) {
    return c.json({ error: 'invalid_page', detail: 'page must be a positive integer' }, 400);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return c.json({ error: 'invalid_limit', detail: 'limit must be between 1 and 200' }, 400);
  }

  try {
    // Q1 — fetch timezone so all date comparisons use the restaurant's local
    // clock, not UTC. resolveTenant already verified this slug exists, but the
    // guard below protects against a race condition between the two queries.
    const tzRows = await sql<{ zona_horaria: string }[]>`
      SELECT zona_horaria
      FROM   restaurante
      WHERE  id = ${restaurante_id}
      LIMIT  1
    `;

    const tz = tzRows[0];
    if (!tz) {
      return c.json({ error: 'restaurant_not_found' }, 404);
    }

    const zonaHoraria = tz.zona_horaria;
    const fecha  = fechaParam ?? getLocalIsoDate(zonaHoraria);
    const offset = (page - 1) * limit;

    const isActiveTab   = !estadoParam && !fechaParam && !fechaDesdeParam && !fechaHastaParam;
    const hasRangeFilter = fechaDesdeParam || fechaHastaParam;

    const estadoFilter = estadoParam
      ? sql`AND p.estado = ${estadoParam}`
      : isActiveTab
        ? sql`AND p.estado NOT IN ('entregado', 'cancelado', 'expirado')`
        : sql``;

    const dateFilter = isActiveTab
      ? sql``
      : hasRangeFilter
        ? sql`AND DATE(p.created_at AT TIME ZONE ${zonaHoraria}) >= ${(fechaDesdeParam ?? '2000-01-01')}::date
              AND DATE(p.created_at AT TIME ZONE ${zonaHoraria}) <= ${(fechaHastaParam ?? '2099-12-31')}::date`
        : sql`AND DATE(p.created_at AT TIME ZONE ${zonaHoraria}) = ${fecha}::date`;

    const [countRows, orderRows] = await Promise.all([

      // Q2 — total matching rows (no LIMIT/OFFSET).
      sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total
        FROM   pedidos p
        WHERE  p.restaurante_id = ${restaurante_id}
          ${dateFilter}
          ${estadoFilter}
      `,

      // Q3 — paginated order list with operator-relevant fields.
      // LEFT JOIN usuarios: if the user row was deleted (ON DELETE SET NULL),
      // nombre_cliente falls back to the phone number stored on the order itself.
      // items_count uses jsonb_array_length to avoid transferring the full JSONB.
      sql<OrderListRow[]>`
        SELECT
          p.id,
          p.pedido_codigo,
          p.estado,
          p.tipo_despacho,
          p.total,
          p.subtotal,
          p.costo_envio,
          p.metodo_pago,
          p.notas,
          p.telefono,
          COALESCE(u.nombre, p.telefono)  AS nombre_cliente,
          p.direccion,
          p.postal_code,
          dz.zone_name,
          p.tiempo_estimado,
          jsonb_array_length(p.items)     AS items_count,
          p.estado_pago,
          p.items,
          p.created_at,
          p.updated_at
        FROM   pedidos  p
        LEFT JOIN usuarios       u  ON u.id             = p.usuario_id
        LEFT JOIN delivery_zone  dz ON dz.postal_code   = p.postal_code
        WHERE  p.restaurante_id = ${restaurante_id}
          ${dateFilter}
          ${estadoFilter}
        ORDER BY p.created_at DESC
        LIMIT  ${limit}
        OFFSET ${offset}
      `,
    ]);

    return c.json({
      total:  Number(countRows[0]?.total ?? 0),
      page,
      limit,
      orders: orderRows.map((o) => ({
        id:              o.id,
        pedido_codigo:   o.pedido_codigo,
        estado:          o.estado,
        tipo_despacho:   o.tipo_despacho,
        total:           Number(o.total),
        subtotal:        Number(o.subtotal),
        costo_envio:     Number(o.costo_envio),
        metodo_pago:     o.metodo_pago,
        notas:           o.notas ?? null,
        telefono:        o.telefono,
        nombre_cliente:  o.nombre_cliente,
        direccion:       o.direccion ?? null,
        postal_code:     o.postal_code ?? null,
        zone_name:       o.zone_name ?? null,
        tiempo_estimado: o.tiempo_estimado ?? null,
        items_count:     Number(o.items_count ?? 0),
        items:           o.items ?? [],
        estado_pago:     o.estado_pago ?? 'pendiente',
        created_at:      o.created_at,
        updated_at:      o.updated_at,
      })),
    });

  } catch (err) {
    console.error('[GET /dashboard/:slug/orders] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// GET /dashboard/:slug/restaurant/status
//
// Returns the restaurant's current open/closed status for the operator panel.
// Exposes both the effective is_open (override wins) and is_open_calculated
// (auto schedule) separately so the operator can see whether an override is
// active. Also includes the full weekly schedule (with row ids) and the
// formatted local time/day so the UI can display "it is now 14:32 on Monday".
//
// Precondition warning (endpoint 9 in doc 16):
//   restaurante_config.restaurante_id must be a proper column for the override
//   queries below to be multi-tenant safe. The tolerant .catch() pattern is the
//   same one used in /public/:slug/restaurant — override silently becomes null
//   if the column does not yet exist.
// ----------------------------------------------------------------------------
dashboardRoutes.get('/:slug/restaurant/status', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  try {
    const [restauranteRows, horariosRows, overrideRows, reasonRows] = await Promise.all([

      // Q1: restaurant identity + timezone (the only timezone source allowed).
      sql<RestauranteStatusRow[]>`
        SELECT id, nombre, zona_horaria
        FROM   restaurante
        WHERE  id = ${restaurante_id}
        LIMIT  1
      `,

      // Q2: full week schedule with IDs.
      // horarios_semana in the contract includes the row id and uses HH:MM:SS.
      // calcIsOpen receives these rows directly — timeToMinutes ignores seconds.
      sql<HorarioWithId[]>`
        SELECT
          id,
          dia,
          disponible,
          TO_CHAR(apertura_1, 'HH24:MI:SS') AS apertura_1,
          TO_CHAR(cierre_1,   'HH24:MI:SS') AS cierre_1,
          TO_CHAR(apertura_2, 'HH24:MI:SS') AS apertura_2,
          TO_CHAR(cierre_2,   'HH24:MI:SS') AS cierre_2
        FROM horarios
        WHERE restaurante_id = ${restaurante_id}
        ORDER BY
          CASE dia
            WHEN 'Lunes'     THEN 1
            WHEN 'Martes'    THEN 2
            WHEN 'Miércoles' THEN 3
            WHEN 'Jueves'    THEN 4
            WHEN 'Viernes'   THEN 5
            WHEN 'Sábado'    THEN 6
            WHEN 'Domingo'   THEN 7
            ELSE 8
          END ASC
      `,

      // Q3: manual open/close override stored as "true"/"false" string.
      // .catch() tolerates the pending migration that adds restaurante_id
      // as a proper column to restaurante_config. Until then, override = null.
      sql<{ config_value: string }[]>`
        SELECT config_value
        FROM   restaurante_config
        WHERE  config_key     = 'is_open_override'
          AND  restaurante_id = ${restaurante_id}
        LIMIT  1
      `.catch(() => [] as { config_value: string }[]),

      // Q4: optional human-readable reason for the override (pending migration).
      sql<{ config_value: string }[]>`
        SELECT config_value
        FROM   restaurante_config
        WHERE  config_key     = 'is_open_override_reason'
          AND  restaurante_id = ${restaurante_id}
        LIMIT  1
      `.catch(() => [] as { config_value: string }[]),
    ]);

    // Guard against race condition between resolveTenant and Q1.
    const r = restauranteRows[0];
    if (!r) {
      return c.json({ error: 'restaurant_not_found' }, 404);
    }

    // Parse override value. Warn on unexpected strings — treat as null.
    const rawOverride = overrideRows[0]?.config_value ?? null;
    if (rawOverride !== null && rawOverride !== 'true' && rawOverride !== 'false') {
      console.warn(
        `[tenant:${restaurante_id}] Unexpected is_open_override value: "${rawOverride}" — treating as null`,
      );
    }
    const isOpenOverride =
      rawOverride === 'true'  ? true  :
      rawOverride === 'false' ? false :
      null;

    const overrideReason = reasonRows[0]?.config_value ?? null;

    // calcIsOpen accepts HorarioWithId[] — structural typing satisfies Horario[].
    // Timezone source is always restaurante.zona_horaria.
    const isOpenCalculated = calcIsOpen(horariosRows as Horario[], r.zona_horaria);
    const isOpen = isOpenOverride !== null ? isOpenOverride : isOpenCalculated;

    // Compute current local time and weekday for the operator display.
    const { diaEs, horaLocal } = getLocalContext(r.zona_horaria);

    // horario_hoy: find today's row (may be null if no schedule is configured).
    // Slice to "HH:MM" — horario_hoy uses no-seconds format per contract.
    const horarioHoyRaw = getHorarioHoy(horariosRows as Horario[], r.zona_horaria) as HorarioWithId | null;
    const horarioHoy = horarioHoyRaw
      ? {
          disponible: horarioHoyRaw.disponible,
          apertura_1: horarioHoyRaw.apertura_1?.slice(0, 5) ?? null,
          cierre_1:   horarioHoyRaw.cierre_1?.slice(0, 5)   ?? null,
          apertura_2: horarioHoyRaw.apertura_2?.slice(0, 5) ?? null,
          cierre_2:   horarioHoyRaw.cierre_2?.slice(0, 5)   ?? null,
        }
      : null;

    return c.json({
      restaurante_id,
      nombre:               r.nombre,
      is_open:              isOpen,
      is_open_calculated:   isOpenCalculated,
      is_open_override:     isOpenOverride,
      override_reason:      overrideReason,
      zona_horaria:         r.zona_horaria,
      hora_local_actual:    horaLocal,
      dia_actual:           diaEs,
      horario_hoy:          horarioHoy,
      horarios_semana: horariosRows.map((h) => ({
        id:         h.id,
        dia:        h.dia,
        disponible: h.disponible,
        apertura_1: h.apertura_1,
        cierre_1:   h.cierre_1,
        apertura_2: h.apertura_2,
        cierre_2:   h.cierre_2,
      })),
    });

  } catch (err) {
    console.error('[GET /dashboard/:slug/restaurant/status] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// GET /dashboard/:slug/home/metrics
//
// Returns aggregated metrics for the operator's home panel.
// All date comparisons use the restaurant's own timezone — never UTC.
//
// Query params:
//   fecha (ISO date, optional) — day to query; defaults to today in the
//   restaurant's timezone. Format: YYYY-MM-DD.
//
// Three parallel queries after the first timezone fetch:
//   Q2 — today's counters + revenue in one SELECT with FILTER clauses.
//   Q3 — active orders count and oldest pending order for the day.
//   Q4 — last 7 complete days (excluding today) for the weekly summary.
// ---------------------------------------------------------------------------
dashboardRoutes.get('/:slug/home/metrics', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  // Validate optional fecha param — reject malformed and semantically invalid
  // dates before they reach PostgreSQL (invalid dates would cause a DB error
  // that the catch converts to 503, confusing operators and monitoring).
  const fechaParam = c.req.query('fecha');
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (fechaParam) {
    const isValidFormat = DATE_RE.test(fechaParam);
    const isValidDate   = isValidFormat && !isNaN(new Date(fechaParam + 'T00:00:00Z').getTime());
    if (!isValidFormat || !isValidDate) {
      return c.json({ error: 'invalid_fecha_format', expected: 'YYYY-MM-DD' }, 400);
    }
  }

  try {
    // Q1 — fetch timezone; restaurante_id is already verified by resolveTenant.
    const tzRows = await sql<{ zona_horaria: string }[]>`
      SELECT zona_horaria
      FROM   restaurante
      WHERE  id = ${restaurante_id}
      LIMIT  1
    `;

    const tz = tzRows[0];
    if (!tz) {
      return c.json({ error: 'restaurant_not_found' }, 404);
    }

    const zonaHoraria = tz.zona_horaria;
    if (!zonaHoraria) {
      return c.json({ error: 'restaurant_misconfigured', detail: 'zona_horaria is not set' }, 500);
    }

    const fecha = fechaParam ?? getLocalIsoDate(zonaHoraria);

    // Q2, Q3, Q4 run in parallel — all share the same restaurante_id + timezone
    // filter so cross-tenant data leakage is impossible.
    const [todayRows, activeRows, last7Rows] = await Promise.all([

      // Q2 — all of today's metrics in a single pass using FILTER aggregates.
      // revenue_total and costo_envio_total exclude cancelled orders.
      sql<TodayMetricsRow[]>`
        SELECT
          COUNT(*)::int                                                                          AS pedidos_total,
          COUNT(*) FILTER (WHERE estado = 'recibido')::int                                      AS pedidos_recibidos,
          COUNT(*) FILTER (WHERE estado = 'confirmado')::int                                    AS pedidos_confirmados,
          COUNT(*) FILTER (WHERE estado = 'en_preparacion')::int                                AS pedidos_en_preparacion,
          COUNT(*) FILTER (WHERE estado = 'en_camino')::int                                     AS pedidos_en_camino,
          COUNT(*) FILTER (WHERE estado = 'entregado')::int                                     AS pedidos_entregados,
          COUNT(*) FILTER (WHERE estado = 'cancelado')::int                                     AS pedidos_cancelados,
          COUNT(*) FILTER (WHERE estado = 'pendiente_pago')::int                                AS pedidos_pendiente_pago,
          COALESCE(SUM(total)      FILTER (WHERE estado != 'cancelado'), 0)::numeric            AS revenue_total,
          COALESCE(SUM(total)      FILTER (WHERE estado != 'cancelado' AND tipo_despacho = 'delivery'), 0)::numeric AS revenue_delivery,
          COALESCE(SUM(total)      FILTER (WHERE estado != 'cancelado' AND tipo_despacho = 'retiro'),   0)::numeric AS revenue_retiro,
          COALESCE(SUM(costo_envio) FILTER (WHERE estado != 'cancelado'), 0)::numeric           AS costo_envio_total
        FROM pedidos
        WHERE restaurante_id = ${restaurante_id}
          AND DATE(created_at AT TIME ZONE ${zonaHoraria}) = ${fecha}::date
      `,

      // Q3 — active orders for the day (excludes terminal states).
      // oldest_created_at flags orders that may have been missed by the operator.
      sql<ActiveOrdersRow[]>`
        SELECT
          COUNT(*)::int       AS count,
          MIN(created_at)     AS oldest_created_at
        FROM pedidos
        WHERE restaurante_id = ${restaurante_id}
          AND DATE(created_at AT TIME ZONE ${zonaHoraria}) = ${fecha}::date
          AND estado NOT IN ('entregado', 'cancelado')
      `,

      // Q4 — last 7 complete days, excluding today.
      // revenue uses only 'entregado' orders for a clean revenue figure.
      sql<Last7DaysRow[]>`
        SELECT
          COUNT(*)::int                                                                 AS pedidos_total,
          COALESCE(SUM(total) FILTER (WHERE estado = 'entregado'), 0)::numeric         AS revenue_total
        FROM pedidos
        WHERE restaurante_id = ${restaurante_id}
          AND DATE(created_at AT TIME ZONE ${zonaHoraria}) >= (${fecha}::date - INTERVAL '7 days')
          AND DATE(created_at AT TIME ZONE ${zonaHoraria}) <  ${fecha}::date
      `,
    ]);

    const t = todayRows[0];
    const a = activeRows[0];
    const l = last7Rows[0];

    const pedidosEntregados = Number(t.pedidos_entregados);
    const revenueTotal      = Number(t.revenue_total);

    const ticketPromedio =
      pedidosEntregados > 0
        ? Math.round((revenueTotal / pedidosEntregados) * 100) / 100
        : null;

    return c.json({
      restaurante_id,
      fecha,
      zona_horaria: zonaHoraria,
      today: {
        pedidos_total:         Number(t.pedidos_total),
        pedidos_recibidos:     Number(t.pedidos_recibidos),
        pedidos_confirmados:   Number(t.pedidos_confirmados),
        pedidos_en_preparacion: Number(t.pedidos_en_preparacion),
        pedidos_en_camino:     Number(t.pedidos_en_camino),
        pedidos_entregados:    pedidosEntregados,
        pedidos_cancelados:    Number(t.pedidos_cancelados),
        pedidos_pendiente_pago: Number(t.pedidos_pendiente_pago),
        revenue_total:         revenueTotal,
        revenue_delivery:      Number(t.revenue_delivery),
        revenue_retiro:        Number(t.revenue_retiro),
        ticket_promedio:       ticketPromedio,
        costo_envio_total:     Number(t.costo_envio_total),
      },
      active_orders: {
        count:             Number(a.count),
        oldest_created_at: a.oldest_created_at ?? null,
      },
      last_7_days: {
        pedidos_total:  Number(l.pedidos_total),
        revenue_total:  Number(l.revenue_total),
      },
    });

  } catch (err) {
    console.error('[GET /dashboard/:slug/home/metrics] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PATCH /dashboard/:slug/orders/:id/status
//
// Advances a pedido through the operator-controlled state machine.
// Validates the transition against an explicit allowlist before writing.
//
// Special rule for 'listo':
//   → 'en_camino'  is only allowed when tipo_despacho = 'delivery'
//   → 'entregado'  is only allowed when tipo_despacho = 'retiro'
//
// Multi-tenant guarantee: the UPDATE includes restaurante_id = $id so a
// valid JWT for tenant A cannot mutate an order that belongs to tenant B.
// ----------------------------------------------------------------------------

const TRANSITIONS: Record<string, readonly string[]> = {
  recibido:       ['confirmado', 'cancelado', 'expirado'],  // expirado = manual desde dashboard
  en_curso:       ['confirmado', 'cancelado', 'expirado'],  // expirado = automático por cron o manual
  pendiente_pago: ['pagado', 'confirmado', 'cancelado'],
  confirmado:     ['en_preparacion', 'cancelado'],
  pagado:         ['en_preparacion', 'cancelado'],
  en_preparacion: ['listo', 'cancelado'],
  listo:          ['en_camino', 'entregado', 'cancelado'],
  en_camino:      ['entregado', 'cancelado'],
  entregado:      [],
  cancelado:      [],
  expirado:       [],  // estado terminal — sin transiciones salidas
};

const VALID_ESTADOS_DESTINO = [
  'confirmado', 'pagado', 'en_preparacion', 'listo',
  'en_camino', 'entregado', 'cancelado', 'expirado',
] as const;

dashboardRoutes.patch('/:slug/orders/:id/status', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  // --- Validate :id path param ------------------------------------------------
  const idParam = c.req.param('id');
  const id = parseInt(idParam, 10);
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: 'invalid_id' }, 400);
  }

  // --- Parse + validate body --------------------------------------------------
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  if (!body || typeof body !== 'object' || !('estado' in body)) {
    return c.json({ error: 'estado_required' }, 400);
  }

  const estadoNuevo = (body as Record<string, unknown>).estado;
  if (typeof estadoNuevo !== 'string' || !(VALID_ESTADOS_DESTINO as readonly string[]).includes(estadoNuevo)) {
    return c.json({ error: 'invalid_estado', valid_values: VALID_ESTADOS_DESTINO }, 400);
  }

  try {
    // Step 1 — read the order, verify tenant ownership in the same query.
    // telefono + tiempo_estimado are needed for WhatsApp notifications fired later.
    const rows = await sql<PedidoStatusRow[]>`
      SELECT id, pedido_codigo, estado, tipo_despacho, telefono, tiempo_estimado, metodo_pago
      FROM   pedidos
      WHERE  id             = ${id}
        AND  restaurante_id = ${restaurante_id}
      LIMIT  1
    `;

    if (rows.length === 0) {
      return c.json({ error: 'order_not_found' }, 404);
    }

    const pedido = rows[0];
    const estadoActual = pedido.estado;

    // Step 2 — check the transition is allowed for this state.
    const allowed = TRANSITIONS[estadoActual] ?? [];
    if (!allowed.includes(estadoNuevo)) {
      return c.json({ error: 'transition_not_allowed', from: estadoActual, to: estadoNuevo }, 422);
    }

    // Step 2b — extra constraint on 'listo': delivery type governs which exit is valid.
    if (estadoActual === 'listo' && estadoNuevo !== 'cancelado') {
      if (pedido.tipo_despacho !== 'delivery' && pedido.tipo_despacho !== 'retiro') {
        return c.json({ error: 'invalid_tipo_despacho', value: pedido.tipo_despacho }, 500);
      }
      if (estadoNuevo === 'en_camino' && pedido.tipo_despacho !== 'delivery') {
        return c.json({ error: 'transition_not_allowed', from: estadoActual, to: estadoNuevo, detail: 'en_camino requires delivery' }, 422);
      }
      if (estadoNuevo === 'entregado' && pedido.tipo_despacho !== 'retiro') {
        return c.json({ error: 'transition_not_allowed', from: estadoActual, to: estadoNuevo, detail: 'entregado from listo requires retiro' }, 422);
      }
    }

    // Step 2c — entregado requiere que el pago esté resuelto.
    // estado_pago='pendiente' ocurre cuando el método es transferencia/bizum/online
    // y el operador aún no confirmó el comprobante.
    if (estadoNuevo === 'entregado' && pedido.estado_pago === 'pendiente') {
      return c.json({
        error:  'payment_pending',
        from:   estadoActual,
        to:     estadoNuevo,
        detail: 'Confirm or reject the payment before marking the order as entregado.',
      }, 422);
    }

    // Step 3 — update with tenant guard repeated in WHERE to prevent TOCTOU.
    // SET LOCAL instructs the trigger fn_log_estado_pedido to record the real origen/actor.
    const user = await validateBearerToken(c.req.header('Authorization'));
    const actorEmail = user?.email ?? 'unknown';

    const updated = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.origen', 'dashboard', true)`;
      await tx`SELECT set_config('app.actor',  ${actorEmail}, true)`;
      return tx<{ id: number; pedido_codigo: string | null; estado: string; updated_at: string }[]>`
        UPDATE pedidos
        SET    estado     = ${estadoNuevo},
               updated_at = NOW()
        WHERE  id             = ${id}
          AND  restaurante_id = ${restaurante_id}
        RETURNING id, pedido_codigo, estado, updated_at
      `;
    });

    const u = updated[0];

    // Step 4 — fire-and-forget WhatsApp notification for key state transitions.
    // Matriz de notificaciones:
    //   Retiro  : confirmado (+ datos bancarios si transferencia) | listo | entregado | cancelado
    //   Delivery: confirmado (+ datos bancarios si transferencia) | en_camino | entregado | cancelado
    //   Ambos   : pago_confirmado (gestionado en el endpoint /payment)
    //
    // 'listo' solo se notifica en retiro — en delivery es un estado interno del local.
    const NOTIFY_ESTADOS = new Set(['confirmado', 'en_camino', 'listo', 'entregado', 'cancelado']);
    const skipNotify = estadoNuevo === 'listo' && pedido.tipo_despacho === 'delivery';

    if (NOTIFY_ESTADOS.has(estadoNuevo) && !skipNotify) {
      let datosBancarios: { banco?: string; titular?: string; cuenta?: string; alias?: string } | null = null;

      if (estadoNuevo === 'confirmado' && pedido.metodo_pago === 'transferencia') {
        const restRows = await sql<{ datos_bancarios: { banco?: string; titular?: string; cuenta?: string; alias?: string } | null }[]>`
          SELECT datos_bancarios FROM restaurante WHERE id = ${restaurante_id} LIMIT 1
        `;
        datosBancarios = restRows[0]?.datos_bancarios ?? null;
      }

      fireNotification({
        event_type:      estadoNuevo,
        pedido_id:       u.id,
        pedido_codigo:   pedido.pedido_codigo,
        telefono:        pedido.telefono,
        tipo_despacho:   pedido.tipo_despacho,
        tiempo_estimado: pedido.tiempo_estimado,
        datos_bancarios: datosBancarios,
      });
    }

    // Step 5 — respond 200 with the diff the frontend needs to re-render.
    return c.json({
      id:              u.id,
      pedido_codigo:   u.pedido_codigo,
      estado_anterior: estadoActual,
      estado:          u.estado,
      updated_at:      u.updated_at,
    });

  } catch (err) {
    console.error('[PATCH /dashboard/:slug/orders/:id/status] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PATCH /dashboard/:slug/orders/:id/payment
//
// Updates estado_pago of an order. Independent of the operational state machine.
// Valid transitions from the dashboard: pendiente → pagado | rechazado
// ----------------------------------------------------------------------------

const VALID_ESTADO_PAGO = ['pendiente', 'pagado', 'rechazado', 'no_aplica'] as const;

dashboardRoutes.patch('/:slug/orders/:id/payment', requireAuth, async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: 'invalid_id' }, 400);
  }

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }

  const estadoPago = (body as Record<string, unknown>).estado_pago;
  if (typeof estadoPago !== 'string' || !(VALID_ESTADO_PAGO as readonly string[]).includes(estadoPago)) {
    return c.json({ error: 'invalid_estado_pago', valid_values: VALID_ESTADO_PAGO }, 400);
  }

  try {
    // Include telefono + pedido_codigo + tipo_despacho + tiempo_estimado in RETURNING
    // so the WhatsApp notification can be fired without a second DB round-trip.
    const updated = await sql<{
      id:              number;
      estado_pago:     string;
      updated_at:      string;
      pedido_codigo:   string | null;
      telefono:        string;
      tipo_despacho:   string;
      tiempo_estimado: string | null;
    }[]>`
      UPDATE pedidos
      SET    estado_pago = ${estadoPago},
             updated_at  = NOW()
      WHERE  id             = ${id}
        AND  restaurante_id = ${restaurante_id}
      RETURNING id, estado_pago, updated_at, pedido_codigo, telefono, tipo_despacho, tiempo_estimado
    `;
    if (updated.length === 0) return c.json({ error: 'order_not_found' }, 404);

    const u = updated[0];

    // Fire WhatsApp notification when the operator confirms the payment.
    if (estadoPago === 'pagado') {
      fireNotification({
        event_type:      'pago_confirmado',
        pedido_id:       u.id,
        pedido_codigo:   u.pedido_codigo,
        telefono:        u.telefono,
        tipo_despacho:   u.tipo_despacho,
        tiempo_estimado: u.tiempo_estimado,
      });
    }

    return c.json({ id: u.id, estado_pago: u.estado_pago, updated_at: u.updated_at });
  } catch (err) {
    console.error('[PATCH /dashboard/:slug/orders/:id/payment] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PATCH /dashboard/:slug/restaurant/status
//
// Lets the operator manually override the restaurant's open/closed state,
// bypassing the automatic schedule calculation.
//
// Body:
//   is_open_override  boolean | null  — true=force open, false=force closed,
//                                       null=remove override (revert to schedule)
//   reason            string?         — optional human note, max 500 chars
//
// Role guard: only 'owner' and 'admin' members may call this endpoint.
//
// Precondition (⚠️ blocking migration):
//   restaurante_config must have a composite unique constraint on
//   (config_key, restaurante_id) for the UPSERT ON CONFLICT to work.
//   If missing, PG error 42P10 → 503 { error: 'migration_required' }.
//   The DELETE path (null override) works without the migration.
//
// Atomicity: the override value and its reason are written inside a single
// transaction (sql.begin). The reason is always cleared before re-inserting
// so no stale reason from a prior override can survive a new call.
//
// Confirmation read: after the write, all response fields are derived from
// a SELECT back from the DB — never from the request body.
// ----------------------------------------------------------------------------
dashboardRoutes.patch('/:slug/restaurant/status', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  // MEDIO-4: only owner/admin may toggle the open state.
  const rol = c.get('rol');
  if (rol !== 'owner' && rol !== 'admin') {
    return c.json({ error: 'forbidden', detail: 'role owner or admin required' }, 403);
  }

  // --- Parse body -------------------------------------------------------------
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  if (!body || typeof body !== 'object' || !('is_open_override' in body)) {
    return c.json({ error: 'is_open_override_required' }, 400);
  }

  const raw         = body as Record<string, unknown>;
  const overrideRaw = raw['is_open_override'];
  const reasonRaw   = raw['reason'];

  if (overrideRaw !== null && overrideRaw !== true && overrideRaw !== false) {
    return c.json({
      error:  'invalid_is_open_override',
      detail: 'must be true, false, or null',
    }, 400);
  }
  const isOpenOverride = overrideRaw as boolean | null;

  if (reasonRaw !== undefined && reasonRaw !== null && typeof reasonRaw !== 'string') {
    return c.json({ error: 'invalid_reason', detail: 'must be a string or null' }, 400);
  }
  const reason = (typeof reasonRaw === 'string' && reasonRaw.trim().length > 0)
    ? reasonRaw.trim()
    : null;

  // BAJO-3: guard against varchar(500) overflow before hitting the DB.
  if (reason !== null && reason.length > 500) {
    return c.json({ error: 'reason_too_long', detail: 'reason must be 500 characters or fewer' }, 400);
  }

  try {
    if (isOpenOverride === null) {
      // Remove override entirely — revert to automatic schedule.
      // Plain DELETE; no composite constraint needed for this path.
      await sql`
        DELETE FROM restaurante_config
        WHERE  config_key     IN ('is_open_override', 'is_open_override_reason')
          AND  restaurante_id =  ${restaurante_id}
      `;
    } else {
      // CRÍTICO-1: single transaction — override value + reason are written
      // atomically. A failure in either statement rolls back both.
      //
      // CRÍTICO-2: always DELETE the stale reason first, then conditionally
      // re-insert it. A call without reason will never leave a reason from a
      // previous override visible in the GET endpoint.
      //
      // BAJO-1: both UPSERTs share the same transaction; if the composite
      // constraint is missing, the first UPSERT raises 42P10 and the whole
      // transaction is aborted — consistent error surface.
      await sql.begin(async (tx) => {
        // Clear any stale reason unconditionally before writing override.
        await tx`
          DELETE FROM restaurante_config
          WHERE  config_key     = 'is_open_override_reason'
            AND  restaurante_id = ${restaurante_id}
        `;

        await tx`
          INSERT INTO restaurante_config (config_key, config_value, restaurante_id)
          VALUES ('is_open_override', ${String(isOpenOverride)}, ${restaurante_id})
          ON CONFLICT (config_key, restaurante_id) DO UPDATE
            SET config_value = EXCLUDED.config_value
        `;

        if (reason !== null) {
          await tx`
            INSERT INTO restaurante_config (config_key, config_value, restaurante_id)
            VALUES ('is_open_override_reason', ${reason}, ${restaurante_id})
            ON CONFLICT (config_key, restaurante_id) DO UPDATE
              SET config_value = EXCLUDED.config_value
          `;
        }
      });
    }

    // MEDIO-1/BAJO-2: read back from DB — the response is always derived from
    // what was actually persisted, not from the request body variables.
    // MEDIO-3: NOW() comes from PostgreSQL so the timestamp matches the write.
    const [persistedRows, restauranteRows, horariosRows] = await Promise.all([
      sql<{ config_key: string; config_value: string }[]>`
        SELECT config_key, config_value
        FROM   restaurante_config
        WHERE  config_key     IN ('is_open_override', 'is_open_override_reason')
          AND  restaurante_id =  ${restaurante_id}
      `,
      sql<{ zona_horaria: string; db_now: string }[]>`
        SELECT zona_horaria, NOW() AS db_now
        FROM   restaurante
        WHERE  id = ${restaurante_id}
        LIMIT  1
      `,
      sql<Horario[]>`
        SELECT
          dia,
          disponible,
          TO_CHAR(apertura_1, 'HH24:MI') AS apertura_1,
          TO_CHAR(cierre_1,   'HH24:MI') AS cierre_1,
          TO_CHAR(apertura_2, 'HH24:MI') AS apertura_2,
          TO_CHAR(cierre_2,   'HH24:MI') AS cierre_2
        FROM horarios
        WHERE restaurante_id = ${restaurante_id}
      `,
    ]);

    const r = restauranteRows[0];
    if (!r) {
      return c.json({ error: 'restaurant_not_found' }, 404);
    }

    const overrideRow = persistedRows.find((row) => row.config_key === 'is_open_override');
    const reasonRow   = persistedRows.find((row) => row.config_key === 'is_open_override_reason');

    const rawOverride = overrideRow?.config_value ?? null;
    const persistedOverride =
      rawOverride === 'true'  ? true  :
      rawOverride === 'false' ? false :
      null;
    const persistedReason = reasonRow?.config_value ?? null;

    const isOpenCalculated = calcIsOpen(horariosRows, r.zona_horaria);
    const isOpenEffective  = persistedOverride !== null ? persistedOverride : isOpenCalculated;

    return c.json({
      restaurante_id,
      is_open_override:  persistedOverride,
      reason:            persistedReason,
      is_open_effective: isOpenEffective,
      updated_at:        r.db_now,
    });

  } catch (err: unknown) {
    // PG 42P10: ON CONFLICT target has no matching unique constraint.
    // Means the composite PK migration (config_key, restaurante_id) is missing.
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === '42P10'
    ) {
      return c.json({
        error:  'migration_required',
        detail: 'restaurante_config requires composite unique constraint on (config_key, restaurante_id)',
      }, 503);
    }

    console.error('[PATCH /dashboard/:slug/restaurant/status] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// GET /dashboard/:slug/settings
//
// Returns the current editable settings for the restaurant.
// Used by the settings page to pre-fill all form fields.
// ----------------------------------------------------------------------------
dashboardRoutes.get('/:slug/settings', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  try {
    const [rows, brandingRows] = await Promise.all([
      sql<RestauranteFullRow[]>`
        SELECT nombre, telefono, direccion, mensaje_bienvenida, mensaje_cerrado,
               datos_bancarios, moneda, payment_methods, brand_color, logo_url
        FROM   restaurante
        WHERE  id = ${restaurante_id}
        LIMIT  1
      `,
      // Branding fields from M-13 + M-14 — tolerant if migrations not applied yet
      sql<{ eslogan: string | null; texto_banner: string | null; redes_sociales: unknown; theme_id: string | null }[]>`
        SELECT eslogan, texto_banner, redes_sociales, theme_id
        FROM   restaurante
        WHERE  id = ${restaurante_id}
        LIMIT  1
      `.catch(() => [] as { eslogan: null; texto_banner: null; redes_sociales: null; theme_id: null }[]),
    ]);

    if (rows.length === 0) {
      return c.json({ error: 'restaurant_not_found' }, 404);
    }

    const r = rows[0];
    const b = brandingRows[0] ?? {};
    return c.json({
      nombre:             r.nombre,
      telefono:           r.telefono           ?? null,
      direccion:          r.direccion           ?? null,
      mensaje_bienvenida: r.mensaje_bienvenida  ?? null,
      mensaje_cerrado:    r.mensaje_cerrado     ?? null,
      datos_bancarios:    r.datos_bancarios     ?? null,
      moneda:             r.moneda              ?? 'CLP',
      payment_methods:    Array.isArray(r.payment_methods) ? r.payment_methods : null,
      brand_color:        (r as unknown as Record<string, unknown>)['brand_color'] ?? null,
      logo_url:           (r as unknown as Record<string, unknown>)['logo_url']    ?? null,
      eslogan:            (b as Record<string, unknown>)['eslogan']        ?? null,
      texto_banner:       (b as Record<string, unknown>)['texto_banner']   ?? null,
      redes_sociales:     (b as Record<string, unknown>)['redes_sociales'] ?? null,
      theme_id:           (b as Record<string, unknown>)['theme_id']       ?? null,
    });

  } catch (err) {
    console.error('[GET /dashboard/:slug/settings] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PATCH /dashboard/:slug/settings
//
// Lets the operator update basic restaurant settings from the dashboard.
//
// Updatable fields (all optional, at least one required):
//   nombre, telefono, direccion, mensaje_bienvenida, mensaje_cerrado,
//   payment_methods  (JSONB string array — migration M-3 required)
//   datos_bancarios  (JSONB object with banco/titular/cuenta/alias, or null to clear)
//
// Non-updatable by this endpoint: slug, zona_horaria, id.
//
// Role guard: only 'owner' or 'manager' may call this endpoint.
// 'viewer' receives 403.
//
// payment_methods note:
//   The column is added by migration M-3 (ADD COLUMN payment_methods JSONB).
//   Until the migration runs, any attempt to set payment_methods will raise
//   PG error 42703 (undefined column), which is caught and surfaced as 400
//   { error: 'migration_required', field: 'payment_methods' } so the caller
//   knows why the field was rejected rather than seeing a 503.
// ----------------------------------------------------------------------------

const UPDATABLE_TEXT_FIELDS = ['nombre', 'telefono', 'direccion', 'mensaje_bienvenida', 'mensaje_cerrado', 'eslogan', 'texto_banner'] as const;

// Max lengths per field — text columns have no DB-level constraint; we enforce
// here to prevent unbounded payloads reaching PostgreSQL.
const TEXT_FIELD_MAX_LENGTH: Record<typeof UPDATABLE_TEXT_FIELDS[number], number> = {
  nombre:             150,
  telefono:           30,
  direccion:          300,
  mensaje_bienvenida: 500,
  mensaje_cerrado:    500,
  eslogan:            200,
  texto_banner:       500,
};

const VALID_PAYMENT_METHODS = ['efectivo', 'transferencia', 'tarjeta', 'bizum', 'online'] as const;

const VALID_REDES = ['instagram','tiktok','facebook','twitter','youtube','whatsapp','telegram','linkedin','pinterest','web'] as const;

const VALID_THEME_IDS = ['indigo','emerald','rose','amber','violet','sky'] as const;

// All keys the endpoint knowingly accepts.
const KNOWN_SETTINGS_KEYS = new Set<string>([
  ...UPDATABLE_TEXT_FIELDS,
  'payment_methods', 'datos_bancarios',
  'brand_color', 'logo_url', 'redes_sociales', 'theme_id',
]);

dashboardRoutes.patch('/:slug/settings', async (c) => {
  // MEDIO-2: validate restaurante_id early — resolveTenant always sets it, but
  // an explicit guard avoids silent WHERE id = NULL if middleware is misconfigured.
  const restaurante_id = c.get('restaurante_id');
  if (!Number.isInteger(restaurante_id) || restaurante_id < 1) {
    return c.json({ error: 'tenant_resolution_failed' }, 500);
  }

  // Role guard.
  // Only 'owner' and 'manager' may mutate settings per the endpoint spec.
  // 'admin' is intentionally excluded here (unlike /restaurant/status which
  // allows admin) — settings changes are scoped to operational roles only.
  // 'viewer' always receives 403.
  const rol = c.get('rol');
  if (rol !== 'owner' && rol !== 'manager') {
    return c.json({ error: 'forbidden', detail: 'role owner or manager required' }, 403);
  }

  // --- Parse body -------------------------------------------------------------
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body', detail: 'body must be a JSON object' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'invalid_body', detail: 'body must be a JSON object' }, 400);
  }

  const raw = body as Record<string, unknown>;

  // --- Detect unrecognised keys (BAJO-1) -------------------------------------
  // Non-updatable fields sent by the caller (slug, id, zona_horaria, etc.) are
  // silently skipped and reported back in ignored_fields — no data is lost, and
  // the caller knows their intent was not fulfilled.
  const ignoredFields = Object.keys(raw).filter((k) => !KNOWN_SETTINGS_KEYS.has(k));

  // --- Validate and collect updatable text fields ----------------------------
  const textClauses: { col: string; val: string }[] = [];

  for (const field of UPDATABLE_TEXT_FIELDS) {
    if (!(field in raw)) continue;
    const v = raw[field];

    // BAJO-2: null is explicitly rejected. Callers that want to clear a field
    // should send an empty string "". Sending null is almost always a client bug.
    if (v === null || v === undefined) {
      return c.json({
        error:  'invalid_field',
        field,
        detail: 'null is not accepted; send an empty string "" to clear a field',
      }, 400);
    }
    if (typeof v !== 'string') {
      return c.json({ error: 'invalid_field', field, detail: 'must be a string' }, 400);
    }
    // BAJO-3: enforce max length before reaching the DB.
    const maxLen = TEXT_FIELD_MAX_LENGTH[field];
    if (v.length > maxLen) {
      return c.json({
        error:     'field_too_long',
        field,
        max_length: maxLen,
        received:  v.length,
      }, 400);
    }
    textClauses.push({ col: field, val: v });
  }

  // --- Validate payment_methods ---------------------------------------------
  let pmVal: string[] | undefined;

  if ('payment_methods' in raw) {
    const pm = raw['payment_methods'];
    if (!Array.isArray(pm) || pm.length === 0) {
      return c.json({
        error:  'invalid_field',
        field:  'payment_methods',
        detail: 'must be a non-empty array',
      }, 400);
    }
    for (const m of pm) {
      if (!(VALID_PAYMENT_METHODS as readonly unknown[]).includes(m)) {
        return c.json({
          error:        'invalid_payment_method',
          value:        m,
          valid_values: VALID_PAYMENT_METHODS,
        }, 400);
      }
    }
    pmVal = pm as string[];
  }

  // --- Validate datos_bancarios ---------------------------------------------
  type DatosBancarios = { banco?: string; titular?: string; cuenta?: string; alias?: string };
  let dbVal: DatosBancarios | null | undefined;

  if ('datos_bancarios' in raw) {
    const db = raw['datos_bancarios'];
    if (db === null) {
      dbVal = null; // explicitly clear the JSONB column
    } else if (typeof db !== 'object' || Array.isArray(db)) {
      return c.json({
        error:  'invalid_field',
        field:  'datos_bancarios',
        detail: 'must be an object or null',
      }, 400);
    } else {
      const dbObj = db as Record<string, unknown>;
      const bankFields = ['banco', 'titular', 'cuenta', 'alias'] as const;
      const validated: DatosBancarios = {};
      for (const f of bankFields) {
        if (f in dbObj) {
          const v = dbObj[f];
          if (typeof v !== 'string') {
            return c.json({ error: 'invalid_field', field: `datos_bancarios.${f}`, detail: 'must be a string' }, 400);
          }
          if (v.length > 200) {
            return c.json({ error: 'field_too_long', field: `datos_bancarios.${f}`, max_length: 200 }, 400);
          }
          validated[f] = v;
        }
      }
      dbVal = validated;
    }
  }

  // --- Validate brand_color -------------------------------------------------
  let brandColorVal: string | undefined;
  if ('brand_color' in raw) {
    const bc = raw['brand_color'];
    if (bc === null || bc === '') {
      brandColorVal = '';  // clear to default
    } else if (typeof bc !== 'string' || !HEX_COLOR_RE.test(bc as string)) {
      return c.json({ error: 'invalid_field', field: 'brand_color', detail: 'must be a hex color #RRGGBB or empty string' }, 400);
    } else {
      brandColorVal = bc as string;
    }
  }

  // --- Validate logo_url ----------------------------------------------------
  let logoUrlVal: string | null | undefined;
  if ('logo_url' in raw) {
    const lu = raw['logo_url'];
    if (lu === null) { logoUrlVal = null; }
    else if (typeof lu !== 'string' || lu.length > 500) {
      return c.json({ error: 'invalid_field', field: 'logo_url', detail: 'must be a string URL or null' }, 400);
    } else { logoUrlVal = lu as string; }
  }

  // --- Validate theme_id ----------------------------------------------------
  let themeIdVal: string | undefined;
  if ('theme_id' in raw) {
    const ti = raw['theme_id'];
    if (!(VALID_THEME_IDS as readonly unknown[]).includes(ti)) {
      return c.json({ error: 'invalid_field', field: 'theme_id', detail: `must be one of: ${VALID_THEME_IDS.join(', ')}` }, 400);
    }
    themeIdVal = ti as string;
  }

  // --- Validate redes_sociales ----------------------------------------------
  type RedSocial = { red: string; url: string };
  let redesVal: RedSocial[] | null | undefined;
  if ('redes_sociales' in raw) {
    const rs = raw['redes_sociales'];
    if (rs === null) {
      redesVal = null;
    } else if (!Array.isArray(rs)) {
      return c.json({ error: 'invalid_field', field: 'redes_sociales', detail: 'must be an array or null' }, 400);
    } else {
      const validated: RedSocial[] = [];
      for (const item of rs) {
        if (typeof item !== 'object' || !item || typeof (item as Record<string,unknown>)['red'] !== 'string' || typeof (item as Record<string,unknown>)['url'] !== 'string') {
          return c.json({ error: 'invalid_field', field: 'redes_sociales', detail: 'each item must have { red: string, url: string }' }, 400);
        }
        const red = (item as Record<string,unknown>)['red'] as string;
        if (!(VALID_REDES as readonly unknown[]).includes(red)) {
          return c.json({ error: 'invalid_field', field: 'redes_sociales', detail: `red "${red}" not valid. Valid: ${VALID_REDES.join(', ')}` }, 400);
        }
        validated.push({ red, url: (item as Record<string,unknown>)['url'] as string });
      }
      redesVal = validated;
    }
  }

  if (textClauses.length === 0 && pmVal === undefined && dbVal === undefined
      && brandColorVal === undefined && logoUrlVal === undefined
      && themeIdVal === undefined && redesVal === undefined) {
    return c.json({
      error:  'no_valid_fields',
      detail: 'body must include at least one updatable field',
      ...(ignoredFields.length > 0 && { ignored_fields: ignoredFields }),
    }, 400);
  }

  try {
    // Use a transaction: apply each category of change independently so
    // the query shape is always unambiguous for the postgres driver.
    // A final SELECT inside the same transaction reads back the persisted
    // state — no separate round trip, no race window.
    type UpdateRow = RestauranteFullRow;
    const textObj = Object.fromEntries(textClauses.map(({ col, val }) => [col, val]));

    const rows = await sql.begin(async (tx) => {
      if (textClauses.length > 0) {
        await tx`UPDATE restaurante SET ${tx(textObj)} WHERE id = ${restaurante_id}`;
      }
      if (pmVal !== undefined) {
        await tx`UPDATE restaurante SET payment_methods = ${tx.json(pmVal)} WHERE id = ${restaurante_id}`;
      }
      if (dbVal !== undefined) {
        if (dbVal === null) {
          await tx`UPDATE restaurante SET datos_bancarios = NULL WHERE id = ${restaurante_id}`;
        } else {
          await tx`UPDATE restaurante SET datos_bancarios = ${tx.json(dbVal)} WHERE id = ${restaurante_id}`;
        }
      }
      if (brandColorVal !== undefined) {
        if (brandColorVal === '') {
          await tx`UPDATE restaurante SET brand_color = NULL WHERE id = ${restaurante_id}`;
        } else {
          await tx`UPDATE restaurante SET brand_color = ${brandColorVal} WHERE id = ${restaurante_id}`;
        }
      }
      if (logoUrlVal !== undefined) {
        if (logoUrlVal === null) {
          await tx`UPDATE restaurante SET logo_url = NULL WHERE id = ${restaurante_id}`;
        } else {
          await tx`UPDATE restaurante SET logo_url = ${logoUrlVal} WHERE id = ${restaurante_id}`;
        }
      }
      if (themeIdVal !== undefined) {
        await tx`UPDATE restaurante SET theme_id = ${themeIdVal}::public.theme_id_enum WHERE id = ${restaurante_id}`;
      }
      if (redesVal !== undefined) {
        if (redesVal === null) {
          await tx`UPDATE restaurante SET redes_sociales = NULL WHERE id = ${restaurante_id}`;
        } else {
          await tx`UPDATE restaurante SET redes_sociales = ${tx.json(redesVal)} WHERE id = ${restaurante_id}`;
        }
      }
      return tx<UpdateRow[]>`
        SELECT nombre, telefono, direccion, mensaje_bienvenida, mensaje_cerrado,
               payment_methods, datos_bancarios,
               brand_color, logo_url, eslogan, texto_banner, redes_sociales, theme_id
        FROM   restaurante
        WHERE  id = ${restaurante_id}
        LIMIT  1
      `;
    });

    if (rows.length === 0) {
      return c.json({ error: 'restaurant_not_found' }, 404);
    }

    const persisted = rows[0] as unknown as Record<string, unknown>;

    // Return only the fields that were in the request so the caller gets a
    // clean diff. Unknown fields that were silently ignored are surfaced in
    // ignored_fields to help the caller debug intent vs. outcome.
    const responseFields: Record<string, unknown> = {};
    for (const { col } of textClauses) {
      responseFields[col] = persisted[col];
    }
    if (pmVal !== undefined) {
      responseFields['payment_methods'] = persisted['payment_methods'];
    }
    if (dbVal !== undefined) {
      responseFields['datos_bancarios'] = persisted['datos_bancarios'];
    }
    if (brandColorVal !== undefined) {
      responseFields['brand_color'] = persisted['brand_color'];
    }
    if (logoUrlVal !== undefined) {
      responseFields['logo_url'] = persisted['logo_url'];
    }
    if (themeIdVal !== undefined) {
      responseFields['theme_id'] = persisted['theme_id'];
    }
    if (redesVal !== undefined) {
      responseFields['redes_sociales'] = persisted['redes_sociales'];
    }
    if (ignoredFields.length > 0) {
      responseFields['ignored_fields'] = ignoredFields;
    }

    return c.json(responseFields, 200);

  } catch (err: unknown) {
    // PG 42703: undefined_column — payment_methods migration M-3 not applied.
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === '42703'
    ) {
      return c.json({
        error:  'migration_required',
        field:  'payment_methods',
        detail: 'column payment_methods does not exist yet — apply migration M-3 first',
      }, 400);
    }

    console.error('[PATCH /dashboard/:slug/settings] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PATCH /dashboard/:slug/horarios
//
// Updates the weekly schedule for a restaurant. Accepts an array of up to 7
// horario objects (one per day). Each object must include the row `id` so the
// UPDATE is unambiguous and tenant-safe (WHERE id = $id AND restaurante_id = $tenant).
//
// All 7 updates run inside a single transaction — either all succeed or all roll back.
// The response always returns the full refreshed schedule from the DB.
//
// Validation rules:
//   - disponible=true  requires apertura_1 + cierre_1
//   - apertura_2/cierre_2 must both be set or both be null (no half-shift)
//   - Time values must match HH:MM; empty string or null/undefined clears the field
//
// Role guard: owner or manager only.
// ----------------------------------------------------------------------------
dashboardRoutes.patch('/:slug/horarios', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const rol = c.get('rol');
  if (rol !== 'owner' && rol !== 'manager') {
    return c.json({ error: 'forbidden', detail: 'role owner or manager required' }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  if (!body || typeof body !== 'object' || !('horarios' in body)) {
    return c.json({ error: 'horarios_required' }, 400);
  }

  const horariosRaw = (body as Record<string, unknown>)['horarios'];
  if (!Array.isArray(horariosRaw) || horariosRaw.length === 0 || horariosRaw.length > 7) {
    return c.json({ error: 'invalid_horarios', detail: 'must be an array of 1–7 items' }, 400);
  }

  const TIME_RE = /^\d{2}:\d{2}$/;

  interface HorarioInput {
    id: number;
    disponible: boolean;
    apertura_1: string | null;
    cierre_1:   string | null;
    apertura_2: string | null;
    cierre_2:   string | null;
  }

  const validated: HorarioInput[] = [];

  for (let i = 0; i < horariosRaw.length; i++) {
    const h = horariosRaw[i];
    if (!h || typeof h !== 'object' || Array.isArray(h)) {
      return c.json({ error: 'invalid_horario', index: i, detail: 'must be an object' }, 400);
    }
    const ho = h as Record<string, unknown>;

    // id — must be a positive integer
    const rawId = Number(ho['id']);
    if (!Number.isInteger(rawId) || rawId < 1) {
      return c.json({ error: 'invalid_horario', index: i, field: 'id', detail: 'must be a positive integer' }, 400);
    }

    // disponible — must be boolean
    if (typeof ho['disponible'] !== 'boolean') {
      return c.json({ error: 'invalid_horario', index: i, field: 'disponible', detail: 'must be a boolean' }, 400);
    }

    // time fields — HH:MM, empty string, null or undefined all accepted
    const parseTime = (v: unknown, field: string): string | null | { err: object } => {
      if (v === null || v === undefined || v === '') return null;
      if (typeof v !== 'string' || !TIME_RE.test(v)) {
        return { err: { error: 'invalid_horario', index: i, field, detail: 'must be HH:MM or null' } };
      }
      return v;
    };

    const ap1 = parseTime(ho['apertura_1'], 'apertura_1');
    const ci1 = parseTime(ho['cierre_1'],   'cierre_1');
    const ap2 = parseTime(ho['apertura_2'], 'apertura_2');
    const ci2 = parseTime(ho['cierre_2'],   'cierre_2');

    for (const t of [ap1, ci1, ap2, ci2]) {
      if (t && typeof t === 'object' && 'err' in t) return c.json((t as { err: object }).err, 400);
    }

    const a1 = ap1 as string | null;
    const c1 = ci1 as string | null;
    const a2 = ap2 as string | null;
    const c2 = ci2 as string | null;

    // if disponible, apertura_1 + cierre_1 are required
    if (ho['disponible'] === true && (!a1 || !c1)) {
      return c.json({
        error: 'invalid_horario', index: i,
        detail: 'apertura_1 and cierre_1 are required when disponible is true',
      }, 400);
    }

    // 2nd shift: both present or both null
    if ((a2 && !c2) || (!a2 && c2)) {
      return c.json({
        error: 'invalid_horario', index: i,
        detail: 'apertura_2 and cierre_2 must both be set or both null',
      }, 400);
    }

    validated.push({ id: rawId, disponible: ho['disponible'] as boolean, apertura_1: a1, cierre_1: c1, apertura_2: a2, cierre_2: c2 });
  }

  try {
    const updatedRows = await sql.begin(async (tx) => {
      for (const h of validated) {
        await tx`
          UPDATE horarios
          SET    disponible = ${h.disponible},
                 apertura_1 = ${h.apertura_1},
                 cierre_1   = ${h.cierre_1},
                 apertura_2 = ${h.apertura_2},
                 cierre_2   = ${h.cierre_2}
          WHERE  id             = ${h.id}
            AND  restaurante_id = ${restaurante_id}
        `;
      }
      return tx<HorarioWithId[]>`
        SELECT id, dia, disponible,
               TO_CHAR(apertura_1, 'HH24:MI') AS apertura_1,
               TO_CHAR(cierre_1,   'HH24:MI') AS cierre_1,
               TO_CHAR(apertura_2, 'HH24:MI') AS apertura_2,
               TO_CHAR(cierre_2,   'HH24:MI') AS cierre_2
        FROM   horarios
        WHERE  restaurante_id = ${restaurante_id}
        ORDER BY
          CASE dia
            WHEN 'Lunes'     THEN 1
            WHEN 'Martes'    THEN 2
            WHEN 'Miércoles' THEN 3
            WHEN 'Jueves'    THEN 4
            WHEN 'Viernes'   THEN 5
            WHEN 'Sábado'    THEN 6
            WHEN 'Domingo'   THEN 7
            ELSE 8
          END
      `;
    });

    return c.json({ horarios: updatedRows });

  } catch (err) {
    console.error('[PATCH /dashboard/:slug/horarios] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// GET /dashboard/:slug/delivery-zones
//
// Returns ALL delivery zones for the restaurant (active and inactive) so the
// operator can manage them from the settings page.
// ----------------------------------------------------------------------------
dashboardRoutes.get('/:slug/delivery-zones', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  try {
    const zones = await sql<DeliveryZoneRow[]>`
      SELECT
        delivery_zone_id,
        zone_name,
        postal_code,
        fee,
        is_active,
        description,
        min_order_amount,
        estimated_minutes_min,
        estimated_minutes_max
      FROM delivery_zone
      WHERE restaurante_id = ${restaurante_id}
      ORDER BY zone_name ASC
    `;

    return c.json({
      zones: zones.map((z) => ({
        delivery_zone_id:      Number(z.delivery_zone_id),
        zone_name:             z.zone_name,
        postal_code:           z.postal_code,
        fee:                   Number(z.fee),
        is_active:             z.is_active,
        description:           z.description ?? null,
        min_order_amount:      z.min_order_amount !== null ? Number(z.min_order_amount) : null,
        estimated_minutes_min: z.estimated_minutes_min ?? null,
        estimated_minutes_max: z.estimated_minutes_max ?? null,
      })),
    });

  } catch (err) {
    console.error('[GET /dashboard/:slug/delivery-zones] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PATCH /dashboard/:slug/delivery-zones/:id
//
// Updates a single delivery zone. All fields optional; at least one required.
// Updatable: zone_name, postal_code, fee, min_order_amount,
//            estimated_minutes_min, estimated_minutes_max, is_active
//
// Multi-tenant: WHERE includes restaurante_id so tenant A cannot mutate
// a zone belonging to tenant B.
// Role guard: owner or manager only.
// ----------------------------------------------------------------------------
dashboardRoutes.patch('/:slug/delivery-zones/:id', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const rol = c.get('rol');
  if (rol !== 'owner' && rol !== 'manager') {
    return c.json({ error: 'forbidden', detail: 'role owner or manager required' }, 403);
  }

  const idParam = c.req.param('id');
  const zoneId = parseInt(idParam, 10);
  if (!Number.isInteger(zoneId) || zoneId < 1) {
    return c.json({ error: 'invalid_id' }, 400);
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

  // Validate and collect update fields
  const updates: Record<string, unknown> = {};

  if ('zone_name' in raw) {
    if (typeof raw['zone_name'] !== 'string' || raw['zone_name'].trim().length === 0) {
      return c.json({ error: 'invalid_field', field: 'zone_name', detail: 'must be a non-empty string' }, 400);
    }
    updates['zone_name'] = raw['zone_name'].trim();
  }

  if ('postal_code' in raw) {
    if (typeof raw['postal_code'] !== 'string' || raw['postal_code'].trim().length === 0) {
      return c.json({ error: 'invalid_field', field: 'postal_code', detail: 'must be a non-empty string' }, 400);
    }
    updates['postal_code'] = raw['postal_code'].trim();
  }

  if ('fee' in raw) {
    const fee = Number(raw['fee']);
    if (isNaN(fee) || fee < 0) {
      return c.json({ error: 'invalid_field', field: 'fee', detail: 'must be a non-negative number' }, 400);
    }
    updates['fee'] = fee;
  }

  if ('min_order_amount' in raw) {
    const v = raw['min_order_amount'];
    if (v === null) {
      updates['min_order_amount'] = null;
    } else {
      const n = Number(v);
      if (isNaN(n) || n < 0) {
        return c.json({ error: 'invalid_field', field: 'min_order_amount', detail: 'must be a non-negative number or null' }, 400);
      }
      updates['min_order_amount'] = n;
    }
  }

  if ('estimated_minutes_min' in raw) {
    const v = raw['estimated_minutes_min'];
    if (v === null) {
      updates['estimated_minutes_min'] = null;
    } else {
      const n = parseInt(String(v), 10);
      if (!Number.isInteger(n) || n < 0) {
        return c.json({ error: 'invalid_field', field: 'estimated_minutes_min', detail: 'must be a non-negative integer or null' }, 400);
      }
      updates['estimated_minutes_min'] = n;
    }
  }

  if ('estimated_minutes_max' in raw) {
    const v = raw['estimated_minutes_max'];
    if (v === null) {
      updates['estimated_minutes_max'] = null;
    } else {
      const n = parseInt(String(v), 10);
      if (!Number.isInteger(n) || n < 0) {
        return c.json({ error: 'invalid_field', field: 'estimated_minutes_max', detail: 'must be a non-negative integer or null' }, 400);
      }
      updates['estimated_minutes_max'] = n;
    }
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'no_valid_fields', detail: 'body must include at least one updatable field' }, 400);
  }

  try {
    const rows = await sql<DeliveryZoneRow[]>`
      UPDATE delivery_zone
      SET    ${sql(updates)}
      WHERE  delivery_zone_id = ${zoneId}
        AND  restaurante_id   = ${restaurante_id}
      RETURNING
        delivery_zone_id,
        zone_name,
        postal_code,
        fee,
        is_active,
        description,
        min_order_amount,
        estimated_minutes_min,
        estimated_minutes_max
    `;

    if (rows.length === 0) {
      return c.json({ error: 'zone_not_found' }, 404);
    }

    const z = rows[0];
    return c.json({
      delivery_zone_id:      Number(z.delivery_zone_id),
      zone_name:             z.zone_name,
      postal_code:           z.postal_code,
      fee:                   Number(z.fee),
      is_active:             z.is_active,
      description:           z.description ?? null,
      min_order_amount:      z.min_order_amount !== null ? Number(z.min_order_amount) : null,
      estimated_minutes_min: z.estimated_minutes_min ?? null,
      estimated_minutes_max: z.estimated_minutes_max ?? null,
    });

  } catch (err) {
    console.error('[PATCH /dashboard/:slug/delivery-zones/:id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// POST /dashboard/:slug/delivery-zones
// Creates a new delivery zone for the restaurant.
// ----------------------------------------------------------------------------
dashboardRoutes.post('/:slug/delivery-zones', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const rol = c.get('rol');
  if (rol !== 'owner' && rol !== 'manager') return c.json({ error: 'forbidden' }, 403);

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }
  const b = body as Record<string, unknown>;

  const name                  = typeof b['name']                  === 'string' ? b['name'].trim()       : 'Nueva zona';
  const postal_code           = typeof b['postal_code']           === 'string' ? b['postal_code'].trim() : null;
  const delivery_fee          = Number(b['delivery_fee']          ?? 0);
  const min_order_amount      = b['min_order_amount']      != null ? Number(b['min_order_amount'])      : null;
  const estimated_minutes_min = b['estimated_minutes_min'] != null ? Number(b['estimated_minutes_min']) : null;
  const estimated_minutes_max = b['estimated_minutes_max'] != null ? Number(b['estimated_minutes_max']) : null;
  const is_active             = b['is_active'] === true || b['is_active'] === 'true' ? true : false;

  try {
    const [row] = await sql<Record<string,unknown>[]>`
      INSERT INTO delivery_zone (restaurante_id, zone_name, postal_code, delivery_fee, min_order_amount,
        estimated_minutes_min, estimated_minutes_max, is_active)
      VALUES (${restaurante_id}, ${name}, ${postal_code}, ${delivery_fee}, ${min_order_amount},
        ${estimated_minutes_min}, ${estimated_minutes_max}, ${is_active})
      RETURNING delivery_zone_id, zone_name, postal_code, delivery_fee, min_order_amount,
        estimated_minutes_min, estimated_minutes_max, is_active
    `;
    return c.json({
      delivery_zone_id:      Number(row['delivery_zone_id']),
      zone_name:             row['zone_name'],
      postal_code:           row['postal_code'],
      fee:                   Number(row['delivery_fee']),
      min_order_amount:      row['min_order_amount'] != null ? Number(row['min_order_amount']) : null,
      estimated_minutes_min: row['estimated_minutes_min'] != null ? Number(row['estimated_minutes_min']) : null,
      estimated_minutes_max: row['estimated_minutes_max'] != null ? Number(row['estimated_minutes_max']) : null,
      is_active:             Boolean(row['is_active']),
    }, 201);
  } catch (err) {
    console.error('[POST /dashboard/:slug/delivery-zones] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// DELETE /dashboard/:slug/delivery-zones/:id
// ----------------------------------------------------------------------------
dashboardRoutes.delete('/:slug/delivery-zones/:id', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const rol = c.get('rol');
  if (rol !== 'owner' && rol !== 'manager') return c.json({ error: 'forbidden' }, 403);

  const zoneId = Number(c.req.param('id'));
  if (!Number.isInteger(zoneId) || zoneId <= 0) return c.json({ error: 'invalid_id' }, 400);

  try {
    const result = await sql`
      DELETE FROM delivery_zone
      WHERE delivery_zone_id = ${zoneId} AND restaurante_id = ${restaurante_id}
    `;
    if ((result as unknown as { count: number }).count === 0) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /dashboard/:slug/delivery-zones/:id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// Returns the local calendar date (YYYY-MM-DD) for a given IANA timezone.
// Uses en-CA locale because it formats as YYYY-MM-DD without extra logic.
function getLocalIsoDate(zona_horaria: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona_horaria,
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  }).format(new Date());
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface OrderListRow {
  id:              number;
  pedido_codigo:   string | null;
  estado:          string;
  estado_pago:     string | null;
  tipo_despacho:   string;
  total:           number;
  subtotal:        number;
  costo_envio:     number;
  metodo_pago:     string | null;
  notas:           string | null;
  telefono:        string;
  nombre_cliente:  string | null;
  direccion:       string | null;
  postal_code:     string | null;
  zone_name:       string | null;
  tiempo_estimado: string | null;
  items_count:     number | null;
  items:           unknown[] | null;
  created_at:      string;
  updated_at:      string | null;
}

interface TodayMetricsRow {
  pedidos_total:          number;
  pedidos_recibidos:      number;
  pedidos_confirmados:    number;
  pedidos_en_preparacion: number;
  pedidos_en_camino:      number;
  pedidos_entregados:     number;
  pedidos_cancelados:     number;
  pedidos_pendiente_pago: number;
  revenue_total:          number;
  revenue_delivery:       number;
  revenue_retiro:         number;
  costo_envio_total:      number;
}

interface ActiveOrdersRow {
  count:             number;
  oldest_created_at: string | null;
}

interface Last7DaysRow {
  pedidos_total: number;
  revenue_total: number;
}

interface RestauranteStatusRow {
  id: number;
  nombre: string;
  zona_horaria: string;
}

interface PedidoStatusRow {
  id:              number;
  pedido_codigo:   string | null;
  estado:          string;
  estado_pago:     string | null;
  tipo_despacho:   string;
  telefono:        string;
  tiempo_estimado: string | null;
  metodo_pago:     string | null;
}

interface RestauranteSettingsRow {
  nombre:             string;
  telefono:           string | null;
  direccion:          string | null;
  mensaje_bienvenida: string | null;
  mensaje_cerrado:    string | null;
}

interface RestauranteFullRow extends RestauranteSettingsRow {
  datos_bancarios: { banco?: string; titular?: string; cuenta?: string; alias?: string } | null;
  moneda:          string | null;
  payment_methods: string[] | null;
}

interface DeliveryZoneRow {
  delivery_zone_id:      number | string;
  zone_name:             string;
  postal_code:           string;
  fee:                   number | string;
  is_active:             boolean;
  description:           string | null;
  min_order_amount:      number | string | null;
  estimated_minutes_min: number | null;
  estimated_minutes_max: number | null;
}

interface HorarioWithId {
  id: number;
  dia: string;
  disponible: boolean;
  apertura_1: string | null;
  cierre_1:   string | null;
  apertura_2: string | null;
  cierre_2:   string | null;
}


// ----------------------------------------------------------------------------
// GET /dashboard/:slug/notifications
//
// Endpoint de polling para notificaciones del dashboard (MVP).
// Devuelve escalaciones pendientes (derivaciones a humano sin resolver).
//
// El frontend llama este endpoint cada `dashboard_polling_seconds` segundos
// (configurable en restaurante_config). La respuesta sirve para:
//   - mostrar badge con número de notificaciones no atendidas
//   - listar las derivaciones pendientes en el panel de notificaciones
//
// Parámetros: ninguno (el filtro es siempre estado='pendiente')
//
// Post-MVP: migrar a SSE + tabla notificaciones persistentes.
// ----------------------------------------------------------------------------
dashboardRoutes.get('/:slug/notifications', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  try {
    // Escalaciones pendientes (derivaciones a humano no resueltas)
    const rows = await sql<{
      id: number;
      telefono: string;
      problema: string | null;
      account_id: string | null;
      contact_id: string | null;
      conversation_id: string | null;
      created_at: string;
    }[]>`
      SELECT id, telefono, problema, account_id, contact_id, conversation_id, created_at
      FROM   escalaciones
      WHERE  restaurante_id = ${restaurante_id}
        AND  estado = 'pendiente'
      ORDER BY created_at DESC
      LIMIT 50
    `;

    // Pedidos expirados en las últimas 24h (informativos — solo conteo)
    const [expiredCount] = await sql<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM   pedidos
      WHERE  restaurante_id = ${restaurante_id}
        AND  estado = 'expirado'
        AND  updated_at > NOW() - INTERVAL '24 hours'
    `;

    return c.json({
      badge:       rows.length,                        // total de derivaciones pendientes
      escalaciones: rows.map((e) => ({
        id:              Number(e.id),
        tipo:            'derivacion_humano' as const,
        telefono:        e.telefono,
        problema:        e.problema ?? null,
        account_id:      e.account_id ?? null,
        contact_id:      e.contact_id ?? null,
        conversation_id: e.conversation_id ?? null,
        created_at:      e.created_at,
      })),
      pedidos_expirados_24h: Number(expiredCount?.total ?? 0),
    });
  } catch (err) {
    console.error('[GET /dashboard/:slug/notifications] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});
// ----------------------------------------------------------------------------
// GET /dashboard/:slug/escalaciones
//
// Retorna las conversaciones derivadas a humano por el agente n8n.
// Parámetros opcionales:
//   estado  — 'pendiente' | 'resuelto' | (omitir = todos)
//   limit   — máx 100, default 50
//   page    — default 1
// ----------------------------------------------------------------------------
dashboardRoutes.get('/:slug/escalaciones', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const estadoParam    = c.req.query('estado');
  const page           = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit          = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)));
  const offset         = (page - 1) * limit;

  const VALID = ['pendiente', 'resuelto'];
  if (estadoParam && !VALID.includes(estadoParam)) {
    return c.json({ error: 'invalid_estado', valid_values: VALID }, 400);
  }

  try {
    const estadoFilter = estadoParam
      ? sql`AND e.estado = ${estadoParam}`
      : sql``;

    const [countRows, rows] = await Promise.all([
      sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total
        FROM   escalaciones e
        WHERE  e.restaurante_id = ${restaurante_id}
          ${estadoFilter}
      `,
      sql<EscalacionRow[]>`
        SELECT
          e.id, e.telefono, e.problema, e.contexto,
          e.conversation_id, e.account_id, e.contact_id,
          e.estado, e.created_at, e.resolved_at, e.resolved_by
        FROM   escalaciones e
        WHERE  e.restaurante_id = ${restaurante_id}
          ${estadoFilter}
        ORDER BY e.created_at DESC
        LIMIT  ${limit}
        OFFSET ${offset}
      `,
    ]);

    return c.json({
      total:       Number(countRows[0]?.total ?? 0),
      page,
      limit,
      escalaciones: rows.map((e) => ({
        id:              Number(e.id),
        telefono:        e.telefono,
        problema:        e.problema ?? null,
        contexto:        e.contexto ?? null,
        conversation_id: e.conversation_id ?? null,
        account_id:      e.account_id ?? null,
        contact_id:      e.contact_id ?? null,
        estado:          e.estado,
        created_at:      e.created_at,
        resolved_at:     e.resolved_at ?? null,
        resolved_by:     e.resolved_by ?? null,
      })),
    });
  } catch (err) {
    console.error('[GET /dashboard/:slug/escalaciones] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// PATCH /dashboard/:slug/escalaciones/:id
//
// Marca una escalación como resuelta. Solo owner / admin / manager.
// ----------------------------------------------------------------------------
dashboardRoutes.patch('/:slug/escalaciones/:id', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const idParam        = c.req.param('id');
  const id             = parseInt(idParam, 10);

  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: 'invalid_id' }, 400);
  }

  try {
    const user = await validateBearerToken(c.req.header('Authorization'));
    const resolvedBy = user?.email ?? 'unknown';

    // Leer account_id y contact_id ANTES del UPDATE para poder reactivar el bot
    const escRows = await sql<{ account_id: string | null; contact_id: string | null }[]>`
      SELECT account_id, contact_id
      FROM   escalaciones
      WHERE  id = ${id} AND restaurante_id = ${restaurante_id} AND estado = 'pendiente'
      LIMIT  1
    `;

    if (escRows.length === 0) {
      return c.json({ error: 'not_found_or_already_resolved' }, 404);
    }

    const updated = await sql<{ id: number; estado: string; resolved_at: string }[]>`
      UPDATE escalaciones
      SET
        estado      = 'resuelto',
        resolved_at = NOW(),
        resolved_by = ${resolvedBy}
      WHERE id             = ${id}
        AND restaurante_id = ${restaurante_id}
        AND estado         = 'pendiente'
      RETURNING id, estado, resolved_at
    `;

    if (updated.length === 0) {
      return c.json({ error: 'not_found_or_already_resolved' }, 404);
    }

    // Reactivar bot en Chatwoot — fire-and-forget, nunca bloquea la respuesta
    const { account_id, contact_id } = escRows[0];
    if (account_id && contact_id) {
      resumeBot(account_id, contact_id);
    }

    return c.json({
      id:          Number(updated[0].id),
      estado:      updated[0].estado,
      resolved_at: updated[0].resolved_at,
    });
  } catch (err) {
    console.error('[PATCH /dashboard/:slug/escalaciones/:id] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// Row type — escalaciones
// ---------------------------------------------------------------------------
interface EscalacionRow {
  id:              number | string;
  telefono:        string;
  problema:        string | null;
  contexto:        Record<string, unknown> | null;
  conversation_id: string | null;
  account_id:      string | null;
  contact_id:      string | null;
  estado:          string;
  created_at:      string;
  resolved_at:     string | null;
  resolved_by:     string | null;
}

// ----------------------------------------------------------------------------
// GET /dashboard/:slug/analytics
// ----------------------------------------------------------------------------
dashboardRoutes.get('/:slug/analytics', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const diasParam      = c.req.query('dias');
  const dias           = [7, 30, 90].includes(Number(diasParam)) ? Number(diasParam) : 30;
  const zonaHoraria    = 'Atlantic/Canary';

  try {
    const [resumen] = await sql<{
      total_pedidos:    number;
      total_ventas:     number;
      ticket_promedio:  number;
      pedidos_delivery: number;
      pedidos_retiro:   number;
    }[]>`
      SELECT
        COUNT(*)::int                                            AS total_pedidos,
        COALESCE(SUM(total), 0)::numeric                        AS total_ventas,
        COALESCE(AVG(total), 0)::numeric                        AS ticket_promedio,
        COUNT(*) FILTER (WHERE tipo_despacho = 'delivery')::int AS pedidos_delivery,
        COUNT(*) FILTER (WHERE tipo_despacho = 'retiro')::int   AS pedidos_retiro
      FROM  pedidos
      WHERE restaurante_id = ${restaurante_id}
        AND estado NOT IN ('expirado', 'cancelado')
        AND DATE(created_at AT TIME ZONE ${zonaHoraria}) >= CURRENT_DATE - (${dias} - 1) * INTERVAL '1 day'
    `;

    const porDia = await sql<{ fecha: string; pedidos: number; ventas: number }[]>`
      SELECT
        DATE(created_at AT TIME ZONE ${zonaHoraria})::text AS fecha,
        COUNT(*)::int                                       AS pedidos,
        COALESCE(SUM(total), 0)::numeric                   AS ventas
      FROM  pedidos
      WHERE restaurante_id = ${restaurante_id}
        AND estado NOT IN ('expirado', 'cancelado')
        AND DATE(created_at AT TIME ZONE ${zonaHoraria}) >= CURRENT_DATE - (${dias} - 1) * INTERVAL '1 day'
      GROUP BY 1 ORDER BY 1
    `;

    const topItems = await sql<{ nombre: string; cantidad: number; ventas: number }[]>`
      SELECT
        COALESCE(elem->>'item_name', elem->>'nombre', 'Producto') AS nombre,
        SUM(COALESCE((elem->>'quantity')::int, (elem->>'cantidad')::int, 1))::int AS cantidad,
        SUM(
          COALESCE((elem->>'quantity')::int, (elem->>'cantidad')::int, 1)
          * COALESCE((elem->>'unit_price')::numeric, (elem->>'precio_unitario')::numeric, 0)
        )::numeric AS ventas
      FROM  pedidos,
            jsonb_array_elements(
              CASE jsonb_typeof(items) WHEN 'array' THEN items ELSE '[]'::jsonb END
            ) AS elem
      WHERE restaurante_id = ${restaurante_id}
        AND estado NOT IN ('expirado', 'cancelado')
        AND DATE(created_at AT TIME ZONE ${zonaHoraria}) >= CURRENT_DATE - (${dias} - 1) * INTERVAL '1 day'
      GROUP BY 1 ORDER BY cantidad DESC LIMIT 10
    `;

    const porCanal = await sql<{ canal: string; pedidos: number; ventas: number }[]>`
      SELECT COALESCE(canal, 'web') AS canal,
        COUNT(*)::int AS pedidos,
        COALESCE(SUM(total), 0)::numeric AS ventas
      FROM  pedidos
      WHERE restaurante_id = ${restaurante_id}
        AND estado NOT IN ('expirado', 'cancelado')
        AND DATE(created_at AT TIME ZONE ${zonaHoraria}) >= CURRENT_DATE - (${dias} - 1) * INTERVAL '1 day'
      GROUP BY 1 ORDER BY pedidos DESC
    `;

    const porPago = await sql<{ metodo: string; pedidos: number; ventas: number }[]>`
      SELECT COALESCE(metodo_pago, 'no_especificado') AS metodo,
        COUNT(*)::int AS pedidos,
        COALESCE(SUM(total), 0)::numeric AS ventas
      FROM  pedidos
      WHERE restaurante_id = ${restaurante_id}
        AND estado NOT IN ('expirado', 'cancelado')
        AND DATE(created_at AT TIME ZONE ${zonaHoraria}) >= CURRENT_DATE - (${dias} - 1) * INTERVAL '1 day'
      GROUP BY 1 ORDER BY pedidos DESC
    `;

    const porEstado = await sql<{ estado: string; pedidos: number; ventas: number }[]>`
      SELECT estado,
        COUNT(*)::int AS pedidos,
        COALESCE(SUM(total), 0)::numeric AS ventas
      FROM  pedidos
      WHERE restaurante_id = ${restaurante_id}
        AND DATE(created_at AT TIME ZONE ${zonaHoraria}) >= CURRENT_DATE - (${dias} - 1) * INTERVAL '1 day'
      GROUP BY 1 ORDER BY pedidos DESC
    `;

    const porZona = await sql<{ zona: string; pedidos: number; ventas: number }[]>`
      SELECT COALESCE(dz.zone_name, 'Retiro / Sin zona') AS zona,
        COUNT(*)::int AS pedidos,
        COALESCE(SUM(p.total), 0)::numeric AS ventas
      FROM  pedidos p
      LEFT JOIN delivery_zone dz ON dz.postal_code = p.postal_code
      WHERE p.restaurante_id = ${restaurante_id}
        AND p.estado NOT IN ('expirado', 'cancelado')
        AND DATE(p.created_at AT TIME ZONE ${zonaHoraria}) >= CURRENT_DATE - (${dias} - 1) * INTERVAL '1 day'
      GROUP BY 1 ORDER BY pedidos DESC LIMIT 10
    `;

    const clientesTop = await sql<{ nombre: string; telefono: string; pedidos: number; ventas: number }[]>`
      SELECT
        COALESCE(u.nombre, p.telefono) AS nombre,
        p.telefono,
        COUNT(*)::int AS pedidos,
        COALESCE(SUM(p.total), 0)::numeric AS ventas
      FROM  pedidos p
      LEFT JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.restaurante_id = ${restaurante_id}
        AND p.estado NOT IN ('expirado', 'cancelado')
        AND DATE(p.created_at AT TIME ZONE ${zonaHoraria}) >= CURRENT_DATE - (${dias} - 1) * INTERVAL '1 day'
      GROUP BY u.nombre, p.telefono
      ORDER BY pedidos DESC LIMIT 10
    `;

    const porDespacho = await sql<{ tipo: string; pedidos: number; ventas: number }[]>`
      SELECT tipo_despacho AS tipo,
        COUNT(*)::int AS pedidos,
        COALESCE(SUM(total), 0)::numeric AS ventas
      FROM  pedidos
      WHERE restaurante_id = ${restaurante_id}
        AND estado NOT IN ('expirado', 'cancelado')
        AND DATE(created_at AT TIME ZONE ${zonaHoraria}) >= CURRENT_DATE - (${dias} - 1) * INTERVAL '1 day'
      GROUP BY 1 ORDER BY pedidos DESC
    `;

    return c.json({
      dias,
      resumen: {
        total_pedidos:    Number(resumen?.total_pedidos    ?? 0),
        total_ventas:     Number(resumen?.total_ventas     ?? 0),
        ticket_promedio:  Number(resumen?.ticket_promedio  ?? 0),
        pedidos_delivery: Number(resumen?.pedidos_delivery ?? 0),
        pedidos_retiro:   Number(resumen?.pedidos_retiro   ?? 0),
      },
      por_dia:       porDia.map((r)       => ({ fecha: r.fecha, pedidos: Number(r.pedidos), ventas: Number(r.ventas) })),
      top_items:     topItems.map((r)     => ({ nombre: r.nombre, cantidad: Number(r.cantidad), ventas: Number(r.ventas) })),
      por_canal:     porCanal.map((r)     => ({ canal: r.canal, pedidos: Number(r.pedidos), ventas: Number(r.ventas) })),
      por_pago:      porPago.map((r)      => ({ metodo: r.metodo, pedidos: Number(r.pedidos), ventas: Number(r.ventas) })),
      por_estado:    porEstado.map((r)    => ({ estado: r.estado, pedidos: Number(r.pedidos), ventas: Number(r.ventas) })),
      por_zona:      porZona.map((r)      => ({ zona: r.zona, pedidos: Number(r.pedidos), ventas: Number(r.ventas) })),
      clientes_top:  clientesTop.map((r)  => ({ nombre: r.nombre, telefono: r.telefono, pedidos: Number(r.pedidos), ventas: Number(r.ventas) })),
      por_despacho:  porDespacho.map((r)  => ({ tipo: r.tipo, pedidos: Number(r.pedidos), ventas: Number(r.ventas) })),
    });
  } catch (err) {
    console.error('[GET /dashboard/:slug/analytics] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

export default dashboardRoutes;
