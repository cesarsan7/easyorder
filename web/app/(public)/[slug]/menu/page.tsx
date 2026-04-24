import type { MenuPublicResponse, RestaurantPublicResponse } from '@/types/api'
import MenuView from './MenuView'

interface Props {
  params: Promise<{ slug: string }>
}

// API_URL (sin prefijo NEXT_PUBLIC_) se lee en runtime desde el servidor.
// NEXT_PUBLIC_API_URL queda como fallback para compatibilidad con builds locales.
const API_BASE =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ''

async function getRestaurant(slug: string): Promise<RestaurantPublicResponse | null> {
  if (!API_BASE) return null
  try {
    const res = await fetch(`${API_BASE}/public/${slug}/restaurant`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function getMenu(slug: string): Promise<MenuPublicResponse | null> {
  if (!API_BASE) return null
  try {
    const res = await fetch(`${API_BASE}/public/${slug}/menu`, {
      next: { revalidate: 120 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function MenuPage({ params }: Props) {
  const { slug } = await params

  const [restaurant, menu] = await Promise.all([
    getRestaurant(slug),
    getMenu(slug),
  ])

  if (!menu || !restaurant) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-gray-500">Menú no disponible.</p>
      </main>
    )
  }

  return <MenuView slug={slug} menu={menu} restaurant={restaurant} />
}
