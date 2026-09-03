import { Hono } from 'hono';
import type { Variables } from '../../types.js';
import sql from '../../lib/db.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireAuth } from '../../middleware/auth.js';

const mesasRoutes = new Hono<{ Variables: Variables }>();

mesasRoutes.use('/:slug/*', resolveTenant, requireAuth);

// ─── Types ──────────────────────────────────────────────────────────────────

interface ZonaRow {
  id: number;
  nombre: string;
  orden: number;
  activa: boolean;
}

interface MesaRow {
  id: number;
  zona_id: number | null;
  zona_nombre: string | null;
  numero: number;
  nombre: string;
  capacidad: number | null;
  activa: boolean;
}

// ─── Zonas ──────────────────────────────────────────────────────────────────

// GET /:slug/mesas/zonas
mesasRoutes.get('/:slug/mesas/zonas', async (c) => {
  const rid = c.get('restaurante_id');
  const rows = await sql<ZonaRow[]>`
    SELECT id, nombre, orden, activa
    FROM public.zona_mesa
    WHERE restaurante_id = ${rid}
    ORDER BY orden, nombre
  `;
  return c.json(rows.map(r => ({
    zona_id:  r.id,
    nombre:   r.nombre,
    orden:    r.orden,
    activa:   r.activa,
  })));
});

// POST /:slug/mesas/zonas
mesasRoutes.post('/:slug/mesas/zonas', async (c) => {
  const rid = c.get('restaurante_id');
  const b = await c.req.json();
  const nombre = String(b.nombre ?? '').trim().slice(0, 80);
  if (!nombre) return c.json({ error: 'nombre requerido' }, 400);
  const orden = Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0;

  const [row] = await sql<ZonaRow[]>`
    INSERT INTO public.zona_mesa (restaurante_id, nombre, orden)
    VALUES (${rid}, ${nombre}, ${orden})
    ON CONFLICT (restaurante_id, nombre) DO NOTHING
    RETURNING id, nombre, orden, activa
  `;
  if (!row) return c.json({ error: 'ya existe una zona con ese nombre' }, 409);
  return c.json({ zona_id: row.id, nombre: row.nombre, orden: row.orden, activa: row.activa }, 201);
});

// PUT /:slug/mesas/zonas/:zona_id
mesasRoutes.put('/:slug/mesas/zonas/:zona_id', async (c) => {
  const rid = c.get('restaurante_id');
  const zonaId = Number(c.req.param('zona_id'));
  const b = await c.req.json();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (typeof b.nombre === 'string' && b.nombre.trim()) {
    fields.push('nombre'); values.push(b.nombre.trim().slice(0, 80));
  }
  if (Number.isFinite(Number(b.orden))) {
    fields.push('orden'); values.push(Number(b.orden));
  }
  if (typeof b.activa === 'boolean') {
    fields.push('activa'); values.push(b.activa);
  }
  if (!fields.length) return c.json({ error: 'sin cambios' }, 400);

  const obj: Record<string,unknown> = {};
  fields.forEach((f, i) => { obj[f] = values[i]; });
  const [row] = await sql<ZonaRow[]>`
    UPDATE public.zona_mesa
    SET ${sql(obj)}
    WHERE id = ${zonaId} AND restaurante_id = ${rid}
    RETURNING id, nombre, orden, activa
  `;
  if (!row) return c.json({ error: 'zona no encontrada' }, 404);
  return c.json({ zona_id: row.id, nombre: row.nombre, orden: row.orden, activa: row.activa });
});

// DELETE /:slug/mesas/zonas/:zona_id
mesasRoutes.delete('/:slug/mesas/zonas/:zona_id', async (c) => {
  const rid = c.get('restaurante_id');
  const zonaId = Number(c.req.param('zona_id'));
  await sql`
    UPDATE public.zona_mesa SET activa = false
    WHERE id = ${zonaId} AND restaurante_id = ${rid}
  `;
  return c.json({ ok: true });
});

// ─── Mesas ───────────────────────────────────────────────────────────────────

