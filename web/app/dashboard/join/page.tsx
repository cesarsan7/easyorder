'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ACCENT = '#E63946'

// ─── Inner component (uses useSearchParams) ───────────────────────────────────

function JoinInner() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token') ?? ''

  const [status, setStatus] = useState<'loading' | 'ready' | 'joining' | 'success' | 'error' | 'no_auth'>('loading')
  const [message, setMessage]   = useState('')
  const [slug, setSlug]         = useState('')
  const [nombre, setNombre]     = useState('')
  const [rol, setRol]           = useState('')

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Enlace de invitación inválido o incompleto.')
      return
    }

    // Check if user is authenticated
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // Redirect to login, preserving the invite URL as next param
        const next = encodeURIComponent(`/dashboard/join?token=${token}`)
        window.location.href = `/login?next=${next}`
        return
      }
      setStatus('ready')
    })
  }, [token])

  async function handleJoin() {
    setStatus('joining')
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.href)}`
        return
      }

      const res = await fetch(`${apiBase}/dashboard/join`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token }),
      })

      const data = await res.json()

      if (!res.ok) {
        const errMap: Record<string, string> = {
          invalid_token:    'El enlace de invitación no existe.',
          token_already_used: 'Este enlace ya fue utilizado.',
          token_expired:    'El enlace de invitación ha expirado.',
          unauthorized:     'Debes iniciar sesión para aceptar la invitación.',
        }
        setStatus('error')
        setMessage(errMap[(data as { error?: string }).error ?? ''] ?? 'No se pudo procesar la invitación.')
        return
      }

      const d = data as { slug: string; nombre: string; rol: string }
      setSlug(d.slug)
      setNombre(d.nombre)
      setRol(d.rol)
      setStatus('success')

      // Redirect after short delay
      setTimeout(() => {
        window.location.href = `/dashboard/${d.slug}`
      }, 2000)

    } catch {
      setStatus('error')
      setMessage('Error de conexión. Intenta de nuevo.')
    }
  }

  const ROL_LABEL: Record<string, string> = {
    manager: 'Gerente',
    staff:   'Personal',
  }

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
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-7 text-center space-y-5">

          {status === 'loading' && (
            <p className="text-sm text-gray-400">Verificando invitación…</p>
          )}

          {status === 'ready' && (
            <>
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl mx-auto"
                style={{ backgroundColor: '#FEF3C7' }}
              >
                📩
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Te han invitado a un restaurante
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Al aceptar quedarás añadido como miembro del equipo.
                </p>
              </div>
              <button
                onClick={handleJoin}
                className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: ACCENT }}
              >
                Aceptar invitación
              </button>
            </>
          )}

          {status === 'joining' && (
            <p className="text-sm text-gray-400">Procesando invitación…</p>
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
                  Tu rol: <strong>{ROL_LABEL[rol] ?? rol}</strong>.
                  Redirigiendo al dashboard…
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

// ─── Page (wraps in Suspense for useSearchParams) ─────────────────────────────

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
