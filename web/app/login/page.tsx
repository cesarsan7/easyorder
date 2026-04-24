'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ACCENT = '#E63946'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError) {
      setError('Email o contraseña incorrectos.')
      setLoading(false)
      return
    }

    // Fetch memberships to know which slug to redirect to
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('No se pudo obtener el usuario.')
      setLoading(false)
      return
    }

    // Get the first restaurant this user belongs to
    const base = process.env.NEXT_PUBLIC_API_URL
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    try {
      // Try the first slug the user has access to via their membership.
      // Since we don't have a /me endpoint yet, we redirect to a known slug
      // stored in localStorage or fall back to a default.
      const savedSlug = localStorage.getItem('easyorder-last-slug')
      if (savedSlug) {
        router.replace(`/dashboard/${savedSlug}`)
      } else {
        // Fallback: redirect to /dashboard and let user navigate
        router.replace('/dashboard')
      }
    } catch {
      router.replace('/dashboard')
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
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
          <h2 className="text-base font-semibold text-gray-900 mb-5">Iniciar sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
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
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
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
              {loading ? 'Iniciando sesión…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
