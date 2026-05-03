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

function ProductCard({ item, slug, isOpen, accent }: { item: MenuItem; slug: string; isOpen: boolean; accent: string }) {
  const addItem = useCartStore((s) => s.addItem)
  const fmt = useFmt()
  const needsDetail = item.variants.length > 0 || item.extras.length > 0
  const showFromPrice = item.requires_variant || item.variants.length > 0
  const displayPrice = showFromPrice ? `Desde ${fmt(minVariantPrice(item))}` : fmt(item.base_price)

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault()
    if (!isOpen) return
    addItem({ itemId: item.menu_item_id, itemName: item.name, variantId: null, variantName: null, extras: [], unitPrice: item.base_price })
  }

  const roundBtnCls = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xl font-bold leading-none shadow-sm transition-opacity hover:opacity-90'
  const fullBtnCls = 'flex w-full items-center justify-center rounded-xl py-2 text-white text-sm font-semibold shadow-sm transition-opacity hover:opacity-90'

  const mobileBtn = needsDetail ? (
    <Link href={`/${slug}/menu/producto/${item.menu_item_id}`} className={'md:hidden ' + roundBtnCls} style={{ backgroundColor: accent }} aria-label={`Ver opciones de ${item.name}`}>+</Link>
  ) : (
    <button onClick={handleAdd} disabled={!isOpen} className={'md:hidden ' + roundBtnCls + ' disabled:opacity-40 disabled:cursor-not-allowed'} style={{ backgroundColor: accent }} aria-label={`Agregar ${item.name}`}>+</button>
  )

  const desktopBtn = needsDetail ? (
    <Link href={`/${slug}/menu/producto/${item.menu_item_id}`} className={'hidden md:flex ' + fullBtnCls} style={{ backgroundColor: accent }} aria-label={`Ver opciones de ${item.name}`}>Agregar</Link>
  ) : (
    <button onClick={handleAdd} disabled={!isOpen} className={'hidden md:flex ' + fullBtnCls + ' disabled:opacity-40 disabled:cursor-not-allowed'} style={{ backgroundColor: accent }} aria-label={`Agregar ${item.name}`}>Agregar</button>
  )

  return (
    <div className="flex flex-col bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 hover:shadow-md transition-shadow">
      <div className="relative h-36 overflow-hidden shrink-0">
        {item.image_url ? (
          <Image src={item.image_url} alt={item.name} fill className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-indigo-50">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-14 w-14 text-indigo-200" fill="currentColor">
              <path d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4zm0 6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6 2.69-6 6-6zm0 28.4c-5 0-9.42-2.56-12-6.44.06-3.98 8-6.16 12-6.16 3.99 0 11.94 2.18 12 6.16-2.58 3.88-7 6.44-12 6.44z" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-col flex-1 p-3 gap-1">
        <p className="font-bold text-gray-900 leading-tight" style={{ fontSize: 15 }}>{item.name}</p>
        {item.description && <p className="text-gray-500 text-xs line-clamp-2 leading-snug">{item.description}</p>}
        <div className="flex items-center justify-between mt-auto pt-2 md:hidden">
          <span className="font-bold text-gray-900 text-sm">{displayPrice}</span>
          {mobileBtn}
        </div>
        <div className="hidden md:flex flex-col gap-2 mt-auto pt-2">
          <span className="font-bold text-sm" style={{ color: accent }}>{displayPrice}</span>
          {desktopBtn}
        </div>
      </div>
    </div>
  )
}

// ─── Cart sidebar (desktop md+) ───────────────────────────────────────────────

function CartSidebar({ slug, deliveryMinOrder, accent }: { slug: string; deliveryMinOrder: number; accent: string }) {
  const items = useCartStore((s) => s.items)
  const updateQty = useCartStore((s) => s.updateQty)
  const subtotal = useCartStore((s) => s.subtotal())
  const fmt = useFmt()
  if (items.length === 0) return null
  const showMinWarning = deliveryMinOrder > 0 && subtotal < deliveryMinOrder

  return (
    <aside className="hidden md:flex flex-col w-80 shrink-0">
      <div className="sticky top-[112px] bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-400 shrink-0">
            <path d="M1 1.75A.75.75 0 011.75 1h1.628a1.75 1.75 0 011.734 1.51L5.43 3h13.57a.75.75 0 01.74.873l-1.5 7.5a.75.75 0 01-.74.627h-10a.75.75 0 01-.74-.627L5.245 5.001 5.11 4.26A.25.25 0 004.862 4H1.75A.75.75 0 011 3.25v-1.5zM6 15.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm8.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
          </svg>
          <h2 className="font-bold text-gray-900 text-sm">Tu pedido</h2>
        </div>
        <ul className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
          {items.map((item) => {
            const key = `${item.itemId}:${item.variantId ?? 'none'}:${item.extras.map((e) => e.id).join(',')}`
            return (
              <li key={key} className="flex gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.itemName}</p>
                  {item.variantName && <p className="text-xs text-gray-500 truncate">{item.variantName}</p>}
                  {item.extras.length > 0 && <p className="text-xs text-gray-500 truncate">{item.extras.map((e) => e.name).join(', ')}</p>}
                  <p className="text-xs text-gray-700 mt-0.5">{fmt(item.unitPrice * item.qty)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => updateQty(item.itemId, item.variantId, item.extras, item.qty - 1)} className="h-6 w-6 rounded-full bg-gray-100 text-gray-700 text-base flex items-center justify-center hover:bg-gray-200 leading-none" aria-label="Reducir cantidad">−</button>
                  <span className="text-sm w-4 text-center tabular-nums">{item.qty}</span>
                  <button onClick={() => updateQty(item.itemId, item.variantId, item.extras, item.qty + 1)} className="h-6 w-6 rounded-full text-white text-base flex items-center justify-center hover:opacity-90 leading-none" style={{ backgroundColor: accent }} aria-label="Aumentar cantidad">+</button>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="p-4 border-t border-gray-100 space-y-3">
          {showMinWarning && (
            <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 leading-snug">
              Mínimo de delivery {fmt(deliveryMinOrder)} · Te faltan <span className="font-semibold">{fmt(deliveryMinOrder - subtotal)}</span>
            </p>
          )}
          <div className="flex justify-between text-sm font-semibold text-gray-900">
            <span>Subtotal</span>
            <span>{fmt(subtotal)}</span>
          </div>
          <Link href={`/${slug}/carrito`} className="block w-full text-center rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ backgroundColor: accent }}>
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
      <Link href={`/${slug}/carrito`} className="flex items-center gap-3 rounded-2xl px-5 text-white shadow-xl w-full justify-between" style={{ backgroundColor: accent, minHeight: 52 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0">
          <path d="M1 1.75A.75.75 0 011.75 1h1.628a1.75 1.75 0 011.734 1.51L5.43 3h13.57a.75.75 0 01.74.873l-1.5 7.5a.75.75 0 01-.74.627h-10a.75.75 0 01-.74-.627L5.245 5.001 5.11 4.26A.25.25 0 004.862 4H1.75A.75.75 0 011 3.25v-1.5zM6 15.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm8.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        </svg>
        <span className="text-sm font-semibold">Ver pedido ({itemCount})</span>
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
  const moneda: string = menu.moneda ?? restaurant.moneda ?? 'EUR'
  const setMoneda = useCartStore((s) => s.setMoneda)
  useEffect(() => { setMoneda(moneda) }, [moneda, setMoneda])

  const activeCategories = categories
    .filter((c) => c.items.some((i) => i.is_active))
    .sort((a, b) => a.sort_order - b.sort_order)

  const [activeTab, setActiveTab] = useState<number | null>(activeCategories[0]?.menu_category_id ?? null)
  const sectionRefs = useRef<Record<number, HTMLElement | null>>({})

  function scrollToCategory(id: number) {
    setActiveTab(id)
    const el = sectionRefs.current[id]
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 120
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-4 md:pb-8">
      {!isOpen && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-center text-sm text-amber-800">
          <span className="font-semibold">Local cerrado.</span>
          {restaurant.next_opening && <>{' '}Vuelve a abrir: <span className="font-semibold">{restaurant.next_opening}</span></>}
        </div>
      )}

      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 max-w-5xl mx-auto" style={{ height: 56 }}>
          {restaurant.logo_url ? (
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl">
              <Image src={restaurant.logo_url} alt={`Logo ${restaurant.name}`} fill className="object-cover" />
            </div>
          ) : (
            <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-white font-bold text-base" style={{ backgroundColor: accent }}>
              {restaurant.name?.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="flex-1 min-w-0 font-semibold text-gray-900 text-sm truncate max-w-[160px] md:max-w-none">{restaurant.name}</p>
          {isOpen ? (
            <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Abierto
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 shrink-0">
              <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
              Cerrado
            </span>
          )}
        </div>

        {activeCategories.length > 0 && (
          <nav className="border-t border-gray-100 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
            <div className="flex px-3 gap-1 min-w-max py-2">
              {activeCategories.map((cat) => (
                <button
                  key={cat.menu_category_id}
                  onClick={() => scrollToCategory(cat.menu_category_id)}
                  className={activeTab === cat.menu_category_id
                    ? 'shrink-0 px-4 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors bg-indigo-100 text-indigo-700'
                    : 'shrink-0 px-4 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors text-gray-500 hover:bg-gray-100 hover:text-gray-700'}
                  style={{ fontSize: 13 }}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </nav>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-4 py-4 md:py-6 flex gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-8 md:space-y-10">
          {activeCategories.map((cat) => {
            const visibleItems = cat.items.filter((i) => i.is_active)
            return (
              <section key={cat.menu_category_id} ref={(el) => { sectionRefs.current[cat.menu_category_id] = el }}>
                <h2 className="text-base font-bold text-gray-900 mb-4">{cat.name}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
                  {visibleItems.map((item) => (
                    <ProductCard key={item.menu_item_id} item={item} slug={slug} isOpen={isOpen} accent={accent} />
                  ))}
                </div>
              </section>
            )
          })}
          {activeCategories.length === 0 && (
            <p className="text-center text-gray-500 py-16">No hay productos disponibles.</p>
          )}
        </div>
        <CartSidebar slug={slug} deliveryMinOrder={deliveryMinOrder} accent={accent} />
      </div>

      <div className="h-20 md:hidden" />
      <CartFloatingButton slug={slug} accent={accent} />
    </div>
  )
}
