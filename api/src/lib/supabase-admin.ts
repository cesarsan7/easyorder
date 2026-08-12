/**
 * supabase-admin.ts
 *
 * Cliente de Supabase con service_role key — bypasea RLS.
 * Usar SOLO en el backend, nunca exponer al frontend.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL          = process.env.SUPABASE_URL          ?? '';
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL)         throw new Error('SUPABASE_URL is not set');
if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

export default supabaseAdmin;
