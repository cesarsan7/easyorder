import { Hono } from 'hono';
import type { Variables } from '../types.js';
import sql from '../lib/db.js';
import { calcIsOpen, type Horario } from '../lib/is-open.js';
import { resolveTenant } from '../middleware/tenant.js';
import { checkRateLimit } from '../lib/rate-limit.js';

const ordersRoutes = new Hono<{ Variables: Variables }>();

ordersRoutes.use('/:slug/*', resolveTenant);

// ---------------------------------------------------------------------------
// POST /public/:slug/orders
//
// Creates a new order after validating in this exact sequence:
//   1. slug → restaurante_id  (resolveTenant middleware)
//   2. is_open check          → 422 local_closed
//   3. double-submit check    → 409 with existing pedido_codigo
//   4. metodo_pago allowed    → 422 payment_method_not_accepted
//   5. variant + extra tenant check → 422 invalid_items
//   6. delivery zone check    → 422 zone_not_found / below_minimum
//   7. INSERT with canal='web'; trigger trg_set_pedido_codigo assigns the code
// ---------------------------------------------------------------------------

const MAX_ORDER_ITEMS = 50;
const DELIVERY_ESTADOS = new Set(['transferencia', 'online']);

ordersRoutes.post('/:slug/orders', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  // ── 0. Parse body ─────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  if (!body || typeof body !== 'object') {
    return c.json({ error: 'invalid_body' }, 400);
  }
  const b = body as Record<string, unknown>;

  // Required scalars
  const telefono = typeof b.telefono === 'string' ? b.telefono.trim() : null;
  if (!telefono)                                return c.json({ error: 'telefono_required' }, 400);
  if (!/^\+?[0-9]{7,20}$/.test(telefono))      return c.json({ error: 'invalid_telefono' }, 400);

  const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : null;
  if (!nombre)                                  return c.json({ error: 'nombre_required' }, 400);

  const tipo_despacho = b.tipo_despacho === 'delivery' || b.tipo_despacho === 'retiro'
    ? b.tipo_despacho
    : null;
  if (!tipo_despacho) {
    return c.json({ error: 'invalid_tipo_despacho', valid: ['delivery', 'retiro'] }, 400);
  }

  const metodo_pago = typeof b.metodo_pago === 'string' ? b.metodo_pago.trim() : null;
  if (!metodo_pago)                             return c.json({ error: 'metodo_pago_required' }, 400);

  // Delivery-specific
  const direccion = tipo_despacho === 'delivery'
    ? (typeof b.direccion === 'string' ? b.direccion.trim() || null : null)
    : null;
  if (tipo_despacho === 'delivery' && !direccion) {
    return c.json({ error: 'delivery_requires_address' }, 422);
  }

  const zona_id = tipo_despacho === 'delivery'
    ? (typeof b.zona_id === 'number' && Number.isInteger(b.zona_id) && b.zona_id >= 1
       ? b.zona_id : null)
    : null;
  if (tipo_despacho === 'delivery' && zona_id === null) {
    return c.json({ error: 'delivery_requires_zona_id' }, 400);
  }

  const notas = typeof b.notas === 'string' ? b.notas.trim() || null : null;

  // Items array
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return c.json({ error: 'items_required' }, 400);
  }
  if (b.items.length > MAX_ORDER_ITEMS) {
    return c.json({ error: 'too_many_items', max: MAX_ORDER_ITEMS }, 400);
  }

  const rawItems = b.items as unknown[];
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i] as Record<string, unknown>;
    if (!it || typeof it !== 'object')
      return c.json({ error: 'invalid_item', index: i }, 400);
    if (typeof it.menu_variant_id !== 'number' || !Number.isInteger(it.menu_variant_id) || it.menu_variant_id < 1)
      return c.json({ error: 'invalid_menu_variant_id', index: i }, 400);
    if (typeof it.menu_item_id !== 'number' || !Number.isInteger(it.menu_item_id) || it.menu_item_id < 1)
      return c.json({ error: 'invalid_menu_item_id', index: i }, 400);
    if (typeof it.item_name !== 'string' || !it.item_name.trim())
      return c.json({ error: 'invalid_item_name', index: i }, 400);
    if (typeof it.variant_name !== 'string' || !it.variant_name.trim())
      return c.json({ error: 'invalid_variant_name', index: i }, 400);
    if (typeof it.quantity !== 'number' || !Number.isInteger(it.quantity) || it.quantity < 1)
      return c.json({ error: 'invalid_quantity', index: i }, 400);
    if (typeof it.unit_price !== 'number' || it.unit_price < 0)
      return c.json({ error: 'invalid_unit_price', index: i }, 400);
    if (it.extras !== undefined) {
      if (!Array.isArray(it.extras))
        return c.json({ error: 'invalid_extras', index: i }, 400);
      for (let j = 0; j < it.extras.length; j++) {
        const ex = it.extras[j] as Record<string, unknown>;
        if (!ex || typeof ex !== 'object')
          return c.json({ error: 'invalid_extra', item_index: i, extra_index: j }, 400);
        if (typeof ex.extra_id !== 'number' || !Number.isInteger(ex.extra_id) || ex.extra_id < 1)
          return c.json({ error: 'invalid_extra_id', item_index: i, extra_index: j }, 400);
        if (typeof ex.unit_price !== 'number' || ex.unit_price < 0)
          return c.json({ error: 'invalid_extra_price', item_index: i, extra_index: j }, 400);
        if (typeof ex.quantity !== 'number' || !Number.isInteger(ex.quantity) || ex.quantity < 1)
          return c.json({ error: 'invalid_extra_quantity', item_index: i, extra_index: j }, 400);
      }
    }
  }
  const items = rawItems as OrderItemInput[];

  try {
    // ── Batch 1 (parallel): restaurant context + is_open + double-submit ────
    //
    // Q1 — restaurante: zona_horaria for is_open, payment_methods for step 4.
    // Q2 — horarios: all rows needed by calcIsOpen.
    // Q3 — override: tolerant .catch() because restaurante_config.restaurante_id
    //      is a pending migration; falls back to null (no override) if missing.
    // Q4 — double-submit: same phone + tenant within 30 s, excluding cancelled.
    const [restauranteRows, horariosRows, overrideRows, recentRows] = await Promise.all([

      sql<RestauranteOrderRow[]>`
        SELECT zona_horaria, payment_methods
        FROM   restaurante
        WHERE  id = ${restaurante_id}
        LIMIT  1
      `,

      sql<Horario[]>`
        SELECT dia, disponible,
               TO_CHAR(apertura_1, 'HH24:MI') AS apertura_1,
               TO_CHAR(cierre_1,   'HH24:MI') AS cierre_1,
               TO_CHAR(apertura_2, 'HH24:MI') AS apertura_2,
               TO_CHAR(cierre_2,   'HH24:MI') AS cierre_2
        FROM   horarios
        WHERE  restaurante_id = ${restaurante_id}
      `,

      sql<{ config_value: string }[]>`
        SELECT config_value
        FROM   restaurante_config
        WHERE  config_key     = 'is_open_override'
          AND  restaurante_id = ${restaurante_id}
        LIMIT  1
      `.catch(() => [] as { config_value: string }[]),

      sql<{ id: number; pedido_codigo: string }[]>`
        SELECT id, pedido_codigo
        FROM   pedidos
        WHERE  telefono       = ${telefono}
          AND  restaurante_id = ${restaurante_id}
          AND  estado         NOT IN ('cancelado')
          AND  created_at     >= NOW() - INTERVAL '30 seconds'
        LIMIT  1
      `,
    ]);

    // Guard against race between resolveTenant and Q1.
    const r = restauranteRows[0];
    if (!r) return c.json({ error: 'restaurant_not_found' }, 404);

    // ── Step 2: is_open ──────────────────────────────────────────────────────
    // zona_horaria from restaurante is the sole timezone source — never
    // restaurante_config.timezone (NF-4 resolution: that key is deleted).
    const rawOverride = overrideRows[0]?.config_value ?? null;
    const isOpenOverride =
      rawOverride === 'true'  ? true  :
      rawOverride === 'false' ? false :
      null;
    const isOpen =
      isOpenOverride !== null ? isOpenOverride : calcIsOpen(horariosRows, r.zona_horaria);

    if (!isOpen) {
      return c.json({ error: 'local_closed', reason: 'local_closed' }, 422);
    }

    // ── Step 3: double-submit ────────────────────────────────────────────────
    if (recentRows.length > 0) {
      return c.json({
        error: 'duplicate_order',
        pedido_codigo: recentRows[0].pedido_codigo,
      }, 409);
    }

    // ── Step 4: metodo_pago allowed ──────────────────────────────────────────
    // payment_methods is JSONB — postgres.js returns it as a parsed JS array.
    const paymentMethods: string[] = Array.isArray(r.payment_methods) ? r.payment_methods : [];
    if (!paymentMethods.includes(metodo_pago)) {
      return c.json({
        error: 'payment_method_not_accepted',
        accepted: paymentMethods,
      }, 422);
    }

    // ── Step 5: validate variants + extras against tenant ────────────────────
    //
    // This validation is independent of /cart/validate — the endpoint never
    // trusts an earlier validation call. Both IDs must exist, be active, and
    // belong to restaurante_id resolved from the slug.
    //
    // Variant tenant guard: JOIN on menu_item.restaurante_id is authoritative
    // because menu_variant.restaurante_id can be NULL on legacy rows. The
    // additional AND on mv.restaurante_id blocks cross-tenant leaks on rows
    // that do carry the column.
    const variantIds = [...new Set(items.map((i) => i.menu_variant_id))];
    const extraIds   = [...new Set(
      items.flatMap((i) => (i.extras ?? []).map((e) => e.extra_id)),
    )];

    const [variantRows, extraRows] = await Promise.all([

      // Q_VARIANTS
      variantIds.length > 0
        ? sql<{ menu_variant_id: number; is_active: boolean }[]>`
            SELECT mv.menu_variant_id, mv.is_active
            FROM   menu_variant mv
            JOIN   menu_item    mi ON mi.menu_item_id   = mv.menu_item_id
                                  AND mi.restaurante_id = ${restaurante_id}
            WHERE  mv.menu_variant_id = ANY(${variantIds})
              AND  (mv.restaurante_id = ${restaurante_id} OR mv.restaurante_id IS NULL)
          `
        : Promise.resolve([] as { menu_variant_id: number; is_active: boolean }[]),

      // Q_EXTRAS
      extraIds.length > 0
        ? sql<{ extra_id: number; is_active: boolean }[]>`
            SELECT extra_id, is_active
            FROM   extra
            WHERE  extra_id       = ANY(${extraIds})
              AND  restaurante_id = ${restaurante_id}
          `
        : Promise.resolve([] as { extra_id: number; is_active: boolean }[]),
    ]);

    const validVariants = new Set<number>();
    for (const v of variantRows) { if (v.is_active) validVariants.add(Number(v.menu_variant_id)); }

    const validExtras = new Set<number>();
    for (const e of extraRows) { if (e.is_active) validExtras.add(Number(e.extra_id)); }

    for (const item of items) {
      if (!validVariants.has(item.menu_variant_id)) {
        return c.json({
          error: 'invalid_items',
          reason: 'variant_not_found_or_inactive',
          menu_variant_id: item.menu_variant_id,
        }, 422);
      }
      for (const ex of (item.extras ?? [])) {
        if (!validExtras.has(ex.extra_id)) {
          return c.json({
            error: 'invalid_items',
            reason: 'extra_not_found_or_inactive',
            extra_id: ex.extra_id,
          }, 422);
        }
      }
    }

    // Subtotal uses body prices — the frontend already ran /cart/validate.
    // Prices are re-checked here only for tenant membership, not for drift.
    let subtotal = 0;
    for (const item of items) {
      subtotal += item.unit_price * item.quantity;
      for (const ex of (item.extras ?? [])) subtotal += ex.unit_price * ex.quantity;
    }
    subtotal = round2(subtotal);

    // ── Step 6: delivery zone validation ─────────────────────────────────────
    let costo_envio = 0;
    let tiempo_estimado: string;
    let zone_postal_code: string | null = null;

    if (tipo_despacho === 'delivery') {
      const deliveryZonaId = zona_id as number; // validated non-null above

      const [zoneRows, etaConfigRows] = await Promise.all([

        // Q_ZONE: zone must exist, belong to this tenant, and be active.
        sql<DeliveryZoneRow[]>`
          SELECT delivery_zone_id, fee, min_order_amount,
                 estimated_minutes_min, estimated_minutes_max,
                 postal_code
          FROM   delivery_zone
          WHERE  delivery_zone_id = ${deliveryZonaId}
            AND  restaurante_id   = ${restaurante_id}
            AND  is_active        = true
          LIMIT  1
        `,

        // Q_ETA_CONFIG: fallback when the zone has no specific timing set.
        sql<{ config_key: string; config_value: string }[]>`
          SELECT config_key, config_value
          FROM   restaurante_config
          WHERE  config_key = ANY(${['delivery_eta_min_minutes', 'delivery_eta_max_minutes']})
            AND  restaurante_id = ${restaurante_id}
        `.catch(() => [] as { config_key: string; config_value: string }[]),
      ]);

      if (zoneRows.length === 0) {
        return c.json({ error: 'zone_not_found', reason: 'zone_not_found' }, 422);
      }

      const zone = zoneRows[0];
      const zoneMin = zone.min_order_amount !== null ? parseFloat(zone.min_order_amount) : 0;

      if (zoneMin > 0 && subtotal < zoneMin) {
        return c.json({
          error: 'below_minimum',
          reason: 'below_minimum',
          min_order_amount: zoneMin,
          subtotal_current: subtotal,
        }, 422);
      }

      costo_envio = parseFloat(zone.fee);
      zone_postal_code = zone.postal_code ?? null;

      // Zone's own timing takes precedence over the global config fallback.
      if (zone.estimated_minutes_min !== null && zone.estimated_minutes_max !== null) {
        tiempo_estimado = `${zone.estimated_minutes_min}-${zone.estimated_minutes_max} min`;
      } else {
        const etaMap = new Map(etaConfigRows.map((row) => [row.config_key, row.config_value]));
        const etaMin = parseInt(etaMap.get('delivery_eta_min_minutes') ?? '30', 10);
        const etaMax = parseInt(etaMap.get('delivery_eta_max_minutes') ?? '45', 10);
        tiempo_estimado = `${etaMin}-${etaMax} min`;
      }

    } else {
      // retiro — no zone, no shipping cost, pickup ETA from config.
      const pickupRows = await sql<{ config_value: string }[]>`
        SELECT config_value
        FROM   restaurante_config
        WHERE  config_key     = 'pickup_eta_minutes'
          AND  restaurante_id = ${restaurante_id}
        LIMIT  1
      `.catch(() => [] as { config_value: string }[]);

      const pickupMins = parseInt(pickupRows[0]?.config_value ?? '20', 10);
      tiempo_estimado = `${pickupMins} min`;
    }

    // ── Step 7: initial estado ────────────────────────────────────────────────
    // Todos los pedidos web arrancan en 'recibido' (el operador los confirma
    // desde el dashboard). Excepción: transferencia/online quedan en
    // 'pendiente_pago' hasta que el operador verifique el comprobante.
    const estado = DELIVERY_ESTADOS.has(metodo_pago) ? 'pendiente_pago' : 'recibido';
    const total  = round2(subtotal + costo_envio);

    // ── Step 8: upsert cliente, then insert pedido ────────────────────────────
    //
    // fn_upsert_usuario_perfil currently hardcodes restaurante_id = 1 (audit
    // observation: will be parametrized in Fase 5/6 migration, RC-2 resolution).
    // For MVP with a single active tenant this is not blocking.
    const usuarioRows = await sql<{ id: number }[]>`
      SELECT id
      FROM   fn_upsert_usuario_perfil(${telefono}, ${nombre}, ${tipo_despacho === 'delivery' ? direccion : null}, ${tipo_despacho})
      LIMIT  1
    `;
    const usuario_id = usuarioRows[0]?.id ?? null;

    // Items snapshot: captures prices and names at checkout time so future
    // price changes do not alter historical order records.
    const itemsSnapshot = items.map((item) => ({
      menu_variant_id: item.menu_variant_id,
      menu_item_id:    item.menu_item_id,
      item_name:       item.item_name,
      variant_name:    item.variant_name,
      quantity:        item.quantity,
      unit_price:      item.unit_price,
      extras: (item.extras ?? []).map((ex) => ({
        extra_id:   ex.extra_id,
        name:       ex.name,
        unit_price: ex.unit_price,
        quantity:   ex.quantity,
      })),
    }));

    // Q_INSERT: trg_set_pedido_codigo fires BEFORE INSERT via pg_advisory_xact_lock
    // and assigns pedido_codigo with format YYMMDD-NNNN. Never compute it here.
    // canal = 'web' differentiates web orders from WhatsApp orders in the dashboard
    // (migration M-4: ALTER TABLE pedidos ADD COLUMN canal VARCHAR(20) DEFAULT 'whatsapp').
    const inserted = await sql<PedidoRow[]>`
      INSERT INTO pedidos (
        restaurante_id,
        telefono,
        usuario_id,
        items,
        subtotal,
        costo_envio,
        total,
        tipo_despacho,
        direccion,
        postal_code,
        tiempo_estimado,
        metodo_pago,
        estado,
        notas,
        canal
      ) VALUES (
        ${restaurante_id},
        ${telefono},
        ${usuario_id},
        ${sql.json(itemsSnapshot)},
        ${subtotal},
        ${costo_envio},
        ${total},
        ${tipo_despacho},
        ${tipo_despacho === 'delivery' ? direccion : null},
        ${zone_postal_code},
        ${tiempo_estimado},
        ${metodo_pago},
        ${estado},
        ${notas},
        'web'
      )
      RETURNING
        id,
        pedido_codigo,
        estado,
        tipo_despacho,
        subtotal,
        costo_envio,
        total,
        metodo_pago,
        tiempo_estimado,
        postal_code,
        created_at,
        usuario_id
    `;

    const pedido = inserted[0];
    if (!pedido) {
      console.error('[POST /public/:slug/orders] INSERT returned no rows');
      return c.json({ error: 'order_creation_failed' }, 503);
    }

    if (!pedido.pedido_codigo) {
      console.warn(
        `[POST /public/:slug/orders] pedido ${pedido.id} has null pedido_codigo — ` +
        'verify M-1 migration (DROP TRIGGER tg_set_pedido_codigo) was applied',
      );
    }

    return c.json({
      id:              pedido.id,
      pedido_codigo:   pedido.pedido_codigo,
      estado:          pedido.estado,
      tipo_despacho:   pedido.tipo_despacho,
      subtotal:        parseFloat(pedido.subtotal),
      costo_envio:     parseFloat(pedido.costo_envio),
      total:           parseFloat(pedido.total),
      metodo_pago:     pedido.metodo_pago,
      tiempo_estimado: pedido.tiempo_estimado,
      postal_code:     pedido.postal_code ?? null,
      created_at:      pedido.created_at,
      usuario_id:      pedido.usuario_id,
    }, 201);

  } catch (err) {
    console.error('[POST /public/:slug/orders] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// GET /public/:slug/orders/:pedido_codigo
//
// Tracking endpoint — public, no auth.
// pedido_codigo acts as an implicit access token: knowing it is enough.
// Tenant isolation: the query enforces AND restaurante_id = $restaurante_id
// so a code that exists under another tenant still returns 404.
// ---------------------------------------------------------------------------

ordersRoutes.get('/:slug/orders/:pedido_codigo', async (c) => {
  const restaurante_id  = c.get('restaurante_id');
  const pedido_codigo   = c.req.param('pedido_codigo');

  if (!pedido_codigo || pedido_codigo.trim() === '') {
    return c.json({ error: 'pedido_codigo_required' }, 400);
  }

  // M-3: rate limit — 30 requests/min per IP to prevent brute-force on
  // the YYMMDD-NNNN code space (~10 000 codes/day).
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? c.req.header('x-real-ip')
    ?? 'unknown';
  if (!checkRateLimit(`tracking:${ip}`, 30)) {
    return c.json({ error: 'rate_limit_exceeded' }, 429);
  }

  try {
    const rows = await sql<TrackingRow[]>`
      SELECT
        p.id,
        p.pedido_codigo,
        p.estado,
        p.tipo_despacho,
        p.items,
        p.subtotal,
        p.costo_envio,
        p.total,
        p.direccion,
        p.postal_code,
        p.tiempo_estimado,
        p.metodo_pago,
        p.notas,
        p.created_at,
        p.updated_at,
        r.datos_bancarios
      FROM   pedidos     p
      JOIN   restaurante r ON r.id = p.restaurante_id
      WHERE  p.pedido_codigo  = ${pedido_codigo}
        AND  p.restaurante_id = ${restaurante_id}
      LIMIT  1
    `;

    if (rows.length === 0) {
      return c.json({ error: 'not_found' }, 404);
    }

    const p = rows[0];

    const body: Record<string, unknown> = {
      pedido_codigo:   p.pedido_codigo,
      estado:          p.estado,
      tipo_despacho:   p.tipo_despacho,
      items:           p.items,
      subtotal:        parseFloat(p.subtotal),
      costo_envio:     parseFloat(p.costo_envio),
      total:           parseFloat(p.total),
      direccion:       p.direccion    ?? null,
      postal_code:     p.postal_code  ?? null,
      tiempo_estimado: p.tiempo_estimado,
      metodo_pago:     p.metodo_pago,
      notas:           p.notas ?? null,
      created_at:      p.created_at,
      updated_at:      p.updated_at,
    };

    // M-4: always include the key when metodo_pago is 'transferencia' so the
    // frontend can distinguish "bank details not configured" (null) from
    // "payment method is not transferencia" (key absent).
    if (p.metodo_pago === 'transferencia') {
      body.datos_transferencia = p.datos_bancarios ?? null;
    }

    return c.json(body, 200);

  } catch (err) {
    console.error('[GET /public/:slug/orders/:pedido_codigo] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Row types — DB
// ---------------------------------------------------------------------------

interface RestauranteOrderRow {
  zona_horaria: string;
  // postgres.js parses JSONB columns into JS values automatically.
  payment_methods: string[] | null;
}

interface DeliveryZoneRow {
  delivery_zone_id: number;
  fee: string;                    // postgres numeric → string
  min_order_amount: string | null;
  estimated_minutes_min: number | null;
  estimated_minutes_max: number | null;
  postal_code: string | null;
}

interface PedidoRow {
  id: number;
  pedido_codigo: string | null;
  estado: string;
  tipo_despacho: string;
  subtotal: string;    // postgres numeric → string
  costo_envio: string;
  total: string;
  metodo_pago: string;
  tiempo_estimado: string;
  postal_code: string | null;
  created_at: Date;
  usuario_id: number | null;
}

// ---------------------------------------------------------------------------
// Body types — input
// ---------------------------------------------------------------------------

interface TrackingRow {
  id: number;
  pedido_codigo: string;
  estado: string;
  tipo_despacho: string;
  items: unknown;
  subtotal: string;
  costo_envio: string;
  total: string;
  direccion: string | null;
  postal_code: string | null;
  tiempo_estimado: string;
  metodo_pago: string;
  notas: string | null;
  created_at: Date;
  updated_at: Date;
  datos_bancarios: unknown | null;
}

interface OrderExtraInput {
  extra_id: number;
  name: string;
  unit_price: number;
  quantity: number;
}

interface OrderItemInput {
  menu_variant_id: number;
  menu_item_id: number;
  item_name: string;
  variant_name: string;
  quantity: number;
  unit_price: number;
  extras?: OrderExtraInput[];
}

export default ordersRoutes;
