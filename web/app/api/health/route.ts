import { NextResponse } from 'next/server'

/**
 * GET /api/health
 * Diagnóstico de runtime — muestra qué env vars recibe Next.js en producción.
 * NO expone credenciales: solo muestra si están presentes (true/false) o el valor si es seguro.
 */
export async function GET() {
  const apiUrl = process.env.API_URL ?? null
  const nextPublicApiUrl = process.env.NEXT_PUBLIC_API_URL ?? null

  // Verifica si la API es alcanzable desde el servidor Next.js
  let apiReachable = false
  let apiStatus: number | null = null
  const base = apiUrl ?? nextPublicApiUrl
  if (base) {
    try {
      const res = await fetch(`${base}/public/la-isla/restaurant`, {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      })
      apiReachable = res.ok
      apiStatus = res.status
    } catch {
      apiReachable = false
    }
  }

  return NextResponse.json({
    status: 'ok',
    env: {
      NODE_ENV: process.env.NODE_ENV,
      API_URL: apiUrl,                             // valor real (no es credencial)
      NEXT_PUBLIC_API_URL: nextPublicApiUrl,       // baked at build time
      NEXT_PUBLIC_SUPABASE_URL_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY_set: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    api_connectivity: {
      url_used: base,
      reachable: apiReachable,
      http_status: apiStatus,
    },
  })
}
