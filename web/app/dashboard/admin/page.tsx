'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'

interface Restaurant {
  slug:   string
  nombre: string
  rol:    string
}

interface CreateForm {
  nombre:       string
  slug:         string
  zona_horaria: string
  moneda:       string
  descripcion:  string
  brand_color:  string
}

const EMPTY_FORM: CreateForm = {
  nombre:       '',
  slug:         '',
  zona_horaria: 'Atlantic/Canary',
  moneda:       '€',
  descripcion:  '',
  brand_color:  '#E63946',
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

function RolBadge({ rol }: { rol: string }) {
  const map: Record<string, string> = {
    owner:   'bg-red-100 text-red-700',
    admin:   'bg-orange-100 text-orange-700',
    manager: 'bg-blue-100 text-blue-700',
    staff:   'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[rol] ?? 'bg-gray-100 text-gray-600'}`}>
      {rol}
    </span>
  )
}

export default function AdminPage() {
  const router    = useRouter()
  const authFetch = useAuthFetch()

  const [loading,     setLoading]     = useState(true)
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [showForm,    setShowForm]    = useState(false)
  const [form,        setForm]        = useState<CreateForm>(EMPTY_FORM)
  const [slugTouched, setSlugTouched] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      try {
        const base = process.env.NEXT_PUBLIC_API_URL ?? ''
        const res  = await fetch(base + '/dashboard/me', {
          headers: { Authorization: 'Bearer ' + session.access_token },
        })
        if (!res.ok) { router.replace('/login'); return }
        const data = await res.json() as { restaurants: Restaurant[] }
        const list = data.restaurants ?? []
        setRestaurants(list)
        if (list.length === 0) setShowForm(true)
      } catch {
        router.replace('/login')
      } finally {
        setLoading(false)
      }
    })
  }, [router])

  const handleNombreChange = useCallback((value: string) => {
    setForm((f) => ({
      ...f,
      nombre: value,
      slug:   slugTouched ? f.slug : slugify(value),
    }))
  }, [slugTouched])

  const handleCreate = useCallback(async () => {
    setError(null)
    if (!form.nombre.trim()) { setError('El nombre del local es obligatorio.'); return }
    if (!form.slug.trim())   { setError('El slug es obligatorio.'); return }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(form.slug)) {
      setError('El slug solo puede contener letras minúsculas, números y guiones.')
      return
    }

    setSaving(true)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? ''
      const res  = await authFetch(base + '/dashboard/admin/restaurants', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:       form.nombre.trim(),
          slug:         form.slug.trim(),
          zona_horaria: form.zona_horaria || 'Atlantic/Canary',
          moneda:       form.moneda       || '€',
          descripcion:  form.descripcion.trim() || undefined,
          brand_color:  form.brand_color  || '#E63946',
        }),
      })

      if (!res) { setError('No se pudo autenticar. Recarga la página.'); return }

      if (!res.ok) {
        const body = await res.json() as { error?: string; detail?: string }
        if (body.error === 'slug_conflict') {
          setError('El slug \'' + form.slug + '\' ya está en uso. Elige otro.')
        } else {
          setError(body.detail ?? body.error ?? 'Error al crear el local.')
        }
        return
      }

      const newRest = await res.json() as { slug: string; nombre: string }
      localStorage.setItem('easyorder-last-slug', newRest.slug)
      router.push('/dashboard/' + newRest.slug)
    } catch {
      setError('Error de conexión. Verifica tu internet e intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }, [form, authFetch, router])

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-red-500 animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mis locales</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gestiona los locales a los que tienes acceso</p>
          </div>
          {restaurants.length > 0 && (
            <button
              onClick={() => { setShowForm(true); setError(null); setForm(EMPTY_FORM); setSlugTouched(false) }}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + Nuevo local
            </button>
          )}
        </div>

        {restaurants.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {restaurants.map((r) => (
                <li key={r.slug}>
                  <button
                    onClick={() => {
                      localStorage.setItem('easyorder-last-slug', r.slug)
                      router.push('/dashboard/' + r.slug)
                    }}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left group"
                  >
                    <div>
                      <p className="font-medium text-gray-900 group-hover:text-red-700 transition-colors">
                        {r.nombre}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">/{r.slug}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <RolBadge rol={r.rol} />
                      <span className="text-gray-300 group-hover:text-red-400 transition-colors">&rarr;</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {restaurants.length === 0 && !showForm && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center">
            <p className="text-gray-500 mb-4">Todavía no tienes ningún local configurado.</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Crear mi primer local
            </button>
          </div>
        )}

        {showForm && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Nuevo local</h2>
              {restaurants.length > 0 && (
                <button
                  onClick={() => { setShowForm(false); setError(null) }}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  ×
                </button>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del local <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => handleNombreChange(e.target.value)}
                placeholder="La Isla Pizzería"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL del local (slug) <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400 whitespace-nowrap">/dashboard/</span>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))
                  }}
                  placeholder="la-isla"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Solo letras minúsculas, números y guiones. No puede cambiar después.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zona horaria</label>
                <input
                  type="text"
                  value={form.zona_horaria}
                  onChange={(e) => setForm((f) => ({ ...f, zona_horaria: e.target.value }))}
                  placeholder="Atlantic/Canary"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
                <input
                  type="text"
                  value={form.moneda}
                  onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value }))}
                  placeholder="€"
                  maxLength={5}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                rows={2}
                placeholder="Breve descripción del local..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color de marca</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.brand_color}
                  onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))}
                  className="h-9 w-12 rounded border border-gray-200 cursor-pointer p-0.5"
                />
                <span className="text-sm text-gray-500 font-mono">{form.brand_color}</span>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              {restaurants.length > 0 && (
                <button
                  onClick={() => { setShowForm(false); setError(null) }}
                  disabled={saving}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
              )}
              <button
                onClick={handleCreate}
                disabled={saving || !form.nombre.trim() || !form.slug.trim()}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {saving && (
                  <div className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                )}
                {saving ? 'Creando...' : 'Crear local'}
              </button>
            </div>
          </section>
        )}

      </div>
    </main>
  )
}
