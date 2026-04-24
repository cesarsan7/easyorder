'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function DashboardIndexPage() {
  const router = useRouter()

  useEffect(() => {
    // 1. Si hay un slug guardado, redirigir directamente.
    const savedSlug = localStorage.getItem('easyorder-last-slug')
    if (savedSlug) {
      router.replace(`/dashboard/${savedSlug}`)
      return
    }

    // 2. No hay slug — buscar los restaurantes del usuario via API.
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
        return
      }

      try {
        const base = process.env.NEXT_PUBLIC_API_URL ?? ''
        const res = await fetch(`${base}/dashboard/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })

        if (!res.ok) {
          router.replace('/login')
          return
        }

        const data = await res.json() as { restaurants: { slug: string }[] }
        const slug = data.restaurants?.[0]?.slug

        if (slug) {
          localStorage.setItem('easyorder-last-slug', slug)
          router.replace(`/dashboard/${slug}`)
        } else {
          router.replace('/login')
        }
      } catch {
        router.replace('/login')
      }
    })
  }, [router])

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-red-500 animate-spin" />
    </main>
  )
}
