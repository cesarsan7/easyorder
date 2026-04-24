/**
 * Script de prueba local para requireAuth + GET /dashboard/:slug/orders
 *
 * Uso:
 *   node scripts/test-auth.mjs
 *
 * Requiere: api/.env con SUPABASE_URL y SUPABASE_ANON_KEY definidos.
 * El servidor debe estar corriendo en localhost:3001 (npm run dev).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// 1. Cargar .env manualmente (sin dependencias extra)
// ---------------------------------------------------------------------------
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '../.env');

let envVars = {};
try {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    envVars[key] = val;
  }
} catch (err) {
  console.error(`No se pudo leer ${envPath}:`, err.message);
  process.exit(1);
}

const SUPABASE_URL   = envVars.SUPABASE_URL;
const SUPABASE_ANON_KEY = envVars.SUPABASE_ANON_KEY;
const API_BASE       = envVars.API_BASE_URL ?? 'http://localhost:3001';
const SLUG           = envVars.TEST_SLUG    ?? 'la-isla';
const TEST_EMAIL     = 'ai2nomous@gmail.com';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en api/.env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Pedir password al proceso (para no guardarlo en el script)
// ---------------------------------------------------------------------------
async function readPassword() {
  const { createInterface } = await import('readline');
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`Password para ${TEST_EMAIL}: `, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// ---------------------------------------------------------------------------
// 3. Login contra Supabase para obtener el JWT
// ---------------------------------------------------------------------------
async function loginSupabase(password) {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email: TEST_EMAIL, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('\n[Supabase login] Error:', res.status, JSON.stringify(data, null, 2));
    process.exit(1);
  }

  return data.access_token;
}

// ---------------------------------------------------------------------------
// 4. Llamar al endpoint protegido
// ---------------------------------------------------------------------------
async function callDashboardOrders(token) {
  const url = `${API_BASE}/dashboard/${SLUG}/orders`;
  console.log(`\n[API] GET ${url}`);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let body;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }

  console.log(`[API] Status: ${res.status}`);
  console.log('[API] Response:', JSON.stringify(body, null, 2));
  return res.status;
}

// ---------------------------------------------------------------------------
// 5. Flujo principal
// ---------------------------------------------------------------------------
(async () => {
  console.log('=== test-auth: requireAuth + /dashboard/:slug/orders ===');
  console.log(`Supabase URL : ${SUPABASE_URL}`);
  console.log(`API base     : ${API_BASE}`);
  console.log(`Slug         : ${SLUG}`);
  console.log(`Email        : ${TEST_EMAIL}`);

  const password = await readPassword();

  console.log('\n[Supabase] Haciendo login...');
  const token = await loginSupabase(password);
  console.log('[Supabase] JWT obtenido (primeros 40 chars):', token.slice(0, 40) + '...');

  const status = await callDashboardOrders(token);

  console.log('\n--- Interpretación ---');
  if (status === 200) console.log('OK: middleware pasó y el endpoint respondió con datos.');
  if (status === 401) console.log('FAIL: token inválido o no enviado (problema en requireAuth).');
  if (status === 403) console.log('FAIL: usuario no tiene membresía en el local (local_memberships).');
  if (status === 404) console.log('FAIL: slug no encontrado (resolveTenant no halló el restaurante).');
  if (status === 503) console.log('FAIL: error de base de datos (revisar conexión PostgreSQL).');
})();
