import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import publicRoutes from './routes/public.js';
import ordersRoutes from './routes/orders.js';
import dashboardRoutes from './routes/dashboard.js';
import menuCategoriesRoutes from './routes/dashboard/menu-categories.js';
import menuItemsRoutes from './routes/dashboard/menu-items.js';
import menuVariantsRoutes from './routes/dashboard/menu-variants.js';
import menuExtrasRoutes from './routes/dashboard/menu-extras.js';
import hoursRoutes from './routes/dashboard/hours.js';
import deliveryZonesRoutes from './routes/dashboard/delivery-zones.js';

const app = new Hono();

// CORS — permite peticiones desde el frontend Next.js (browser → API).
// En producción reemplazar origin por el dominio real del frontend.
app.use('*', cors({
  origin: [
    'http://localhost:3000',
    'https://easyorder.ai2nomous.com',
  ],
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// MEDIO-3: global handlers so every unmatched route and uncaught error
// returns controlled JSON instead of Hono's default HTML responses.
app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('[unhandled]', err);
  return c.json({ error: 'internal_server_error' }, 500);
});

app.route('/public', publicRoutes);
app.route('/public', ordersRoutes);
app.route('/dashboard', dashboardRoutes);
app.route('/dashboard', menuCategoriesRoutes);
app.route('/dashboard', menuItemsRoutes);
app.route('/dashboard', menuVariantsRoutes);
app.route('/dashboard', menuExtrasRoutes);
app.route('/dashboard', hoursRoutes);
app.route('/dashboard', deliveryZonesRoutes);

serve(
  { fetch: app.fetch, port: Number(process.env.PORT) || 3001 },
  (info) => console.log(`easyorder-api running on port ${info.port}`),
);
