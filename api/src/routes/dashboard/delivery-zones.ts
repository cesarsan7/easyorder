import { Hono } from 'hono';
import type { Variables } from '../../types.js';
import sql from '../../lib/db.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireAuth } from '../../middleware/auth.js';

const deliveryZonesRoutes = new Hono<{ Variables: Variables }>();

deliveryZonesRoutes.use('/:slug/*', resolveTenant, requireAuth);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeliveryZoneRow {
  delivery_zone_id:      string;
  zone_name:             string;
  postal_code:           string | null;   // nullable since M-16
  fee:                   string;
  min_order_amount:      string;
  estimated_minutes_min: number | null;
  estimated_minutes_max: number | null;
  is_active:             boolean;
  restaurante_id:        number;
  lat_center:            string | null;   // added in M-16
  lng_center:            string | null;
  radius_km:             string | null;
}

function mapZone(row: DeliveryZoneRow) {
  return {
    delivery_zone_id:      Number(row.delivery_zone_id),
    zone_name:             row.zone_name,
    postal_code:           row.postal_code ?? null,
    fee:                   Number(row.fee),
    min_order_amount:      Number(row.min_order_amount),
    estimated_minutes_min: row.estimated_minutes_min,
    estimated_minutes_max: row.estimated_minutes_max,
    is_active:             row.is_active,
    lat_center:            row.lat_center != null ? Number(row.lat_center) : null,
    lng_center:            row.lng_center != null ? Number(row.lng_center) : null,
    radius_km:             row.radius_km  != null ? Number(row.radius_km)  : null,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err &&
    (err as { code: string }).code === '23505';
}

function validateGeoFields(b: Record<string, unknown>): {
  lat_center?: number | null;
  lng_center?: number | null;
  radius_km?: number | null;
  error?: { field: string; detail: string };
} {
  const out: { lat_center?: number | null; lng_center?: number | null; radius_km?: number | null } = {};
  if ('lat_center' in b) {
    const v = b['lat_center'];
    if (v === null) { out.lat_center = null; }
    else if (typeof v !== 'number' || v < -90 || v > 90) {
      return { error: { field: 'lat_center', detail: 'must be a number between -90 and 90, or null' } };
    } else { out.lat_center = v; }
  }
  if ('lng_center' in b) {
    const v = b['lng_center'];
    if (v === null) { out.lng_center = null; }
    else if (typeof v !== 'number' || v < -180 || v > 180) {
      return { error: { field: 'lng_center', detail: 'must be a number between -180 and 180, or null' } };
    } else { out.lng_center = v; }
  }
  if ('radius_km' in b) {
    const v = b['radius_km'];
    if (v === null) { out.radius_km = null; }
    else if (typeof v !== 'number' || v <= 0 || v > 500) {
      return { error: { field: 'radius_km', detail: 'must be a positive number <= 500, or null' } };
    } else { out.radius_km = v; }
  }
  return out;
}

// Tolerant SELECT: falls back without M-16 columns if migration not applied yet
async function listZones(restaurante_id: number): Promise<DeliveryZoneRow[]> {
  try {
    return await sql<DeliveryZoneRow[]>`
      SELECT delivery_zone_id, zone_name, postal_code, fee, min_order_amount,
             estimated_minutes_min, estimated_minutes_max, is_active, restaurante_id,
             lat_center, lng_center, radius_km
      FROM delivery_zone
      WHERE restaurante_id = ${restaurante_id}
      ORDER BY zone_name ASC
    `;
  } catch {
    const rows = await sql<Omit<DeliveryZoneRow, 'lat_center'|'lng_center'|'radius_km'>[]>`
      SELECT delivery_zone_id, zone_name, postal_code, fee, min_order_amount,
             estimated_minutes_min, estimated_minutes_max, is_active, restaurante_id
      FROM delivery_zone
      WHERE restaurante_id = ${restaurante_id}
      ORDER BY zone_name ASC
    `;
    return rows.map(r => ({ ...r, lat_center: null, lng_center: null, radius_km: null }));
  }
}

// ---------------------------------------------------------------------------
// GET (both legacy and canonical paths)
// ---------------------------------------------------------------------------
deliveryZonesRoutes.get('/:slug/delivery-zones', async (c) => {
  try {
    return c.json({ zones: (await listZones(c.get('restaurante_id'))).map(mapZone) });
  } catch (err) {
    console.error('[GET delivery-zones]', (err as Error).message);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

deliveryZonesRoutes.get('/:slug/delivery/zones', async (c) => {
  try {
    return c.json({ zones: (await listZones(c.get('restaurante_id'))).map(mapZone) });
  } catch (err) {
    console.error('[GET delivery/zones]', (err as Error).message);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ---------------------------------------------------------------------------
// POST — create zone
// Body: { name, postal_code?, delivery_fee, min_order_amount,
//         estimated_minutes_min?, estimated_minutes_max?, is_active,
//         lat_center?, lng_center?, radius_km? }
// Since M-16: postal_code is optional when lat+lng+radius are all provided.
// ---------------------------------------------------------------------------
async function createZone(c: { req: { json: () => Promise<unknown> }; get: (k: string) => number; json: (body: unknown, status?: number) => Response }) {
  const restaurante_id = (c as unknown as { get(k: 'restaurante_id'): number }).get('restaurante_id');
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }
  const b = body as Record<string, unknown>;

  if (typeof b['name'] !== 'string' || b['name'].trim() === '') {
    return c.json({ error: 'name_required', detail: 'name must be a non-empty string' }, 400);
  }
  const zone_name = b['name'].trim();

  let postal_code: string | null = null;
  if (b['postal_code'] != null) {
    if (typeof b['postal_code'] !== 'string' || b['postal_code'].trim() === '') {
      return c.json({ error: 'postal_code_invalid', detail: 'postal_code must be a non-empty string' }, 400);
    }
    const pc = b['postal_code'].trim();
    if (pc.length > 10) return c.json({ error: 'postal_code_too_long', detail: 'max 10 chars' }, 400);
    postal_code = pc;
  }

  const geo = validateGeoFields(b);
  if (geo.error) return c.json({ error: 'invalid_field', field: geo.error.field, detail: geo.error.detail }, 400);
  const lat_center = geo.lat_center ?? null;
  const lng_center = geo.lng_center ?? null;
  const radius_km  = geo.radius_km  ?? null;

  const hasGeo = lat_center !== null && lng_center !== null && radius_km !== null;
  if (!postal_code && !hasGeo) {
    return c.json({ error: 'geo_or_postal_required', detail: 'Provide postal_code, or lat_center + lng_center + radius_km' }, 400);
  }

  if (typeof b['delivery_fee'] !== 'number' || b['delivery_fee'] < 0) {
    return c.json({ error: 'delivery_fee_required', detail: 'must be a non-negative number' }, 400);
  }
  const fee = b['delivery_fee'] as number;

  if (typeof b['min_order_amount'] !== 'number' || b['min_order_amount'] < 0) {
    return c.json({ error: 'min_order_amount_required', detail: 'must be a non-negative number' }, 400);
  }
  const min_order_amount = b['min_order_amount'] as number;

  let estimated_minutes_min: number | null = null;
  let estimated_minutes_max: number | null = null;
  if (b['estimated_minutes_min'] != null) {
    if (typeof b['estimated_minutes_min'] !== 'number' || b['estimated_minutes_min'] < 0)
      return c.json({ error: 'estimated_minutes_min_invalid' }, 400);
    estimated_minutes_min = b['estimated_minutes_min'] as number;
  }
  if (b['estimated_minutes_max'] != null) {
    if (typeof b['estimated_minutes_max'] !== 'number' || b['estimated_minutes_max'] < 0)
      return c.json({ error: 'estimated_minutes_max_invalid' }, 400);
    estimated_minutes_max = b['estimated_minutes_max'] as number;
  }
  if (estimated_minutes_min !== null && estimated_minutes_max !== null && estimated_minutes_min > estimated_minutes_max)
    return c.json({ error: 'estimated_minutes_range_invalid', detail: 'min must be <= max' }, 400);

  if (typeof b['is_active'] !== 'boolean')
    return c.json({ error: 'is_active_required', detail: 'is_active must be a boolean' }, 400);
  const is_active = b['is_active'] as boolean;

  try {
    const [zone] = await sql<DeliveryZoneRow[]>`
      INSERT INTO delivery_zone
        (zone_name, postal_code, fee, min_order_amount,
         estimated_minutes_min, estimated_minutes_max, is_active, restaurante_id,
         lat_center, lng_center, radius_km)
      VALUES
        (${zone_name}, ${postal_code}, ${fee}, ${min_order_amount},
         ${estimated_minutes_min}, ${estimated_minutes_max}, ${is_active}, ${restaurante_id},
         ${lat_center}, ${lng_center}, ${radius_km})
      RETURNING
        delivery_zone_id, zone_name, postal_code, fee, min_order_amount,
        estimated_minutes_min, estimated_minutes_max, is_active, restaurante_id,
        lat_center, lng_center, radius_km
    `;
    return c.json(mapZone(zone), 201);
  } catch (err) {
    if (isUniqueViolation(err))
      return c.json({ error: 'zone_conflict', detail: 'A zone with that postal code already exists' }, 409);
    console.error('[POST delivery/zones]', (err as Error).message);
    return c.json({ error: 'service_unavailable' }, 503);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
deliveryZonesRoutes.post('/:slug/delivery-zones', createZone as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
deliveryZonesRoutes.post('/:slug/delivery/zones',  createZone as any);

// ---------------------------------------------------------------------------
// PATCH — update zone
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function patchZone(c: any) {
  const restaurante_id = c.get('restaurante_id') as number;
  const zone_id        = Number(c.req.param('zone_id'));
  if (!Number.isInteger(zone_id) || zone_id <= 0) return c.json({ error: 'invalid_zone_id' }, 400);

  try {
    const [existing] = await sql<{ delivery_zone_id: string }[]>`
      SELECT delivery_zone_id FROM delivery_zone
      WHERE delivery_zone_id = ${zone_id} AND restaurante_id = ${restaurante_id}
    `;
    if (!existing) return c.json({ error: 'not_found' }, 404);

    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }
    const b = body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if ('name' in b) {
      if (typeof b['name'] !== 'string' || b['name'].trim() === '')
        return c.json({ error: 'name_invalid' }, 400);
      updates['zone_name'] = b['name'].trim();
    }
    if ('postal_code' in b) {
      const pc = b['postal_code'];
      if (pc === null) { updates['postal_code'] = null; }
      else if (typeof pc !== 'string' || pc.trim() === '') return c.json({ error: 'postal_code_invalid' }, 400);
      else { if (pc.trim().length > 10) return c.json({ error: 'postal_code_too_long' }, 400); updates['postal_code'] = pc.trim(); }
    }
    if ('delivery_fee' in b) {
      if (typeof b['delivery_fee'] !== 'number' || b['delivery_fee'] < 0) return c.json({ error: 'delivery_fee_invalid' }, 400);
      updates['fee'] = b['delivery_fee'];
    }
    if ('min_order_amount' in b) {
      if (typeof b['min_order_amount'] !== 'number' || b['min_order_amount'] < 0) return c.json({ error: 'min_order_amount_invalid' }, 400);
      updates['min_order_amount'] = b['min_order_amount'];
    }
    if ('estimated_minutes_min' in b) {
      const em = b['estimated_minutes_min'];
      if (em !== null && (typeof em !== 'number' || (em as number) < 0)) return c.json({ error: 'estimated_minutes_min_invalid' }, 400);
      updates['estimated_minutes_min'] = em;
    }
    if ('estimated_minutes_max' in b) {
      const em = b['estimated_minutes_max'];
      if (em !== null && (typeof em !== 'number' || (em as number) < 0)) return c.json({ error: 'estimated_minutes_max_invalid' }, 400);
      updates['estimated_minutes_max'] = em;
    }
    if ('is_active' in b) {
      if (typeof b['is_active'] !== 'boolean') return c.json({ error: 'is_active_invalid' }, 400);
      updates['is_active'] = b['is_active'];
    }

    const geo = validateGeoFields(b);
    if (geo.error) return c.json({ error: 'invalid_field', field: geo.error.field, detail: geo.error.detail }, 400);
    if ('lat_center' in b) updates['lat_center'] = geo.lat_center ?? null;
    if ('lng_center' in b) updates['lng_center'] = geo.lng_center ?? null;
    if ('radius_km'  in b) updates['radius_km']  = geo.radius_km  ?? null;

    if (Object.keys(updates).length === 0) return c.json({ error: 'no_fields_to_update' }, 400);

    const [zone] = await sql<DeliveryZoneRow[]>`
      UPDATE delivery_zone SET ${sql(updates)}
      WHERE delivery_zone_id = ${zone_id} AND restaurante_id = ${restaurante_id}
      RETURNING
        delivery_zone_id, zone_name, postal_code, fee, min_order_amount,
        estimated_minutes_min, estimated_minutes_max, is_active, restaurante_id,
        lat_center, lng_center, radius_km
    `;
    if (!zone) return c.json({ error: 'not_found' }, 404);
    return c.json(mapZone(zone), 200);
  } catch (err) {
    if (isUniqueViolation(err)) return c.json({ error: 'zone_conflict' }, 409);
    console.error('[PATCH delivery/zones]', (err as Error).message);
    return c.json({ error: 'service_unavailable' }, 503);
  }
}

deliveryZonesRoutes.patch('/:slug/delivery-zones/:zone_id', patchZone);
deliveryZonesRoutes.patch('/:slug/delivery/zones/:zone_id',  patchZone);

// ---------------------------------------------------------------------------
// DELETE — hard delete
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteZone(c: any) {
  const restaurante_id = c.get('restaurante_id') as number;
  const zone_id        = Number(c.req.param('zone_id'));
  if (!Number.isInteger(zone_id) || zone_id <= 0) return c.json({ error: 'invalid_zone_id' }, 400);

  try {
    const [zone] = await sql<{ delivery_zone_id: string }[]>`
      DELETE FROM delivery_zone
      WHERE delivery_zone_id = ${zone_id} AND restaurante_id = ${restaurante_id}
      RETURNING delivery_zone_id
    `;
    if (!zone) return c.json({ error: 'not_found' }, 404);
    return c.json({ deleted: true, delivery_zone_id: Number(zone.delivery_zone_id) }, 200);
  } catch (err) {
    console.error('[DELETE delivery/zones]', (err as Error).message);
    return c.json({ error: 'service_unavailable' }, 503);
  }
}

deliveryZonesRoutes.delete('/:slug/delivery-zones/:zone_id', deleteZone);
deliveryZonesRoutes.delete('/:slug/delivery/zones/:zone_id',  deleteZone);

export default deliveryZonesRoutes;
