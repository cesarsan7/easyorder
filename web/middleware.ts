import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabaseResponse.cookies.set(name, value, options as any)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    // Construir URL de login con el destino original en ?next=
    // NO usar nextUrl.clone() — arrastra los query params originales
    // (/dashboard/join?token=X → /login?token=X en vez de /login?next=...)
    const loginUrl = new URL('/login', request.nextUrl.origin)
    const originalPath = request.nextUrl.pathname + request.nextUrl.search
    loginUrl.searchParams.set('next', originalPath)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  // Solo rutas protegidas
  matcher: [
    '/dashboard/:path*',
    '/login',
  ],
}
