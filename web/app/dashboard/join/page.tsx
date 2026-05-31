'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ACCENT = '#E63946'

const ROL_LABEL: Record<string, string> = {
  manager: 'Gerente',
  staff:   'Personal',
  owner:   'Propietario',
}

// ─── Inner component (uses useSearchParams) ───────────────────────────────────

function JoinInner() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token') ?? ''

  const [status, setStatus]   = useState<'loading' | 'joining' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [slug, setSlug]       = useState('')
  const [nombre, setNombre]   = useState('')
  const [rol, setRol]         = useState('')

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''

  // Llamada al API para aceptar el invite con el access_token ya disponible
  async function acceptInvite(accessToken: string) {
    setStatus('joining')
    try {
      const res = await fetch(`${apiBase}/dashboard/join`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ token }),
      })

      const data = await res.json() as { error?: string; slug?: string; nombre?: string; rol?: string }

      if (!res.ok) {
        const errMap: Record<string, string> = {
          invalid_token:      'El enlace de invitación no existe o es inválido.',
          token_expired:      'El enlace de invitación ha expirado.',
          unauthorized:       'Sesión expirada. Vuelve a iniciar sesión.',
          restaurant_not_found: 'El restaurante asociado a esta invitación no existe.',
        }

        // token_already_used: el usuario ya es miembro — redirigir al dashboard
        if (data.error === 'token_already_used') {
          try {
            const meRes = await fetch(`${apiBase}/dashboard/me`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            })
            if (meRes.ok) {
              const me = await meRes.json() as { restaurants?: { slug: string }[] }
              const first = me.restaurants?.[0]
              if (first) { window.location.href = `/dashboard/${first.slug}`; return }
            }
          } catch { /* silent */ }
        }

        setStatus('error')
        setMessage(errMap[data.error ?? ''] ?? `Error al procesar la invitación. (${data.error ?? res.status})`)
        return
      }

      setSlug(data.slug ?? '')
      setNombre(data.nombre ?? '')
      setRol(data.rol ?? '')
      setStatus('success')
      setTimeout(() => { window.location.href = `/dashboard/${data.slug}` }, 1500)

    } catch {
      setStatus('error')
      setMessage('Error de conexión. Intenta de nuevo.')
    }
  }

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Enlace de invitación inválido o incompleto.')
      return
    }

    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // Sin sesión → ir a login, conservando el token de invite en ?next=
        const next = encodeURIComponent(`/dashboard/join?token=${token}`)
        window.location.href = `/login?next=${next}`
        return
      }
      // Sesión activa → aceptar automáticamente, sin botón intermedio
      acceptInvite(session.access_token)
    })
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center h-12 w-12 rounded-2xl text-white text-xl font-bold mb-4"
            style={{ backgroundColor: ACCENT }}
          >
            E
          </div>
          <h1 className="text-2xl font-bold text-gray-900">EasyOrder</h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-8 text-center space-y-5">

          {(status === 'loading' || status === 'joining') && (
            <>
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl mx-auto"
                style={{ backgroundColor: '#FEF3C7' }}
              >
                ⏳
              </div>
              <p className="text-sm text-gray-500">
                {status === 'loading' ? 'Verificando invitación…' : 'Procesando…'}
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl mx-auto"
                style={{ backgroundColor: '#DCFCE7' }}
              >
                ✅
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  ¡Bienvenido a {nombre}!
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Rol: <strong>{ROL_LABEL[rol] ?? rol}</strong>. Redirigiendo…
                </p>
              </div>
              <a
                href={`/dashboard/${slug}`}
                className="inline-block text-sm font-medium underline"
                style={{ color: ACCENT }}
              >
                Ir al dashboard →
              </a>
            </>
          )}

          {status === 'error' && (
            <>
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl mx-auto"
                style={{ backgroundColor: '#FEE2E2' }}
              >
                ⚠️
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Invitación no válida
                </h2>
                <p className="text-sm text-gray-500 mt-1">{message}</p>
              </div>
              <a
                href="/dashboard"
                className="inline-block text-sm font-medium underline"
                style={{ color: ACCENT }}
              >
                Ir al dashboard
              </a>
            </>
          )}

        </div>
      </div>
    </main>
  )
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function JoinPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Cargando…</p>
      </main>
    }>
      <JoinInner />
    </Suspense>
  )
}