// GET /:slug/mesas  — lista con estado ocupado/libre (pedido activo + manual)
mesasRoutes.get('/:slug/mesas', async (c) => {
  const rid = c.get('restaurante_id');
  const rows = await sql<(MesaRow & { ocupada_manual: boolean; pedido_id: number | null; pedido_codigo: string | null })[]>`
    SELECT
      m.id, m.zona_id, z.nombre AS zona_nombre,
      m.numero, m.nombre, m.capacidad, m.activa,
      COALESCE(m.ocupada_manual, false) AS ocupada_manual,
      p.id        AS pedido_id,
      p.pedido_codigo
    FROM public.mesa m
    LEFT JOIN public.zona_mesa z ON z.id = m.zona_id
    LEFT JOIN LATERAL (
      SELECT id, pedido_codigo
      FROM public.pedidos
      WHERE mesa_id = m.id
        AND estado NOT IN ('entregado','cancelado')
      ORDER BY created_at DESC
      LIMIT 1
    ) p ON true
    WHERE m.restaurante_id = ${rid}
    ORDER BY z.orden NULLS LAST, z.nombre NULLS LAST, m.numero
  `;
  return c.json(rows.map(r => ({
    mesa_id:        r.id,
    zona_id:        r.zona_id,
    zona_nombre:    r.zona_nombre,
    numero:         r.numero,
    nombre:         r.nombre,
    capacidad:      r.capacidad,
    activa:         r.activa,
    ocupada:        r.pedido_id !== null || r.ocupada_manual,
    ocupada_manual: r.ocupada_manual,
    pedido_id:      r.pedido_id ?? null,
    pedido_codigo:  r.pedido_codigo ?? null,
  })));
});

// PATCH /:slug/mesas/:mesa_id/estado — cambiar estado manual (libre/ocupada)
// Si ocupada=false y la mesa tiene un pedido activo, lo desasocia (mesa_id = NULL)
mesasRoutes.patch('/:slug/mesas/:mesa_id/estado', async (c) => {
  const rid    = c.get('restaurante_id');
  const mesaId = Number(c.req.param('mesa_id'));
  const { ocupada } = await c.req.json<{ ocupada: boolean }>();
  if (typeof ocupada !== 'boolean') return c.json({ error: 'ocupada requerido (boolean)' }, 400);

  // Si liberamos la mesa, desasociar pedidos activos vinculados
  if (!ocupada) {
    await sql`
      UPDATE public.pedidos
      SET mesa_id = NULL
      WHERE mesa_id = ${mesaId}
        AND restaurante_id = ${rid}
        AND estado NOT IN ('entregado','cancelado')
    `;
  }

  const [row] = await sql<{ id: number; ocupada_manual: boolean }[]>`
    UPDATE public.mesa
    SET ocupada_manual = ${ocupada}
    WHERE id = ${mesaId} AND restaurante_id = ${rid}
    RETURNING id, ocupada_manual
  `;
  if (!row) return c.json({ error: 'no encontrado' }, 404);
  return c.json({ mesa_id: row.id, ocupada_manual: row.ocupada_manual });
});

// POST /:slug/mesas/:mesa_id/asociar-pedido — asociar pedido a mesa por código
mesasRoutes.post('/:slug/mesas/:mesa_id/asociar-pedido', async (c) => {
  const rid    = c.get('restaurante_id');
  const mesaId = Number(c.req.param('mesa_id'));
  const { pedido_codigo } = await c.req.json<{ pedido_codigo: string }>();
  if (!pedido_codigo?.trim()) return c.json({ error: 'pedido_codigo requerido' }, 400);

  const [pedido] = await sql<{ id: number; pedido_codigo: string }[]>`
    SELECT id, pedido_codigo FROM public.pedidos
    WHERE restaurante_id = ${rid}
      AND pedido_codigo = ${pedido_codigo.trim().toUpperCase()}
      AND estado NOT IN ('entregado','cancelado')
    LIMIT 1
  `;
  if (!pedido) return c.json({ error: 'Pedido no encontrado o ya cerrado' }, 404);

  await sql`
    UPDATE public.pedidos
    SET mesa_id = ${mesaId}, tipo_despacho = 'mesa'
    WHERE id = ${pedido.id}
  `;
  await sql`
    UPDATE public.mesa SET ocupada_manual = false
    WHERE id = ${mesaId} AND restaurante_id = ${rid}
  `;
  return c.json({ ok: true, pedido_id: pedido.id, pedido_codigo: pedido.pedido_codigo });
});

