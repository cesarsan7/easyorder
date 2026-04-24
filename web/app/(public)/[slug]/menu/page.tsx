import type { MenuPublicResponse, RestaurantPublicResponse } from '@/types/api'
import MenuView from './MenuView'

interface Props {
  params: Promise<{ slug: string }>
}

async function getRestaurant(slug: string): Promise<RestaurantPublicResponse | null> {
  const base = process.env.NEXT_PUBLIC_API_URL
  const res = await fetch(`${base}/public/${slug}/restaurant`, {
    next: { revalidate: 60 },
  })
  if (!res.ok) return null
  return res.json()
}

async function getMenu(slug: string): Promise<MenuPublicResponse | null> {
  const base = process.env.NEXT_PUBLIC_API_URL
  const res = await fetch(`${base}/public/${slug}/menu`, {
    next: { revalidate: 120 },
  })
  if (!res.ok) return null
  return res.json()
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
