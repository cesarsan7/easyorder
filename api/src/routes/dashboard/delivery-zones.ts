import { Hono } from 'hono';
import type { Variables } from '../../types.js';
import sql from '../../lib/db.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireAuth } from '../../middleware/auth.js';

const deliveryZonesRoutes = new Hono<{ Variables: Variables }>();

deliveryZonesRoutes.use('/:slug/*', resolveTenant, requireAuth);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DeliveryZoneRow {
  delivery_zone_id:      string;
  zone_name:             string;
  postal_code:           string;
  fee:                   string;
  min_order_amount:      string;
  estimated_minutes_min: number | null;
  estimated_minutes_max: number | null;
  is_active:             boolean;
  restaurante_id:        number;
}

function mapZone(row: DeliveryZoneRow) {
  return {
    delivery_zone_id:      Number(row.delivery_zone_id),
    zone_name:             row.zone_name,
    postal_code:           row.postal_code,
    fee:                   Number(row.fee),
    min_order_amount:      Number(row.min_order_amount),
    estimated_minutes_min: row.estimated_minutes_min,
    estimated_minutes_max: row.estimated_minutes_max,
    is_active:             row.is_active,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}

// ---------------------------------------------------------------------------
// GET /dashboard/:slug/delivery/zones
// ---------------------------------------------------------------------------
deliveryZonesRoutes.get('/:slug/delivery/zones', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  try {
    const zones = await sql<DeliveryZoneRow[]>`
      SELECT delivery_zone_id, zone_name, postal_code, fee, min_order_amount,
             estimated_minutes_min, estimated_minutes_max, is_active, restaurante_id
      FROM delivery_zone
      WHERE restaurante_id = ${restaurante_id}
        AND is_active = true
      ORDER BY zone_name ASC
    `;

    return c.json({ zones: zones.map(mapZone) });

  } catch (err) {
    console.error('[GET /dashboard/:slug/delivery/zones]', (err as Error).message);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// POST /dashboard/:slug/delivery/zones
//
// Body: { name, postal_code, min_order_amount, delivery_fee,
//         estimated_minutes_min, estimated_minutes_max, is_active }
//
// postal_code is required because n8n's Despacho subflujo searches delivery
// zones by postal_code. Inserting zone_name in that column would silently
// break zone lookup for WhatsApp orders.
// ---------------------------------------------------------------------------
deliveryZonesRoutes.post('/:slug/delivery/zones', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const b = body as Record<string, unknown>;

  // --- name (→ zone_name) ---------------------------------------------------
  if (typeof b['name'] !== 'string' || b['name'].trim() === '') {
    return c.json({ error: 'name_required', detail: 'name must be a non-empty string' }, 400);
  }
  const zone_name = b['name'].trim();

  // --- postal_code ----------------------------------------------------------
  if (typeof b['postal_code'] !== 'string' || b['postal_code'].trim() === '') {
    return c.json({ error: 'postal_code_required', detail: 'postal_code must be a non-empty string (max 10 chars)' }, 400);
  }
  const postal_code = b['postal_code'].trim();
  if (postal_code.length > 10) {
    return c.json({ error: 'postal_code_too_long', detail: 'postal_code must be 10 characters or fewer' }, 400);
  }

  // --- delivery_fee (→ fee) -------------------------------------------------
  if (typeof b['delivery_fee'] !== 'number' || b['delivery_fee'] < 0) {
    return c.json({ error: 'delivery_fee_required', detail: 'delivery_fee must be a non-negative number' }, 400);
  }
  const fee = b['delivery_fee'] as number;

  // --- min_order_amount ------------------------------------------------------
  if (typeof b['min_order_amount'] !== 'number' || b['min_order_amount'] < 0) {
    return c.json({ error: 'min_order_amount_required', detail: 'min_order_amount must be a non-negative number' }, 400);
  }
  const min_order_amount = b['min_order_amount'] as number;

  // --- estimated_minutes_min / estimated_minutes_max (optional) --------------
  let estimated_minutes_min: number | null = null;
  let estimated_minutes_max: number | null = null;

  if (b['estimated_minutes_min'] !== undefined && b['estimated_minutes_min'] !== null) {
    if (typeof b['estimated_minutes_min'] !== 'number' || b['estimated_minutes_min'] < 0) {
      return c.json({ error: 'estimated_minutes_min_invalid', detail: 'estimated_minutes_min must be a non-negative number' }, 400);
    }
    estimated_minutes_min = b['estimated_minutes_min'] as number;
  }

  if (b['estimated_minutes_max'] !== undefined && b['estimated_minutes_max'] !== null) {
    if (typeof b['estimated_minutes_max'] !== 'number' || b['estimated_minutes_max'] < 0) {
      return c.json({ error: 'estimated_minutes_max_invalid', detail: 'estimated_minutes_max must be a non-negative number' }, 400);
    }
    estimated_minutes_max = b['estimated_minutes_max'] as number;
  }

  if (
    estimated_minutes_min !== null &&
    estimated_minutes_max !== null &&
    estimated_minutes_min > estimated_minutes_max
  ) {
    return c.json({ error: 'estimated_minutes_range_invalid', detail: 'estimated_minutes_min must be <= estimated_minutes_max' }, 400);
  }

  // --- is_active -------------------------------------------------------------
  if (typeof b['is_active'] !== 'boolean') {
    return c.json({ error: 'is_active_required', detail: 'is_active must be a boolean' }, 400);
  }
  const is_active = b['is_active'] as boolean;

  try {
    const [zone] = await sql<DeliveryZoneRow[]>`
      INSERT INTO delivery_zone
        (zone_name, postal_code, fee, min_order_amount,
         estimated_minutes_min, estimated_minutes_max, is_active, restaurante_id)
      VALUES
        (${zone_name}, ${postal_code}, ${fee}, ${min_order_amount},
         ${estimated_minutes_min}, ${estimated_minutes_max}, ${is_active}, ${restaurante_id})
      RETURNING
        delivery_zone_id, zone_name, postal_code, fee, min_order_amount,
        estimated_minutes_min, estimated_minutes_max, is_active, restaurante_id
    `;

    return c.json(mapZone(zone), 201);

  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json(
        { error: 'zone_conflict', detail: `A delivery zone with that name or postal code already exists for this restaurant` },
        409,
      );
    }
    console.error('[POST /dashboard/:slug/delivery/zones]', (err as Error).message);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// PATCH /dashboard/:slug/delivery/zones/:zone_id
//
// Partially updates a delivery zone. Only fields present in the body are
// updated. Ownership is verified with a SELECT before any write.
// ---------------------------------------------------------------------------
deliveryZonesRoutes.patch('/:slug/delivery/zones/:zone_id', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const zone_id        = Number(c.req.param('zone_id'));

  if (!Number.isInteger(zone_id) || zone_id <= 0) {
    return c.json({ error: 'invalid_zone_id' }, 400);
  }

  try {
    // Verify ownership before reading or writing anything.
    const [existing] = await sql<DeliveryZoneRow[]>`
      SELECT delivery_zone_id
      FROM delivery_zone
      WHERE delivery_zone_id = ${zone_id}
        AND restaurante_id   = ${restaurante_id}
    `;

    if (!existing) {
      return c.json({ error: 'not_found' }, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_body' }, 400);
    }

    const b = body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if ('name' in b) {
      if (typeof b['name'] !== 'string' || b['name'].trim() === '') {
        return c.json({ error: 'name_invalid', detail: 'name must be a non-empty string' }, 400);
      }
      updates['zone_name'] = b['name'].trim();
    }

    if ('postal_code' in b) {
      if (typeof b['postal_code'] !== 'string' || b['postal_code'].trim() === '') {
        return c.json({ error: 'postal_code_invalid', detail: 'postal_code must be a non-empty string' }, 400);
      }
      const pc = b['postal_code'].trim();
      if (pc.length > 10) {
        return c.json({ error: 'postal_code_too_long', detail: 'postal_code must be 10 characters or fewer' }, 400);
      }
      updates['postal_code'] = pc;
    }

    if ('delivery_fee' in b) {
      if (typeof b['delivery_fee'] !== 'number' || b['delivery_fee'] < 0) {
        return c.json({ error: 'delivery_fee_invalid', detail: 'delivery_fee must be a non-negative number' }, 400);
      }
      updates['fee'] = b['delivery_fee'];
    }

    if ('min_order_amount' in b) {
      if (typeof b['min_order_amount'] !== 'number' || b['min_order_amount'] < 0) {
        return c.json({ error: 'min_order_amount_invalid', detail: 'min_order_amount must be a non-negative number' }, 400);
      }
      updates['min_order_amount'] = b['min_order_amount'];
    }

    if ('estimated_minutes_min' in b) {
      const em = b['estimated_minutes_min'];
      if (em !== null && (typeof em !== 'number' || (em as number) < 0)) {
        return c.json({ error: 'estimated_minutes_min_invalid', detail: 'estimated_minutes_min must be a non-negative number or null' }, 400);
      }
      updates['estimated_minutes_min'] = em as number | null;
    }

    if ('estimated_minutes_max' in b) {
      const em = b['estimated_minutes_max'];
      if (em !== null && (typeof em !== 'number' || (em as number) < 0)) {
        return c.json({ error: 'estimated_minutes_max_invalid', detail: 'estimated_minutes_max must be a non-negative number or null' }, 400);
      }
      updates['estimated_minutes_max'] = em as number | null;
    }

    if ('is_active' in b) {
      if (typeof b['is_active'] !== 'boolean') {
        return c.json({ error: 'is_active_invalid', detail: 'is_active must be a boolean' }, 400);
      }
      updates['is_active'] = b['is_active'];
    }

    if (Object.keys(updates).length === 0) {
      return c.json(
        { error: 'no_fields_to_update', detail: 'Provide at least one of: name, postal_code, delivery_fee, min_order_amount, estimated_minutes_min, estimated_minutes_max, is_active' },
        400,
      );
    }

    const [zone] = await sql<DeliveryZoneRow[]>`
      UPDATE delivery_zone
      SET ${sql(updates)}
      WHERE delivery_zone_id = ${zone_id}
        AND restaurante_id   = ${restaurante_id}
      RETURNING
        delivery_zone_id, zone_name, postal_code, fee, min_order_amount,
        estimated_minutes_min, estimated_minutes_max, is_active, restaurante_id
    `;

    // Defensive check: handles the race condition where the zone was
    // soft-deleted between the ownership SELECT and this UPDATE.
    if (!zone) {
      return c.json({ error: 'not_found' }, 404);
    }

    return c.json(mapZone(zone), 200);

  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json(
        { error: 'zone_conflict', detail: 'A delivery zone with that name or postal code already exists for this restaurant' },
        409,
      );
    }
    console.error('[PATCH /dashboard/:slug/delivery/zones/:zone_id]', (err as Error).message);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// DELETE /dashboard/:slug/delivery/zones/:zone_id
//
// Soft-delete: sets is_active = false. Tenant ownership enforced by WHERE.
// ---------------------------------------------------------------------------
deliveryZonesRoutes.delete('/:slug/delivery/zones/:zone_id', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const zone_id        = Number(c.req.param('zone_id'));

  if (!Number.isInteger(zone_id) || zone_id <= 0) {
    return c.json({ error: 'invalid_zone_id' }, 400);
  }

  try {
    const [zone] = await sql<DeliveryZoneRow[]>`
      UPDATE delivery_zone
      SET is_active = false
      WHERE delivery_zone_id = ${zone_id}
        AND restaurante_id   = ${restaurante_id}
      RETURNING
        delivery_zone_id, zone_name, postal_code, fee, min_order_amount,
        estimated_minutes_min, estimated_minutes_max, is_active, restaurante_id
    `;

    if (!zone) {
      return c.json({ error: 'not_found' }, 404);
    }

    return c.json(mapZone(zone), 200);

  } catch (err) {
    console.error('[DELETE /dashboard/:slug/delivery/zones/:zone_id]', (err as Error).message);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

export default deliveryZonesRoutes;
