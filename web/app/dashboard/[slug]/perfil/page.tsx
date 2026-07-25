'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBranding } from '@/lib/context/branding'

export default function PerfilPage() {
  const branding = useBranding()
  const accent   = branding?.theme?.accent ?? '#E63946'

  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [success,  setSuccess]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (next.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (next !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    // Verificar contraseña actual reautenticando
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) { setError('No se pudo obtener el usuario.'); setLoading(false); return }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email:    user.email,
      password: current,
    })
    if (signInErr) {
      setError('La contraseña actual es incorrecta.')
      setLoading(false)
      return
    }

    // Actualizar contraseña
    const { error: updateErr } = await supabase.auth.updateUser({ password: next })
    if (updateErr) {
      setError(`Error al actualizar: ${updateErr.message}`)
      setLoading(false)
      return
    }

    setSuccess(true)
    setCurrent('')
    setNext('')
    setConfirm('')
    setLoading(false)
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-8">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi perfil</h1>
        <p className="mt-1 text-sm text-gray-500">Gestiona tu contraseña de acceso.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-base font-semibold text-gray-800">Cambiar contraseña</h2>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Contraseña actual
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': accent } as React.CSSProperties}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Nueva contraseña <span className="font-normal text-gray-400">(mín. 6 caracteres)</span>
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={6}
              value={next}
              onChange={e => setNext(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': accent } as React.CSSProperties}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Confirmar nueva contraseña
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': accent } as React.CSSProperties}
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
              <p className="text-sm text-green-700">Contraseña actualizada correctamente.</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !current || !next || !confirm}
            className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: accent }}
          >
            {loading ? 'Actualizando…' : 'Actualizar contraseña'}
          </button>

        </form>
      </div>

    </div>
  )
}