// POST /:slug/mesas
mesasRoutes.post('/:slug/mesas', async (c) => {
  const rid = c.get('restaurante_id');
  const b = await c.req.json();
  const nombre = String(b.nombre ?? '').trim().slice(0, 80);
  const numero = Number(b.numero);
  if (!nombre) return c.json({ error: 'nombre requerido' }, 400);
  if (!Number.isFinite(numero) || numero < 1) return c.json({ error: 'numero invalido' }, 400);
  const zonaId: number | null = Number.isFinite(Number(b.zona_id)) ? Number(b.zona_id) : null;
  const capacidad: number | null = Number.isFinite(Number(b.capacidad)) ? Number(b.capacidad) : null;

  const [row] = await sql<MesaRow[]>`
    INSERT INTO public.mesa (restaurante_id, zona_id, numero, nombre, capacidad)
    VALUES (${rid}, ${zonaId}, ${numero}, ${nombre}, ${capacidad})
    ON CONFLICT (restaurante_id, numero) DO NOTHING
    RETURNING id, zona_id, numero, nombre, capacidad, activa
  `;
  if (!row) return c.json({ error: 'ya existe una mesa con ese numero' }, 409);
  return c.json({ mesa_id: row.id, zona_id: row.zona_id, numero: row.numero, nombre: row.nombre, capacidad: row.capacidad, activa: row.activa }, 201);
});

// PUT /:slug/mesas/:mesa_id
mesasRoutes.put('/:slug/mesas/:mesa_id', async (c) => {
  const rid = c.get('restaurante_id');
  const mesaId = Number(c.req.param('mesa_id'));
  const b = await c.req.json();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (typeof b.nombre === 'string' && b.nombre.trim()) { fields.push('nombre'); values.push(b.nombre.trim().slice(0, 80)); }
  if (Number.isFinite(Number(b.numero))) { fields.push('numero'); values.push(Number(b.numero)); }
  if (typeof b.zona_id !== 'undefined') { fields.push('zona_id'); values.push(b.zona_id === null ? null : Number(b.zona_id)); }
  if (typeof b.capacidad !== 'undefined') { fields.push('capacidad'); values.push(b.capacidad === null ? null : Number(b.capacidad)); }
  if (typeof b.activa === 'boolean') { fields.push('activa'); values.push(b.activa); }
  if (!fields.length) return c.json({ error: 'sin cambios' }, 400);

  const obj: Record<string,unknown> = {};
  fields.forEach((f, i) => { obj[f] = values[i]; });
  const [row] = await sql<MesaRow[]>`
    UPDATE public.mesa
    SET ${sql(obj)}
    WHERE id = ${mesaId} AND restaurante_id = ${rid}
    RETURNING id, zona_id, numero, nombre, capacidad, activa
  `;
  if (!row) return c.json({ error: 'mesa no encontrada' }, 404);
  return c.json({ mesa_id: row.id, zona_id: row.zona_id, numero: row.numero, nombre: row.nombre, capacidad: row.capacidad, activa: row.activa });
});

// DELETE /:slug/mesas/:mesa_id  (desactivar)
mesasRoutes.delete('/:slug/mesas/:mesa_id', async (c) => {
  const rid = c.get('restaurante_id');
  const mesaId = Number(c.req.param('mesa_id'));
  await sql`UPDATE public.mesa SET activa = false WHERE id = ${mesaId} AND restaurante_id = ${rid}`;
  return c.json({ ok: true });
});

// ─── Asignar mesa a pedido ────────────────────────────────────────────────────

// POST /:slug/orders/:order_id/mesa
mesasRoutes.post('/:slug/orders/:order_id/mesa', async (c) => {
  const rid = c.get('restaurante_id');
  const orderId = Number(c.req.param('order_id'));
  const b = await c.req.json();
  const mesaId: number | null = b.mesa_id === null ? null : Number(b.mesa_id);

  const [row] = await sql<{ id: number; mesa_id: number | null }[]>`
    UPDATE public.pedidos
    SET mesa_id = ${mesaId}, tipo_despacho = CASE WHEN ${mesaId} IS NOT NULL THEN 'mesa' ELSE tipo_despacho END
    WHERE id = ${orderId} AND restaurante_id = ${rid}
    RETURNING id, mesa_id
  `;
  if (!row) return c.json({ error: 'pedido no encontrado' }, 404);
  return c.json({ ok: true, mesa_id: row.mesa_id });
});

export default mesasRoutes;
