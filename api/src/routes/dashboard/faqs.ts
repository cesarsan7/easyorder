import { Hono } from 'hono';
import type { Variables } from '../../types.js';
import sql from '../../lib/db.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireAuth } from '../../middleware/auth.js';

const faqsRoutes = new Hono<{ Variables: Variables }>();

faqsRoutes.use('/:slug/*', resolveTenant, requireAuth);

interface FaqRow {
  id: number;
  pregunta: string;
  respuesta: string;
  orden: number;
}

// GET /dashboard/:slug/faqs
faqsRoutes.get('/:slug/faqs', async (c) => {
  const rid = c.get('restaurante_id');
  const rows = await sql<FaqRow[]>`
    SELECT id, pregunta, respuesta, orden
    FROM public.faqs
    WHERE restaurante_id = ${rid}
    ORDER BY orden ASC, id ASC
  `;
  return c.json(rows);
});

// POST /dashboard/:slug/faqs
faqsRoutes.post('/:slug/faqs', async (c) => {
  const rid = c.get('restaurante_id');
  const body = await c.req.json<{ pregunta: string; respuesta: string; orden?: number }>();
  if (!body.pregunta?.trim() || !body.respuesta?.trim()) {
    return c.json({ error: 'pregunta y respuesta son requeridas' }, 400);
  }
  const [row] = await sql<FaqRow[]>`
    INSERT INTO public.faqs (restaurante_id, pregunta, respuesta, orden)
    VALUES (${rid}, ${body.pregunta.trim()}, ${body.respuesta.trim()}, ${body.orden ?? 0})
    RETURNING id, pregunta, respuesta, orden
  `;
  return c.json(row, 201);
});

// PUT /dashboard/:slug/faqs/:id
faqsRoutes.put('/:slug/faqs/:id', async (c) => {
  const rid = c.get('restaurante_id');
  const id  = Number(c.req.param('id'));
  const body = await c.req.json<{ pregunta?: string; respuesta?: string; orden?: number }>();

  const obj: Record<string, unknown> = {};
  if (body.pregunta  !== undefined) obj['pregunta']  = body.pregunta.trim();
  if (body.respuesta !== undefined) obj['respuesta'] = body.respuesta.trim();
  if (body.orden     !== undefined) obj['orden']     = body.orden;

  if (Object.keys(obj).length === 0) return c.json({ error: 'nada que actualizar' }, 400);

  const [row] = await sql<FaqRow[]>`
    UPDATE public.faqs SET ${sql(obj)}
    WHERE id = ${id} AND restaurante_id = ${rid}
    RETURNING id, pregunta, respuesta, orden
  `;
  if (!row) return c.json({ error: 'no encontrado' }, 404);
  return c.json(row);
});

// DELETE /dashboard/:slug/faqs/:id
faqsRoutes.delete('/:slug/faqs/:id', async (c) => {
  const rid = c.get('restaurante_id');
  const id  = Number(c.req.param('id'));
  const [row] = await sql<{ id: number }[]>`
    DELETE FROM public.faqs
    WHERE id = ${id} AND restaurante_id = ${rid}
    RETURNING id
  `;
  if (!row) return c.json({ error: 'no encontrado' }, 404);
  return c.json({ ok: true });
});

export default faqsRoutes;
