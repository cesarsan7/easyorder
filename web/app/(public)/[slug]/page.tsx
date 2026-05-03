import Image from 'next/image'
import Link from 'next/link'
import type { RestaurantPublicResponse } from '@/types/api'

interface Props {
  params: Promise<{ slug: string }>
}

async function getRestaurant(slug: string) {
  const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ''
  if (!base) return null
  try {
    const res = await fetch(`${base}/public/${slug}/restaurant`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    return res.json() as Promise<RestaurantPublicResponse>
  } catch {
    return null
  }
}

export default async function LocalLandingPage({ params }: Props) {
  const { slug } = await params
  const data = await getRestaurant(slug)

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-gray-500">Local no encontrado.</p>
      </main>
    )
  }

  const accent = data.brand_color ?? '#E63946'

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50">
      {/* Hero card */}
      <section className="w-full max-w-lg px-4 pt-12 pb-8 flex flex-col items-center gap-5">

        {/* Logo */}
        {data.logo_url ? (
          <div className="relative h-24 w-24 overflow-hidden rounded-2xl shadow-md">
            <Image
              src={data.logo_url}
              alt={`Logo ${data.name}`}
              fill
              className="object-cover"
              priority
            />
          </div>
        ) : (
          <div
            className="flex h-24 w-24 items-center justify-center rounded-2xl text-3xl font-bold text-white shadow-md"
            style={{ backgroundColor: accent }}
          >
            {data.name?.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Nombre */}
        <h1 className="text-2xl font-bold text-gray-900 text-center">{data.name}</h1>

        {/* Estado abierto / cerrado */}
        {data.is_open ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Abierto ahora
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Cerrado
            {data.next_opening && (
              <> · Abre {data.next_opening}</>
            )}
          </span>
        )}

        {/* Descripción */}
        {data.description && (
          <p className="text-center text-gray-600 text-sm leading-relaxed">
            {data.description}
          </p>
        )}

        {/* Etiquetas de servicio */}
        <div className="flex gap-2 flex-wrap justify-center">
          {data.delivery_enabled && (
            <span
              className="rounded-full border px-3 py-1 text-xs font-medium"
              style={{ borderColor: accent, color: accent }}
            >
              Delivery
            </span>
          )}
          {data.pickup_enabled && (
            <span
              className="rounded-full border px-3 py-1 text-xs font-medium"
              style={{ borderColor: accent, color: accent }}
            >
              Retiro en local
            </span>
          )}
        </div>

        {/* Dirección */}
        {data.address && (
          <p className="flex items-center gap-1.5 text-sm text-gray-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 shrink-0"
            >
              <path
                fillRule="evenodd"
                d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.145 11.16 11.16 0 001.984-1.607C13.742 15.69 15.5 13.26 15.5 10a5.5 5.5 0 00-11 0c0 3.26 1.757 5.69 2.9 6.928a11.16 11.16 0 001.985 1.607 5.756 5.756 0 00.281.145l.018.008.006.003zM10 11.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z"
                clipRule="evenodd"
              />
            </svg>
            {data.address}
          </p>
        )}

        {/* CTA */}
        <Link
          href={`/${slug}/menu`}
          className="mt-2 w-full max-w-xs rounded-xl px-6 py-3 text-center text-base font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{ backgroundColor: accent }}
        >
          {data.is_open ? 'Ver menú' : 'Ver carta (cerrado)'}
        </Link>
      </section>
    </main>
  )
}
