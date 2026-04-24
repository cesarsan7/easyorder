'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { MenuPublicResponse, RestaurantPublicResponse, MenuItem } from '@/types/api'
import { useCartStore } from '@/lib/store/cart'
import { fmtPrice } from '@/lib/fmt'

interface Props {
  slug: string
  menu: MenuPublicResponse
  restaurant: RestaurantPublicResponse
}

function useFmt() {
  const moneda = useCartStore((s) => s.moneda)
  return (n: number) => fmtPrice(n, moneda)
}

function minVariantPrice(item: MenuItem): number {
  if (item.variants.length === 0) return item.base_price
  return Math.min(...item.variants.map((v) => v.price))
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  item,
  slug,
  isOpen,
  accent,
}: {
  item: MenuItem
  slug: string
  isOpen: boolean
  accent: string
}) {
  const addItem = useCartStore((s) => s.addItem)
  const fmt = useFmt()

  const needsDetail = item.variants.length > 0 || item.extras.length > 0
  const showFromPrice = item.requires_variant || item.variants.length > 0
  const displayPrice = showFromPrice
    ? `Desde ${fmt(minVariantPrice(item))}`
    : fmt(item.base_price)

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault()
    if (!isOpen) return
    addItem({
      itemId: item.menu_item_id,
      itemName: item.name,
      variantId: null,
      variantName: null,
      extras: [],
      unitPrice: item.base_price,
    })
  }

  const addButton = needsDetail ? (
    <Link
      href={`/${slug}/menu/producto/${item.menu_item_id}`}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xl font-bold leading-none shadow-sm transition-opacity hover:opacity-90"
      style={{ backgroundColor: accent }}
      aria-label={`Ver opciones de ${item.name}`}
    >
      +
    </Link>
  ) : (
    <button
      onClick={handleAdd}
      disabled={!isOpen}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xl font-bold leading-none shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ backgroundColor: accent }}
      aria-label={`Agregar ${item.name}`}
    >
      +
    </button>
  )

  return (
    <div className="flex flex-col bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 hover:shadow-md transition-shadow">
      <div className="relative h-36 bg-gray-100 overflow-hidden shrink-0">
        {item.image_url ? (
          <Image src={item.image_url} alt={item.name} fill className="object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-3xl font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            {item.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex flex-col flex-1 p-3 gap-1">
        <p className="font-semibold text-gray-900 text-sm leading-tight">{item.name}</p>
        {item.description && (
          <p className="text-gray-500 text-xs line-clamp-2 leading-snug">{item.description}</p>
        )}
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="font-semibold text-gray-900 text-sm">{displayPrice}</span>
          {addButton}
        </div>
      </div>
    </div>
  )
}

// ─── Cart sidebar (desktop md+) ───────────────────────────────────────────────

function CartSidebar({
  slug,
  deliveryMinOrder,
  accent,
}: {
  slug: string
  deliveryMinOrder: number
  accent: string
}) {
  const items = useCartStore((s) => s.items)
  const updateQty = useCartStore((s) => s.updateQty)
  const subtotal = useCartStore((s) => s.subtotal())
  const fmt = useFmt()

  if (items.length === 0) return null

  const showMinWarning = deliveryMinOrder > 0 && subtotal < deliveryMinOrder

  return (
    <aside className="hidden md:flex flex-col w-80 shrink-0">
      <div className="sticky top-28 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Tu pedido</h2>
        </div>

        <ul className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
          {items.map((item) => {
            const key = `${item.itemId}:${item.variantId ?? 'none'}:${item.extras.map((e) => e.id).join(',')}`
            return (
              <li key={key} className="flex gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.itemName}</p>
                  {item.variantName && (
                    <p className="text-xs text-gray-500 truncate">{item.variantName}</p>
                  )}
                  {item.extras.length > 0 && (
                    <p className="text-xs text-gray-500 truncate">
                      {item.extras.map((e) => e.name).join(', ')}
                    </p>
                  )}
                  <p className="text-xs text-gray-700 mt-0.5">{fmt(item.unitPrice * item.qty)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => updateQty(item.itemId, item.variantId, item.extras, item.qty - 1)}
                    className="h-6 w-6 rounded-full bg-gray-100 text-gray-700 text-base flex items-center justify-center hover:bg-gray-200 leading-none"
                    aria-label="Reducir cantidad"
                  >
                    −
                  </button>
                  <span className="text-sm w-4 text-center tabular-nums">{item.qty}</span>
                  <button
                    onClick={() => updateQty(item.itemId, item.variantId, item.extras, item.qty + 1)}
                    className="h-6 w-6 rounded-full text-white text-base flex items-center justify-center hover:opacity-90 leading-none"
                    style={{ backgroundColor: accent }}
                    aria-label="Aumentar cantidad"
                  >
                    +
                  </button>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="p-4 border-t border-gray-100 space-y-3">
          {showMinWarning && (
            <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 leading-snug">
              Mínimo de delivery {fmt(deliveryMinOrder)} · Te faltan{' '}
              <span className="font-semibold">{fmt(deliveryMinOrder - subtotal)}</span>
            </p>
          )}
          <div className="flex justify-between text-sm font-semibold text-gray-900">
            <span>Subtotal</span>
            <span>{fmt(subtotal)}</span>
          </div>
          <Link
            href={`/${slug}/carrito`}
            className="block w-full text-center rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            Continuar al pedido →
          </Link>
        </div>
      </div>
    </aside>
  )
}

// ─── Cart floating button (mobile) ───────────────────────────────────────────

function CartFloatingButton({ slug, accent }: { slug: string; accent: string }) {
  const itemCount = useCartStore((s) => s.itemCount())
  const total = useCartStore((s) => s.total())

  const fmt = useFmt()

  if (itemCount === 0) return null

  return (
    <div className="md:hidden fixed bottom-5 left-0 right-0 px-4 z-50">
      <Link
        href={`/${slug}/carrito`}
        className="flex items-center gap-3 rounded-2xl px-5 py-3.5 text-white shadow-xl w-full justify-between"
        style={{ backgroundColor: accent }}
      >
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 shrink-0"
          >
            <path d="M1 1.75A.75.75 0 011.75 1h1.628a1.75 1.75 0 011.734 1.51L5.43 3h13.57a.75.75 0 01.74.873l-1.5 7.5a.75.75 0 01-.74.627h-10a.75.75 0 01-.74-.627L5.245 5.001 5.11 4.26A.25.25 0 004.862 4H1.75A.75.75 0 011 3.25v-1.5zM6 15.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm8.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
          </svg>
          <span className="h-5 w-5 rounded-full bg-white/25 flex items-center justify-center text-xs font-bold tabular-nums">
            {itemCount}
          </span>
        </div>
        <span className="text-sm font-semibold">Ver pedido</span>
        <span className="text-sm font-semibold tabular-nums">{fmt(total)}</span>
      </Link>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function MenuView({ slug, menu, restaurant }: Props) {
  const { categories } = menu
  const accent = restaurant.brand_color ?? '#E63946'
  const isOpen = restaurant.is_open
  const deliveryMinOrder = menu.delivery_min_order ?? restaurant.delivery_min_order ?? 0
  const moneda: string = (menu as any).moneda ?? (restaurant as any).moneda ?? 'EUR'

  const setMoneda = useCartStore((s) => s.setMoneda)
  useEffect(() => { setMoneda(moneda) }, [moneda, setMoneda])

  const activeCategories = categories
    .filter((c) => c.items.some((i) => i.is_active))
    .sort((a, b) => a.sort_order - b.sort_order)

  const [activeTab, setActiveTab] = useState<number | null>(
    activeCategories[0]?.menu_category_id ?? null,
  )

  const sectionRefs = useRef<Record<number, HTMLElement | null>>({})

  function scrollToCategory(id: number) {
    setActiveTab(id)
    const el = sectionRefs.current[id]
    if (el) {
      const headerHeight = 104 // compact header (~56px) + tabs row (~48px)
      const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 12
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-4">
      {/* Closed banner */}
      {!isOpen && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-center text-sm text-amber-800">
          <span className="font-semibold">Local cerrado.</span>
          {restaurant.next_opening && (
            <>
              {' '}Vuelve a abrir:{' '}
              <span className="font-semibold">{restaurant.next_opening}</span>
            </>
          )}
        </div>
      )}

      {/* Compact sticky header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        {/* Logo + name + status */}
        <div className="flex items-center gap-3 px-4 py-3 max-w-5xl mx-auto">
          {restaurant.logo_url ? (
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl">
              <Image
                src={restaurant.logo_url}
                alt={`Logo ${restaurant.name}`}
                fill
                className="object-cover"
              />
            </div>
          ) : (
            <div
              className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-white font-bold text-lg"
              style={{ backgroundColor: accent }}
            >
              {restaurant.name?.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="flex-1 min-w-0 font-semibold text-gray-900 text-sm truncate">
            {restaurant.name}
          </p>
          {isOpen ? (
            <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Abierto
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Cerrado
            </span>
          )}
        </div>

        {/* Category tabs */}
        {activeCategories.length > 0 && (
          <nav
            className="border-t border-gray-100 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
          >
            <div className="flex px-4 min-w-max">
              {activeCategories.map((cat) => (
                <button
                  key={cat.menu_category_id}
                  onClick={() => scrollToCategory(cat.menu_category_id)}
                  className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === cat.menu_category_id
                      ? 'border-current'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  style={
                    activeTab === cat.menu_category_id
                      ? { borderColor: accent, color: accent }
                      : undefined
                  }
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* Page body */}
      <div className="max-w-5xl mx-auto px-4 py-6 flex gap-6 items-start">
        {/* Product sections */}
        <div className="flex-1 min-w-0 space-y-10">
          {activeCategories.map((cat) => {
            const visibleItems = cat.items.filter((i) => i.is_active)
            return (
              <section
                key={cat.menu_category_id}
                ref={(el) => {
                  sectionRefs.current[cat.menu_category_id] = el
                }}
              >
                <h2 className="text-base font-bold text-gray-900 mb-4">{cat.name}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {visibleItems.map((item) => (
                    <ProductCard
                      key={item.menu_item_id}
                      item={item}
                      slug={slug}
                      isOpen={isOpen}
                      accent={accent}
                    />
                  ))}
                </div>
              </section>
            )
          })}

          {activeCategories.length === 0 && (
            <p className="text-center text-gray-500 py-16">
              No hay productos disponibles.
            </p>
          )}
        </div>

        {/* Cart sidebar (desktop) */}
        <CartSidebar
          slug={slug}
          deliveryMinOrder={deliveryMinOrder}
          accent={accent}
        />
      </div>

      {/* Bottom padding to clear floating button on mobile */}
      <div className="h-20 md:hidden" />

      {/* Floating cart button (mobile) */}
      <CartFloatingButton slug={slug} accent={accent} />
    </div>
  )
}
