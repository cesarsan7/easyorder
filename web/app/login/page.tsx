'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ACCENT = '#E63946'

// ─── Inner component (uses useSearchParams) ───────────────────────────────────

function LoginInner() {
  const searchParams = useSearchParams()
  const nextUrl      = searchParams.get('next') ?? ''

  const [mode, setMode]       = useState<'login' | 'register'>('login')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [registered, setRegistered] = useState(false)

  function getRedirectUrl(user_id: string) {
    // Si viene de /join u otra URL protegida, respetar ese destino
    if (nextUrl && nextUrl.startsWith('/')) return nextUrl
    // Si no, ir al último slug visitado o al índice del dashboard
    try {
      const savedSlug = localStorage.getItem('easyorder-last-slug')
      return savedSlug ? `/dashboard/${savedSlug}` : '/dashboard'
    } catch {
      return '/dashboard'
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError) {
      const msg = authError.message ?? ''
      if (msg.toLowerCase().includes('email not confirmed')) {
        setError('Tu email aún no está confirmado. Revisa tu bandeja de entrada o desactiva la confirmación en Supabase.')
      } else if (msg.toLowerCase().includes('invalid login') || msg.toLowerCase().includes('invalid credentials') || msg.toLowerCase().includes('wrong password')) {
        setError('Email o contraseña incorrectos.')
      } else {
        setError(`Error al iniciar sesión: ${msg}`)
      }
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    window.location.href = getRedirectUrl(user?.id ?? '')
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Si viene de /join, redirigir ahí tras confirmar email
        emailRedirectTo: nextUrl
          ? `${window.location.origin}${nextUrl}`
          : `${window.location.origin}/dashboard`,
      },
    })

    if (authError) {
      setError(authError.message ?? 'Error al crear la cuenta.')
      setLoading(false)
      return
    }

    // Supabase puede confirmar automáticamente (sin email) si está configurado así
    if (data.session) {
      // Confirmación automática activa — sesión lista, redirigir
      window.location.href = getRedirectUrl(data.user?.id ?? '')
      return
    }

    // Confirmación por email requerida
    setRegistered(true)
    setLoading(false)
  }

  // ── Pantalla de confirmación enviada ─────────────────────────────────────

  if (registered) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-5">
          <div
            className="inline-flex items-center justify-center h-12 w-12 rounded-2xl text-white text-xl font-bold"
            style={{ backgroundColor: ACCENT }}
          >
            E
          </div>
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-2xl mx-auto"
            style={{ backgroundColor: '#DCFCE7' }}
          >
            ✉️
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Revisa tu email</h2>
            <p className="text-sm text-gray-500 mt-1">
              Te enviamos un enlace de confirmación a <strong>{email}</strong>.
              Ábrelo para activar tu cuenta y continuar.
            </p>
          </div>
          <button
            onClick={() => { setRegistered(false); setMode('login') }}
            className="text-sm font-medium underline"
            style={{ color: ACCENT }}
          >
            Ya confirmé, iniciar sesión
          </button>
        </div>
      </main>
    )
  }

  // ── Formulario login / registro ───────────────────────────────────────────

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
          <p className="text-sm text-gray-500 mt-1">Panel de operaciones</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-7">
          <h2 className="text-base font-semibold text-gray-900 mb-5">
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </h2>

          <form
            onSubmit={mode === 'login' ? handleLogin : handleRegister}
            className="space-y-4"
          >
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-gray-600 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition"
                style={{ '--tw-ring-color': ACCENT } as React.CSSProperties}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-gray-600 mb-1.5">
                Contraseña
                {mode === 'register' && (
                  <span className="ml-1 font-normal text-gray-400">(mín. 6 caracteres)</span>
                )}
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'register' ? 6 : undefined}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition"
                style={{ '--tw-ring-color': ACCENT } as React.CSSProperties}
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: ACCENT }}
            >
              {loading
                ? (mode === 'login' ? 'Iniciando sesión…' : 'Creando cuenta…')
                : (mode === 'login' ? 'Entrar' : 'Crear cuenta')}
            </button>
          </form>

          {/* Toggle login / register */}
          <p className="mt-5 text-center text-xs text-gray-500">
            {mode === 'login' ? (
              <>
                ¿No tienes cuenta?{' '}
                <button
                  onClick={() => { setMode('register'); setError(null) }}
                  className="font-medium underline"
                  style={{ color: ACCENT }}
                >
                  Regístrate
                </button>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{' '}
                <button
                  onClick={() => { setMode('login'); setError(null) }}
                  className="font-medium underline"
                  style={{ color: ACCENT }}
                >
                  Inicia sesión
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </main>
  )
}

// Page wrapper
export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Cargando…</p>
      </main>
    }>
      <LoginInner />
    </Suspense>
  )
}
