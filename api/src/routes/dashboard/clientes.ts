import { Hono } from 'hono';
import type { Variables } from '../../types.js';
import sql from '../../lib/db.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireAuth } from '../../middleware/auth.js';

const clientesRoutes = new Hono<{ Variables: Variables }>();

clientesRoutes.use('/:slug/*', resolveTenant, requireAuth);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClienteRow {
  usuario_id:         number;
  telefono:           string;
  nombre:             string | null;
  direccion_frecuente: string | null;
  total_pedidos:      string;   // bigint → string from postgres.js
  total_gastado:      string;   // numeric → string
  ultimo_pedido:      Date | null;
  cliente_desde:      Date | null;
}

interface PedidoClienteRow {
  id:              number;
  pedido_codigo:   string | null;
  estado:          string;
  estado_pago:     string;
  tipo_despacho:   string | null;
  metodo_pago:     string | null;
  subtotal:        string;
  costo_envio:     string;
  total:           string;
  items_count:     string;
  direccion:       string | null;
  created_at:      Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapCliente(row: ClienteRow) {
  return {
    usuario_id:          Number(row.usuario_id),
    telefono:            row.telefono,
    nombre:              row.nombre ?? null,
    direccion_frecuente: row.direccion_frecuente ?? null,
    total_pedidos:       Number(row.total_pedidos),
    total_gastado:       parseFloat(row.total_gastado ?? '0'),
    ultimo_pedido:       row.ultimo_pedido ? row.ultimo_pedido.toISOString() : null,
    cliente_desde:       row.cliente_desde ? row.cliente_desde.toISOString() : null,
  };
}

function mapPedidoCliente(row: PedidoClienteRow) {
  return {
    id:            row.id,
    pedido_codigo: row.pedido_codigo ?? null,
    estado:        row.estado,
    estado_pago:   row.estado_pago,
    tipo_despacho: row.tipo_despacho ?? null,
    metodo_pago:   row.metodo_pago ?? null,
    subtotal:      parseFloat(row.subtotal ?? '0'),
    costo_envio:   parseFloat(row.costo_envio ?? '0'),
    total:         parseFloat(row.total ?? '0'),
    items_count:   Number(row.items_count ?? 0),
    direccion:     row.direccion ?? null,
    created_at:    row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

// ─── GET /dashboard/:slug/clientes ───────────────────────────────────────────
//
// Returns a paginated list of customers for the tenant with order statistics.
// Query params: page (default 1), q (search by name or phone)
// ---------------------------------------------------------------------------

clientesRoutes.get('/:slug/clientes', async (c) => {
  const restaurante_id = c.get('restaurante_id');

  const page   = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit  = 40;
  const offset = (page - 1) * limit;
  const q      = (c.req.query('q') ?? '').trim();

  try {
    // Total count for pagination
    const countRows = await sql<{ total: string }[]>`
      SELECT COUNT(DISTINCT u.id) AS total
      FROM usuarios u
      WHERE u.restaurante_id = ${restaurante_id}
        ${q ? sql`AND (
          lower(u.nombre)   LIKE ${'%' + q.toLowerCase() + '%'}
          OR u.telefono     LIKE ${'%' + q + '%'}
        )` : sql``}
    `;
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await sql<ClienteRow[]>`
      SELECT
        u.id                                                         AS usuario_id,
        u.telefono,
        u.nombre,
        u.direccion_frecuente,
        COUNT(p.id)                                                  AS total_pedidos,
        COALESCE(SUM(
          CASE WHEN p.estado NOT IN ('cancelado', 'en_curso') THEN p.total ELSE 0 END
        ), 0)                                                        AS total_gastado,
        MAX(p.created_at)                                            AS ultimo_pedido,
        u.created_at                                                 AS cliente_desde
      FROM usuarios u
      LEFT JOIN pedidos p
        ON  p.telefono      = u.telefono
        AND p.restaurante_id = ${restaurante_id}
      WHERE u.restaurante_id = ${restaurante_id}
        ${q ? sql`AND (
          lower(u.nombre)   LIKE ${'%' + q.toLowerCase() + '%'}
          OR u.telefono     LIKE ${'%' + q + '%'}
        )` : sql``}
      GROUP BY u.id, u.telefono, u.nombre, u.direccion_frecuente, u.created_at
      ORDER BY MAX(p.created_at) DESC NULLS LAST, u.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return c.json({
      clientes: rows.map(mapCliente),
      total,
      page,
      pages: Math.ceil(total / limit),
    });

  } catch (err) {
    console.error('[GET /dashboard/:slug/clientes] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

// ─── GET /dashboard/:slug/clientes/:telefono ──────────────────────────────────
//
// Returns a single customer with their full order history (last 50 orders).
// ---------------------------------------------------------------------------

clientesRoutes.get('/:slug/clientes/:telefono', async (c) => {
  const restaurante_id = c.get('restaurante_id');
  const telefono       = decodeURIComponent(c.req.param('telefono'));

  if (!telefono) {
    return c.json({ error: 'telefono_required' }, 400);
  }

  try {
    // Customer record
    const userRows = await sql<ClienteRow[]>`
      SELECT
        u.id                AS usuario_id,
        u.telefono,
        u.nombre,
        u.direccion_frecuente,
        COUNT(p.id)         AS total_pedidos,
        COALESCE(SUM(
          CASE WHEN p.estado NOT IN ('cancelado', 'en_curso') THEN p.total ELSE 0 END
        ), 0)               AS total_gastado,
        MAX(p.created_at)   AS ultimo_pedido,
        u.created_at        AS cliente_desde
      FROM usuarios u
      LEFT JOIN pedidos p
        ON  p.telefono      = u.telefono
        AND p.restaurante_id = ${restaurante_id}
      WHERE u.restaurante_id = ${restaurante_id}
        AND u.telefono       = ${telefono}
      GROUP BY u.id, u.telefono, u.nombre, u.direccion_frecuente, u.created_at
      LIMIT 1
    `;

    if (userRows.length === 0) {
      return c.json({ error: 'cliente_not_found' }, 404);
    }

    // Order history
    const pedidoRows = await sql<PedidoClienteRow[]>`
      SELECT
        p.id,
        p.pedido_codigo,
        p.estado,
        p.estado_pago,
        p.tipo_despacho,
        p.metodo_pago,
        p.subtotal,
        COALESCE(p.costo_envio, 0)   AS costo_envio,
        p.total,
        jsonb_array_length(COALESCE(p.items, '[]'::jsonb)) AS items_count,
        p.direccion,
        p.created_at
      FROM pedidos p
      WHERE p.telefono      = ${telefono}
        AND p.restaurante_id = ${restaurante_id}
        AND p.estado        != 'en_curso'
      ORDER BY p.created_at DESC
      LIMIT 50
    `;

    return c.json({
      cliente: mapCliente(userRows[0]!),
      pedidos: pedidoRows.map(mapPedidoCliente),
    });

  } catch (err) {
    console.error('[GET /dashboard/:slug/clientes/:telefono] Unhandled error:', err);
    return c.json({ error: 'service_unavailable' }, 503);
  }
});

export default clientesRoutes;
