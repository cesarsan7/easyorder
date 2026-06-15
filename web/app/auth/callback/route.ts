import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── GET /auth/callback ───────────────────────────────────────────────────────
// Supabase redirige aquí después de que el usuario confirma su email (flujo PKCE).
// Intercambia el `code` por una sesión válida y redirige al destino final.
//
// URL de entrada:
//   /auth/callback?code=XXXX&next=/registro
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/registro'

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Redirige al destino con la sesión ya establecida en cookies
      return NextResponse.redirect(`${origin}${next}`)
    }

    console.error('[/auth/callback] exchangeCodeForSession error:', error.message)
  }

  // En caso de error o código ausente, redirige al registro con indicador de error
  return NextResponse.redirect(`${origin}/registro?error=auth_callback_failed`)
}
