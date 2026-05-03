import { Hono } from 'hono';
import type { Variables } from '../types.js';
import sql from '../lib/db.js';
import { calcIsOpen, getHorarioHoy, type Horario } from '../lib/is-open.js';
import { resolveTenant } from '../middleware/tenant.js';
import { checkRateLimit } from '../lib/rate-limit.js';

const publicRoutes = new Hono<{ Variables: Variables }>();

publicRoutes.use('/:slug/*', resolveTenant);

// ----------------------------------------------------------------------------
// GET /public/:slug/restaurant
// Returns public restaurant info + real-time is_open calculated from horarios.
// Excludes: datos_bancarios, lat, long (sensitive / not needed publicly).
// ----------------------------------------------------------------------------
publicRoutes.get('/:slug/restaurant', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  // CRÍTICO-1: wrap the entire handler body so any unexpected DB error
  // returns a controlled JSON 503 instead of a Hono default stack trace.
  try {
  // Three queries in parallel — all filtered by restaurante_id resolved from slug.
  // Q3 has its own .catch() because restaurante_config.restaurante_id column
  // is a pending migration (CRÍTICO-2): if it doesn't exist yet, Q3 fails
  // gracefully and is_open_override falls back to null without breaking Q1/Q2.
  const [restauranteRows, horariosRows, overrideRows, brandingRows] = await Promise.all([

    // Q1: Public restaurant fields. datos_bancarios / lat / long excluded explicitly.
    sql<RestauranteRow[]>`
      SELECT
        id,
        nombre,
        slug,
        descripcion,
        logo_url,
        brand_color,
        direccion,
        delivery_enabled,
        pickup_enabled,
        delivery_min_order,
        telefono,
        moneda,
        zona_horaria,
        mensaje_bienvenida,
        mensaje_cerrado,
        radio_cobertura_km,
        tarifa_envio_tipo,
        tarifa_envio_valor,
        payment_methods,
        datos_bancarios
      FROM restaurante
      WHERE id = ${restaurante_id}
      LIMIT 1
    `,

    // Q2: All schedule rows for this tenant.
    // TO_CHAR strips seconds from the time columns → "HH24:MI" format.
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

    // Q3: Manual override. Tolerant to the pending migration that adds
    // restaurante_id column + composite PK to restaurante_config.
    // Falls back to [] (override = null) if the column doesn't exist yet.
    sql<{ config_value: string }[]>`
      SELECT config_value
      FROM restaurante_config
      WHERE config_key     = 'is_open_override'
        AND restaurante_id = ${restaurante_id}
      LIMIT 1
    `.catch(() => [] as { config_value: string }[]),

    // Q4: Branding fields added by M-13 + M-14.
    // Tolerant: if migrations not applied yet, falls back to [] silently.
    sql<{ eslogan: string | null; texto_banner: string | null; redes_sociales: unknown; theme_id: string | null }[]>`
      SELECT eslogan, texto_banner, redes_sociales, theme_id
      FROM restaurante
      WHERE id = ${restaurante_id}
      LIMIT 1
    `.catch(() => [] as { eslogan: null; texto_banner: null; redes_sociales: null; theme_id: null }[]),
  ]);

  // MEDIO-1: guard against race condition where restaurant is deleted between
  // resolveTenant and Q1 (extremely unlikely but prevents a TypeError crash).
  const r = restauranteRows[0];
  if (!r) {
    return c.json({ error: 'restaurant_not_found' }, 404);
  }

  // Parse override: stored as the string "true" or "false"; null when absent.
  const rawOverride = overrideRows[0]?.config_value ?? null;

  // BAJO-4: warn when the stored value is not a recognised boolean string.
  if (rawOverride !== null && rawOverride !== 'true' && rawOverride !== 'false') {
    console.warn(
      `[tenant:${restaurante_id}] Unexpected is_open_override value: "${rawOverride}" — treating as null`,
    );
  }

  const isOpenOverride =
    rawOverride === 'true'  ? true  :
    rawOverride === 'false' ? false :
    null;

  // is_open uses restaurante.zona_horaria as the sole timezone source.
  const isOpenCalculated = calcIsOpen(horariosRows, r.zona_horaria);
  const isOpen = isOpenOverride !== null ? isOpenOverride : isOpenCalculated;

  const horarioHoy = getHorarioHoy(horariosRows, r.zona_horaria);

  return c.json({
    id:                  r.id,
    slug:                r.slug,
    name:                r.nombre,
    description:         r.descripcion,
    logo_url:            r.logo_url,
    brand_color:         r.brand_color ?? '#6366F1',
    eslogan:             brandingRows[0]?.eslogan      ?? null,
    texto_banner:        brandingRows[0]?.texto_banner ?? null,
    redes_sociales:      (brandingRows[0]?.redes_sociales as Array<{ red: string; url: string }> | null) ?? null,
    theme_id:            brandingRows[0]?.theme_id     ?? null,
    address:             r.direccion,
    delivery_enabled:    r.delivery_enabled ?? true,
    pickup_enabled:      r.pickup_enabled ?? true,
    delivery_min_order:  Number(r.delivery_min_order ?? 0),
    phone:               r.telefono,
    moneda:              r.moneda,
    zona_horaria:        r.zona_horaria,
    mensaje_bienvenida:  r.mensaje_bienvenida,
    mensaje_cerrado:     r.mensaje_cerrado,
    radio_cobertura_km:  r.radio_cobertura_km,
    tarifa_envio_tipo:   r.tarifa_envio_tipo,
    tarifa_envio_valor:  r.tarifa_envio_valor,
    payment_methods:     r.payment_methods ?? [],
    datos_bancarios:     r.datos_bancarios ?? null,
    is_open:             isOpen,
    is_open_override:    isOpenOverride,
    horario_hoy:         horarioHoy
      ? {
          dia:        horarioHoy.dia,
          disponible: horarioHoy.disponible,
          apertura_1: horarioHoy.apertura_1,
          cierre_1:   horarioHoy.cierre_1,
          apertura_2: horarioHoy.apertura_2,
          cierre_2:   horarioHoy.cierre_2,
        }
      : null,
  });

  // CRÍTICO-1: catch block — covers DB down, query timeout, unexpected throws.
  } catch (err) {
    console.error('[GET /public/:slug/restaurant] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// GET /public/:slug/menu
// Returns the full catalog: categories → items → variants + extras.
// image_url is hardcoded null — pending DB migration (column does not exist yet).
// ----------------------------------------------------------------------------
publicRoutes.get('/:slug/menu', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  // M-3: only_active=false is silently ignored on the public endpoint.
  // Inactive items (discontinued, under revision) must never be exposed publicly.
  // Debug access to inactive items belongs in a dashboard endpoint with auth.
  const catFilter     = sql`AND mc.is_active = true`;
  const itemFilter    = sql`AND mi.is_active = true`;
  const variantFilter = sql`AND mv.is_active = true`;
  const extraFilter   = sql`AND e.is_active  = true`;

  try {
    const [restauranteRows, categoriesRows, itemsRows, variantsRows, extrasRows] =
      await Promise.all([

        // R: restaurant info needed by the menu header.
        sql<{ moneda: string; nombre: string; brand_color: string; logo_url: string; delivery_min_order: number }[]>`
          SELECT moneda, nombre, brand_color, logo_url, delivery_min_order
          FROM   restaurante
          WHERE  id = ${restaurante_id}
          LIMIT  1
        `,

        // Q1: Categories for this tenant.
        sql<CategoryRow[]>`
          SELECT menu_category_id, name, sort_order, is_active
          FROM   menu_category mc
          WHERE  mc.restaurante_id = ${restaurante_id}
          ${catFilter}
          ORDER  BY mc.sort_order ASC
        `,

        // Q2: Items for this tenant (menu_category_id used for tree assembly).
        sql<ItemRow[]>`
          SELECT menu_item_id, menu_category_id, name,
                 description, is_pizza, is_active, tags,
                 image_url, base_price
          FROM   menu_item mi
          WHERE  mi.restaurante_id = ${restaurante_id}
          ${itemFilter}
          ORDER  BY mi.menu_item_id ASC
        `,

        // Q3: Variants for this tenant.
        // menu_variant.restaurante_id may be NULL for legacy rows — strict filter
        // is intentional: only serve variants explicitly tied to this tenant.
        sql<VariantRow[]>`
          SELECT menu_variant_id, menu_item_id, variant_name,
                 price, is_default, is_active, sku
          FROM   menu_variant mv
          WHERE  mv.restaurante_id = ${restaurante_id}
          ${variantFilter}
          ORDER  BY mv.menu_variant_id ASC
        `,

        // Q4: Extras reachable from this tenant's items.
        // Double-filtered: both the parent item and the extra must belong to
        // this restaurante_id, preventing cross-tenant leaks even if
        // menu_item_extra has no restaurante_id column.
        // C-2: itemFilter applied in the JOIN condition so extras of inactive
        // items are excluded consistently, not just implicitly by tree assembly.
        sql<ExtraRow[]>`
          SELECT e.extra_id, mie.menu_item_id,
                 e.name, e.price, e.allergens, e.is_active
          FROM   extra e
          JOIN   menu_item_extra mie ON mie.extra_id    = e.extra_id
          JOIN   menu_item       mi  ON mi.menu_item_id = mie.menu_item_id
                                   AND mi.restaurante_id = ${restaurante_id}
                                   AND mi.is_active = true
          WHERE  e.restaurante_id = ${restaurante_id}
          ${extraFilter}
          ORDER  BY e.extra_id ASC
        `,
      ]);

    // M-4: guard against race condition where restaurant is deleted between
    // resolveTenant and the parallel queries.
    if (!restauranteRows[0]) {
      return c.json({ error: 'restaurant_not_found' }, 404);
    }
    const moneda = restauranteRows[0].moneda;

    // Build O(n) lookup maps before assembling the tree.
    const variantsByItem  = groupBy<VariantRow>(variantsRows,  (v) => v.menu_item_id);
    const extrasByItem    = groupBy<ExtraRow>(extrasRows,      (e) => e.menu_item_id);
    const itemsByCategory = groupBy<ItemRow>(itemsRows,        (i) => i.menu_category_id);

    // C-1: warn when an active item has no variants — likely a legacy row with
    // menu_variant.restaurante_id = NULL that the strict tenant filter excluded.
    // Fix: run UPDATE menu_variant SET restaurante_id = <id> WHERE restaurante_id IS NULL.
    for (const item of itemsRows) {
      if (!variantsByItem.has(item.menu_item_id)) {
        console.warn(
          `[tenant:${restaurante_id}] item ${item.menu_item_id} ("${item.name}") has no active variants — possible NULL restaurante_id in menu_variant`,
        );
      }
    }

    const categories = (categoriesRows as CategoryRow[]).map((cat: CategoryRow) => ({
      menu_category_id: cat.menu_category_id,
      name:             cat.name,
      sort_order:       cat.sort_order,
      is_active:        cat.is_active,
      items: (itemsByCategory.get(cat.menu_category_id) ?? []).map((item) => ({
        menu_item_id: item.menu_item_id,
        name:         item.name,
        description:  item.description,
        is_pizza:     item.is_pizza,
        is_active:    item.is_active,
        tags:         item.tags,
        image_url:    item.image_url ?? null,
        base_price:   item.base_price !== null ? parseFloat(item.base_price) : 0,
        variants: (variantsByItem.get(item.menu_item_id) ?? []).map((v) => ({
          menu_variant_id: v.menu_variant_id,
          variant_name:    v.variant_name,
          // M-1: postgres returns numeric as string — parse to float for contract compliance.
          price:           parseFloat(v.price),
          is_default:      v.is_default,
          is_active:       v.is_active,
          sku:             v.sku,
        })),
        extras: (extrasByItem.get(item.menu_item_id) ?? []).map((e) => ({
          extra_id:  e.extra_id,
          name:      e.name,
          // M-1: same numeric coercion; extra price can be null (free extra).
          price:     e.price !== null ? parseFloat(e.price) : null,
          allergens: e.allergens,
          is_active: e.is_active,
        })),
      })),
    }));

    const rest = restauranteRows[0];
    return c.json({
      restaurante_id,
      moneda:              rest.moneda,
      restaurant_name:     rest.nombre,
      brand_color:         rest.brand_color ?? '#E63946',
      logo_url:            rest.logo_url ?? null,
      delivery_min_order:  Number(rest.delivery_min_order ?? 0),
      categories,
    });

  } catch (err) {
    console.error('[GET /public/:slug/menu] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// GET /public/:slug/delivery/zones
// Returns active delivery zones for the tenant, ordered by zone_name.
// Used by the checkout flow so the customer can select their delivery area.
// Only is_active = true zones are returned — inactive zones are invisible to
// the public (no flag, no explanation, just excluded from the list).
// NOTE: delivery_zone has UNIQUE (postal_code) without restaurante_id — a
// known multi-tenant gap in the DDL. The WHERE restaurante_id filter here
// ensures we only serve zones belonging to this tenant regardless.
// ----------------------------------------------------------------------------
publicRoutes.get('/:slug/delivery/zones', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  try {
    const zones = await sql<DeliveryZoneRow[]>`
      SELECT
        delivery_zone_id,
        zone_name,
        postal_code,
        fee,
        min_order_amount,
        estimated_minutes_min,
        estimated_minutes_max,
        description
      FROM delivery_zone
      WHERE restaurante_id = ${restaurante_id}
        AND is_active       = true
      ORDER BY zone_name ASC
    `;

    return c.json({
      zones: zones.map((z) => ({
        delivery_zone_id:      Number(z.delivery_zone_id),
        zone_name:             z.zone_name,
        postal_code:           z.postal_code,
        fee:                   parseFloat(z.fee),
        min_order_amount:      z.min_order_amount !== null ? parseFloat(z.min_order_amount) : null,
        estimated_minutes_min: z.estimated_minutes_min,
        estimated_minutes_max: z.estimated_minutes_max,
        description:           z.description,
      })),
    });

  } catch (err) {
    console.error('[GET /public/:slug/delivery/zones] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// GET /public/:slug/hours
// Returns the full weekly schedule for the restaurant plus the current
// is_open status, so the public menu page can show opening hours to customers.
// is_open uses restaurante.zona_horaria — never restaurante_config.timezone.
// Internal IDs (horarios.id) are excluded from the public response.
// ----------------------------------------------------------------------------
publicRoutes.get('/:slug/hours', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  try {
    const [restauranteRows, horariosRows, overrideRows] = await Promise.all([

      // Q1: timezone — needed for is_open calculation.
      sql<{ zona_horaria: string }[]>`
        SELECT zona_horaria
        FROM   restaurante
        WHERE  id = ${restaurante_id}
        LIMIT  1
      `,

      // Q2: Full week schedule for this tenant.
      // TO_CHAR strips seconds → "HH24:MI" format matching the contract.
      // Ordered by canonical Spanish weekday so client always receives Mon→Sun.
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

      // Q3: Manual override — same tolerant pattern as /restaurant endpoint.
      // Fails gracefully if restaurante_config.restaurante_id migration pending.
      sql<{ config_value: string }[]>`
        SELECT config_value
        FROM restaurante_config
        WHERE config_key     = 'is_open_override'
          AND restaurante_id = ${restaurante_id}
        LIMIT 1
      `.catch(() => [] as { config_value: string }[]),
    ]);

    // Guard against race condition between resolveTenant and Q1.
    if (!restauranteRows[0]) {
      return c.json({ error: 'restaurant_not_found' }, 404);
    }
    const { zona_horaria } = restauranteRows[0];

    const rawOverride = overrideRows[0]?.config_value ?? null;
    const isOpenOverride =
      rawOverride === 'true'  ? true  :
      rawOverride === 'false' ? false :
      null;

    const isOpenCalculated = calcIsOpen(horariosRows, zona_horaria);
    const isOpen = isOpenOverride !== null ? isOpenOverride : isOpenCalculated;

    const horarioHoy = getHorarioHoy(horariosRows, zona_horaria);

    // restaurante_id is intentionally excluded — slug is the public key.
    return c.json({
      zona_horaria,
      is_open:      isOpen,
      dia_hoy:      horarioHoy?.dia ?? null,
      schedule: horariosRows.map((h) => ({
        dia:        h.dia,
        disponible: h.disponible,
        apertura_1: h.apertura_1,
        cierre_1:   h.cierre_1,
        apertura_2: h.apertura_2,
        cierre_2:   h.cierre_2,
      })),
    });

  } catch (err) {
    console.error('[GET /public/:slug/hours] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// GET /public/:slug/customer/lookup
//
// Pre-fills the checkout form with the customer's saved name and frequent
// address, identified by phone number.
//
// Security:
//   - Rate limited: 5 req/IP/min → 429.  In-memory store; resets on restart
//     (acceptable for MVP — persistent Redis limit is post-MVP).
//   - Always returns 200 regardless of whether the phone exists, to prevent
//     enumeration attacks (never 404 on "not found").
//   - Response is intentionally minimal: no telefono, no usuario_id, no lat/lng.
//   - Multi-tenant: query always includes restaurante_id from resolveTenant.
//     A phone in tenant A is invisible when querying tenant B's slug.
//
// Query param: telefono (string, required).
// ----------------------------------------------------------------------------

// 5 req / IP / 60 s sliding window.
const LOOKUP_RATE_LIMIT = 5;
const LOOKUP_WINDOW_MS  = 60_000;

interface RateBucket { count: number; windowStart: number }
const lookupRateMap = new Map<string, RateBucket>();

// CRITICO-2: purge expired buckets every window to prevent unbounded memory growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of lookupRateMap) {
    if (now - bucket.windowStart >= LOOKUP_WINDOW_MS) lookupRateMap.delete(key);
  }
}, LOOKUP_WINDOW_MS);

function checkLookupRateLimit(ip: string): boolean {
  const now    = Date.now();
  const bucket = lookupRateMap.get(ip);

  if (!bucket || now - bucket.windowStart >= LOOKUP_WINDOW_MS) {
    lookupRateMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= LOOKUP_RATE_LIMIT) return false;
  bucket.count++;
  return true;
}

publicRoutes.get('/:slug/customer/lookup', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  // Rate-limit by IP. x-forwarded-for is set by EasyPanel/nginx.
  // CRITICO-1: reject when IP cannot be resolved — avoids shared 'unknown' bucket.
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
          ?? c.req.header('x-real-ip')?.trim();

  if (!ip) {
    console.warn('[GET /public/:slug/customer/lookup] Unresolvable IP — rejected');
    return c.json({ error: 'bad_request' }, 400);
  }

  if (!checkLookupRateLimit(ip)) {
    return c.json({ error: 'too_many_requests' }, 429);
  }

  // Validate required query param.
  const telefono = c.req.query('telefono')?.trim();
  if (!telefono) {
    return c.json({ error: 'missing_param' }, 400);
  }
  // MEDIO-1: reject clearly malformed values — saves a DB round-trip and slot de rate limit.
  if (!/^\+?[0-9]{7,20}$/.test(telefono)) {
    return c.json({ error: 'invalid_param' }, 400);
  }

  try {
    const rows = await sql<UsuarioLookupRow[]>`
      SELECT nombre, direccion_frecuente
      FROM   usuarios
      WHERE  telefono      = ${telefono}
        AND  restaurante_id = ${restaurante_id}
      LIMIT  1
    `;

    if (rows.length === 0) {
      return c.json({ found: false });
    }

    const u = rows[0];
    // Expose only the first name — full name is PII.
    const primerNombre = u.nombre ? u.nombre.split(' ')[0] : null;

    return c.json({
      found:               true,
      nombre:              primerNombre,
      direccion_frecuente: u.direccion_frecuente ?? null,
    });

  } catch (err) {
    // MEDIO-2: log only message — postgres.js errors can include query param values.
    console.error('[GET /public/:slug/customer/lookup]', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ----------------------------------------------------------------------------
// POST /public/:slug/cart/validate
//
// Validates that cart prices match current DB prices and all variants/extras
// are still active. Never writes to any table — read-only validation.
//
// Body: { items: [{ menu_variant_id, quantity, unit_price_claimed, extras? }] }
//
// Returns:
//   valid          — false if any price changed or any item is unavailable
//   price_changed  — true if at least one price_delta != 0
//   items          — per-line detail with unit_price_current/claimed/delta
//   subtotal_current / subtotal_claimed
//   unavailable_items — reasons: "variant_not_found" | "variant_inactive" |
//                                "extra_not_found"   | "extra_inactive"   |
//                                "extra_not_linked" (extra not in menu_item_extra for this item)
// ----------------------------------------------------------------------------
const MAX_CART_ITEMS = 50;
publicRoutes.post('/:slug/cart/validate', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  // Rate limit: 60 req/IP/min — enough for normal checkout flows, blocks
  // systematic price/availability enumeration.
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? c.req.header('x-real-ip')
    ?? 'unknown';
  if (!checkRateLimit(`cart-validate:${ip}`, 60)) {
    return c.json({ error: 'rate_limit_exceeded' }, 429);
  }

  // Parse body — Hono throws on malformed JSON, caught by the try/catch below.
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  // Basic structural validation of the top-level shape.
  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as CartValidateBody).items) ||
    (body as CartValidateBody).items.length === 0
  ) {
    return c.json({ error: 'items_required' }, 400);
  }

  if ((body as CartValidateBody).items.length > MAX_CART_ITEMS) {
    return c.json({ error: 'too_many_items', max: MAX_CART_ITEMS }, 400);
  }

  const { items } = body as CartValidateBody;

  // Validate each item's required scalar fields before touching the DB.
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (
      typeof item.menu_variant_id !== 'number' ||
      !Number.isInteger(item.menu_variant_id) ||
      item.menu_variant_id < 1
    ) {
      return c.json({ error: 'invalid_menu_variant_id', index: i }, 400);
    }
    if (
      typeof item.quantity !== 'number' ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    ) {
      return c.json({ error: 'invalid_quantity', index: i }, 400);
    }
    if (typeof item.unit_price_claimed !== 'number' || item.unit_price_claimed < 0) {
      return c.json({ error: 'invalid_unit_price_claimed', index: i }, 400);
    }
    // Validate extras shape when present.
    if (item.extras !== undefined) {
      if (!Array.isArray(item.extras)) {
        return c.json({ error: 'invalid_extras', index: i }, 400);
      }
      for (let j = 0; j < item.extras.length; j++) {
        const ex = item.extras[j];
        if (
          typeof ex.extra_id !== 'number' ||
          !Number.isInteger(ex.extra_id) ||
          ex.extra_id < 1
        ) {
          return c.json({ error: 'invalid_extra_id', item_index: i, extra_index: j }, 400);
        }
        if (typeof ex.unit_price_claimed !== 'number' || ex.unit_price_claimed < 0) {
          return c.json({ error: 'invalid_extra_price_claimed', item_index: i, extra_index: j }, 400);
        }
        if (
          typeof ex.quantity !== 'number' ||
          !Number.isInteger(ex.quantity) ||
          ex.quantity < 1
        ) {
          return c.json({ error: 'invalid_extra_quantity', item_index: i, extra_index: j }, 400);
        }
      }
    }
  }

  try {
    // Collect all unique IDs so we can fetch them in two bulk queries
    // instead of N+1 per item.
    const variantIds = [...new Set(items.map((i) => i.menu_variant_id))];
    const extraIds   = [
      ...new Set(
        items.flatMap((i) => (i.extras ?? []).map((e) => e.extra_id)),
      ),
    ];

    // Q1/Q2/Q3 run in parallel — all inputs are known before any query.
    //
    // Q1: Variants filtered by tenant. The JOIN on menu_item is the authoritative
    //     multi-tenant guard because menu_variant.restaurante_id can be NULL on
    //     legacy rows. The AND on mv.restaurante_id adds a second layer for rows
    //     that do carry the column, blocking cross-tenant leaks in corrupt data.
    //
    // Q2: Extras filtered by tenant restaurante_id directly.
    //
    // Q3: menu_item_extra linkage — validates that each extra actually belongs
    //     to the menu item of its cart line (MEDIO-2). menu_item_extra has no
    //     restaurante_id; tenant safety comes from Q1 (menu_item) + Q2 (extra).
    const [variantRows, extraRows, linkageRows] = await Promise.all([

      variantIds.length > 0
        ? sql<ValidateVariantRow[]>`
            SELECT
              mv.menu_variant_id,
              mv.menu_item_id,
              mv.variant_name,
              mv.price,
              mv.is_active,
              mi.name AS item_name
            FROM   menu_variant mv
            JOIN   menu_item    mi ON mi.menu_item_id   = mv.menu_item_id
                                  AND mi.restaurante_id = ${restaurante_id}
            WHERE  mv.menu_variant_id = ANY(${variantIds})
              AND  (mv.restaurante_id = ${restaurante_id} OR mv.restaurante_id IS NULL)
          `
        : Promise.resolve([] as ValidateVariantRow[]),

      extraIds.length > 0
        ? sql<ValidateExtraRow[]>`
            SELECT
              extra_id,
              name,
              price,
              is_active
            FROM   extra
            WHERE  extra_id       = ANY(${extraIds})
              AND  restaurante_id = ${restaurante_id}
          `
        : Promise.resolve([] as ValidateExtraRow[]),

      extraIds.length > 0
        ? sql<{ menu_item_id: number; extra_id: number }[]>`
            SELECT menu_item_id, extra_id
            FROM   menu_item_extra
            WHERE  extra_id = ANY(${extraIds})
          `
        : Promise.resolve([] as { menu_item_id: number; extra_id: number }[]),
    ]);

    // Build lookup maps for O(1) access during assembly.
    const variantMap = new Map<number, ValidateVariantRow>();
    for (const v of variantRows) variantMap.set(v.menu_variant_id, v);

    const extraMap = new Map<number, ValidateExtraRow>();
    for (const e of extraRows) extraMap.set(e.extra_id, e);

    // Set of "menu_item_id:extra_id" strings for O(1) linkage checks (MEDIO-2).
    const extraLinkageSet = new Set<string>();
    for (const row of linkageRows) {
      extraLinkageSet.add(`${row.menu_item_id}:${row.extra_id}`);
    }

    // Assemble result, collecting unavailable items and price deltas.
    const resultItems: ValidatedItem[]      = [];
    const unavailableItems: UnavailableItem[] = [];
    let priceChanged  = false;
    let anyUnavailable = false;
    let subtotalCurrent = 0;
    let subtotalClaimed = 0;

    for (const item of items) {
      const variant = variantMap.get(item.menu_variant_id);

      // Variant not found or belongs to a different tenant (not in variantMap).
      if (!variant) {
        unavailableItems.push({
          menu_variant_id: item.menu_variant_id,
          reason: 'variant_not_found',
        });
        anyUnavailable = true;
        // Still accumulate the claimed subtotal for the summary.
        subtotalClaimed +=
          item.unit_price_claimed * item.quantity +
          (item.extras ?? []).reduce(
            (acc: number, e: CartExtraInput) => acc + e.unit_price_claimed * e.quantity,
            0,
          );
        continue;
      }

      if (!variant.is_active) {
        unavailableItems.push({
          menu_variant_id: item.menu_variant_id,
          reason: 'variant_inactive',
        });
        anyUnavailable = true;
        subtotalClaimed +=
          item.unit_price_claimed * item.quantity +
          (item.extras ?? []).reduce(
            (acc: number, e: CartExtraInput) => acc + e.unit_price_claimed * e.quantity,
            0,
          );
        continue;
      }

      const unitPriceCurrent = parseFloat(variant.price);
      const variantDelta = round2(unitPriceCurrent - item.unit_price_claimed);
      if (variantDelta !== 0) priceChanged = true;

      // Validate extras for this line item.
      const resultExtras: ValidatedExtra[] = [];
      for (const ex of (item.extras ?? [])) {
        const extra = extraMap.get(ex.extra_id);

        if (!extra) {
          unavailableItems.push({ extra_id: ex.extra_id, reason: 'extra_not_found' });
          anyUnavailable = true;
          subtotalClaimed += ex.unit_price_claimed * ex.quantity;
          continue;
        }
        if (!extra.is_active) {
          unavailableItems.push({ extra_id: ex.extra_id, reason: 'extra_inactive' });
          anyUnavailable = true;
          subtotalClaimed += ex.unit_price_claimed * ex.quantity;
          continue;
        }
        // MEDIO-2: reject extras not linked to this specific menu item.
        if (!extraLinkageSet.has(`${variant.menu_item_id}:${ex.extra_id}`)) {
          unavailableItems.push({ extra_id: ex.extra_id, reason: 'extra_not_linked' });
          anyUnavailable = true;
          subtotalClaimed += ex.unit_price_claimed * ex.quantity;
          continue;
        }

        // MEDIO-3: extra.price = NULL means "free" in the DDL convention
        // ("0 si es gratuito"), but NULL can also indicate incomplete data.
        // Warn so data quality issues surface in logs without breaking the response.
        if (extra.price === null && ex.unit_price_claimed > 0) {
          console.warn(
            `[tenant:${restaurante_id}] extra ${ex.extra_id} has NULL price in DB but client claimed ${ex.unit_price_claimed} — treating DB price as 0`,
          );
        }
        const extraPriceCurrent = parseFloat(extra.price ?? '0');
        const extraDelta = round2(extraPriceCurrent - ex.unit_price_claimed);
        if (extraDelta !== 0) priceChanged = true;

        subtotalCurrent += extraPriceCurrent * ex.quantity;
        subtotalClaimed += ex.unit_price_claimed * ex.quantity;

        resultExtras.push({
          extra_id:           extra.extra_id,
          name:               extra.name,
          quantity:           ex.quantity,
          unit_price_current: extraPriceCurrent,
          unit_price_claimed: ex.unit_price_claimed,
          price_delta:        extraDelta,
          is_active:          extra.is_active,
        });
      }

      const lineCurrent = unitPriceCurrent * item.quantity;
      const lineClaimed = item.unit_price_claimed * item.quantity;
      subtotalCurrent += lineCurrent;
      subtotalClaimed += lineClaimed;

      resultItems.push({
        menu_variant_id:    item.menu_variant_id,
        menu_item_id:       variant.menu_item_id,
        variant_name:       variant.variant_name,
        item_name:          variant.item_name,
        quantity:           item.quantity,
        unit_price_current: unitPriceCurrent,
        unit_price_claimed: item.unit_price_claimed,
        price_delta:        variantDelta,
        is_active:          variant.is_active,
        extras:             resultExtras,
      });
    }

    const valid = !priceChanged && !anyUnavailable;

    return c.json({
      valid,
      price_changed:     priceChanged,
      items:             resultItems,
      subtotal_current:  round2(subtotalCurrent),
      subtotal_claimed:  round2(subtotalClaimed),
      unavailable_items: unavailableItems,
    });

  } catch (err) {
    console.error('[POST /public/:slug/cart/validate] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Rounds to 2 decimal places using the "round half away from zero" strategy,
// avoiding floating-point noise (e.g. 0.1 + 0.2 = 0.30000000000000004).
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function groupBy<T>(items: T[], key: (item: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface RestauranteRow {
  id: number;
  slug: string;
  nombre: string;
  descripcion: string | null;
  logo_url: string | null;
  brand_color: string | null;
  direccion: string | null;
  telefono: string | null;
  moneda: string;
  zona_horaria: string;
  mensaje_bienvenida: string | null;
  mensaje_cerrado: string | null;
  radio_cobertura_km: string | null;
  tarifa_envio_tipo: string | null;
  tarifa_envio_valor: string | null;
  delivery_enabled: boolean | null;
  pickup_enabled: boolean | null;
  delivery_min_order: string | null;
  payment_methods: string[] | null;
  datos_bancarios: Record<string, string | null> | null;
}

interface CategoryRow {
  menu_category_id: number;
  name: string;
  sort_order: number | null;
  is_active: boolean;
}

interface ItemRow {
  menu_item_id: number;
  menu_category_id: number;
  name: string;
  description: string | null;
  is_pizza: boolean;
  is_active: boolean;
  tags: string | null;
  image_url: string | null;
  base_price: string | null;  // postgres numeric → string
}

interface VariantRow {
  menu_variant_id: number;
  menu_item_id: number;
  variant_name: string;
  price: string; // postgres returns numeric as string
  is_default: boolean;
  is_active: boolean;
  sku: string | null;
}

interface ExtraRow {
  extra_id: number;
  menu_item_id: number;
  name: string;
  price: string | null;
  allergens: string | null;
  is_active: boolean;
}

interface DeliveryZoneRow {
  delivery_zone_id: number;
  zone_name: string;
  postal_code: string;
  fee: string;           // postgres numeric → string
  min_order_amount: string | null;
  estimated_minutes_min: number | null;
  estimated_minutes_max: number | null;
  description: string | null;
}

interface UsuarioLookupRow {
  nombre: string | null;
  direccion_frecuente: string | null;
}

// ---------------------------------------------------------------------------
// cart/validate — body types
// ---------------------------------------------------------------------------

interface CartExtraInput {
  extra_id: number;
  unit_price_claimed: number;
  quantity: number;
}

interface CartItemInput {
  menu_variant_id: number;
  quantity: number;
  unit_price_claimed: number;
  extras?: CartExtraInput[];
}

interface CartValidateBody {
  items: CartItemInput[];
}

// ---------------------------------------------------------------------------
// cart/validate — DB row types
// ---------------------------------------------------------------------------

interface ValidateVariantRow {
  menu_variant_id: number;
  menu_item_id: number;
  variant_name: string;
  price: string; // postgres numeric → string
  is_active: boolean;
  item_name: string;
}

interface ValidateExtraRow {
  extra_id: number;
  name: string;
  price: string | null;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// cart/validate — response shape types
// ---------------------------------------------------------------------------

interface ValidatedExtra {
  extra_id: number;
  name: string;
  quantity: number;
  unit_price_current: number;
  unit_price_claimed: number;
  price_delta: number;
  is_active: boolean;
}

interface ValidatedItem {
  menu_variant_id: number;
  menu_item_id: number;
  variant_name: string;
  item_name: string;
  quantity: number;
  unit_price_current: number;
  unit_price_claimed: number;
  price_delta: number;
  is_active: boolean;
  extras: ValidatedExtra[];
}

interface UnavailableItem {
  menu_variant_id?: number;
  extra_id?: number;
  reason: 'variant_not_found' | 'variant_inactive' | 'extra_not_found' | 'extra_inactive' | 'extra_not_linked';
}

export default publicRoutes;
