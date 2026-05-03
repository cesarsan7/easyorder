'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Restaurant {
  slug:   string
  nombre: string
  rol:    string
}

function Spinner() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-red-500 animate-spin" />
    </main>
  )
}

function RestaurantPicker({
  restaurants,
  onSelect,
  onCreateNew,
}: {
  restaurants: Restaurant[]
  onSelect:    (slug: string) => void
  onCreateNew: () => void
}) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">EasyOrder</h1>
          <p className="text-gray-500 text-sm">Selecciona el local al que quieres acceder</p>
        </div>
        <ul className="space-y-2 mb-6">
          {restaurants.map((r) => (
            <li key={r.slug}>
              <button
                onClick={() => onSelect(r.slug)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-red-400 hover:bg-red-50 transition-colors text-left group"
              >
                <span className="font-medium text-gray-900 group-hover:text-red-700">
                  {r.nombre}
                </span>
                <span className="text-xs text-gray-400 group-hover:text-red-500">
                  {r.rol} &rarr;
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={onCreateNew}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors text-sm"
        >
          <span>+</span>
          <span>Crear nuevo local</span>
        </button>
      </div>
    </main>
  )
}

export default function DashboardIndexPage() {
  const router = useRouter()
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null)

  useEffect(() => {
    const savedSlug = localStorage.getItem('easyorder-last-slug')
    if (savedSlug) {
      router.replace('/dashboard/' + savedSlug)
      return
    }

    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }

      try {
        const base = process.env.NEXT_PUBLIC_API_URL ?? ''
        const res = await fetch(base + '/dashboard/me', {
          headers: { Authorization: 'Bearer ' + session.access_token },
        })
        if (!res.ok) { router.replace('/login'); return }

        const data = await res.json() as { restaurants: Restaurant[] }
        const list = data.restaurants ?? []

        if (list.length === 0) {
          router.replace('/dashboard/admin')
          return
        }
        if (list.length === 1) {
          localStorage.setItem('easyorder-last-slug', list[0].slug)
          router.replace('/dashboard/' + list[0].slug)
          return
        }
        setRestaurants(list)
      } catch {
        router.replace('/login')
      }
    })
  }, [router])

  if (restaurants === null) return <Spinner />

  return (
    <RestaurantPicker
      restaurants={restaurants}
      onSelect={(slug) => {
        localStorage.setItem('easyorder-last-slug', slug)
        router.push('/dashboard/' + slug)
      }}
      onCreateNew={() => router.push('/dashboard/admin')}
    />
  )
}
