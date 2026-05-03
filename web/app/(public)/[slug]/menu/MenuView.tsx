'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { MenuPublicResponse, RestaurantPublicResponse, MenuItem, RedSocial } from '@/types/api'
import { useCartStore } from '@/lib/store/cart'
import { fmtPrice } from '@/lib/fmt'

interface Props {
  slug: string
  menu: MenuPublicResponse
  restaurant: RestaurantPublicResponse
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return [parseInt(full.slice(0,2),16), parseInt(full.slice(2,4),16), parseInt(full.slice(4,6),16)]
}
function accentLightBg(hex: string)   { const [r,g,b] = hexToRgb(hex); return `rgba(${r},${g},${b},0.08)` }
function accentLightPill(hex: string)  { const [r,g,b] = hexToRgb(hex); return `rgba(${r},${g},${b},0.13)` }

const FALLBACK_ACCENT = '#6366F1'

// ── Category icon map ─────────────────────────────────────────────────────────
const CAT_ICONS: [string, string][] = [
  ['pizza',       '🍕'], ['hamburguesa','🍔'], ['burger',    '🍔'],
  ['pasta',       '🍝'], ['spaghetti',  '🍝'], ['sushi',     '🍣'],
  ['japonés',     '🍣'], ['ensalada',   '🥗'], ['salad',     '🥗'],
  ['pollo',       '🍗'], ['chicken',    '🍗'], ['bebida',    '🥤'],
  ['drink',       '🥤'], ['refresco',   '🥤'], ['postre',    '🍰'],
  ['helado',      '🍦'], ['dulce',      '🍮'], ['entrada',   '🥙'],
  ['sopa',        '🍲'], ['soup',       '🍲'], ['carne',     '🥩'],
  ['mariscos',    '🦐'], ['seafood',    '🦐'], ['sandwich',  '🥪'],
  ['sándwich',    '🥪'], ['taco',       '🌮'], ['mexicano',  '🌮'],
  ['café',        '☕'], ['coffee',     '☕'], ['desayuno',  '🍳'],
  ['breakfast',   '🍳'], ['vegano',     '🌱'], ['vegetariano','🥦'],
  ['arroz',       '🍚'], ['rice',       '🍚'], ['fries',     '🍟'],
  ['papas',       '🍟'], ['alitas',     '🍗'], ['wings',     '🍗'],
  ['especial',    '⭐'], ['oferta',     '🔥'], ['nuevo',     '✨'],
]
function getCatIcon(name: string): string {
  const low = name.toLowerCase()
  for (const [k, icon] of CAT_ICONS) { if (low.includes(k)) return icon }
  return '🍽️'
}

// ── Social media icons (inline SVG paths) ─────────────────────────────────────
const SOCIAL_ICONS: Record<string, JSX.Element> = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  ),
  telegram: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ),
  pinterest: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
    </svg>
  ),
  web: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
}

function SocialLink({ red, url }: RedSocial) {
  const icon = SOCIAL_ICONS[red] ?? SOCIAL_ICONS['web']
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center justify-center h-9 w-9 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
      aria-label={red}>
      {icon}
    </a>
  )
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
function ProductCard({ item, slug, isOpen, accent, catName }: {
  item: MenuItem; slug: string; isOpen: boolean; accent: string; catName: string
}) {
  const addItem    = useCartStore((s) => s.addItem)
  const fmt        = useFmt()
  const needsDetail   = item.variants.length > 0 || item.extras.length > 0
  const showFromPrice = item.requires_variant || item.variants.length > 0
  const displayPrice  = showFromPrice ? `Desde ${fmt(minVariantPrice(item))}` : fmt(item.base_price)

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault()
    if (!isOpen) return
    addItem({ itemId: item.menu_item_id, itemName: item.name, variantId: null, variantName: null, extras: [], unitPrice: item.base_price })
  }

  const btnBase = 'flex items-center justify-center rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 active:scale-95'

  const mobileBtn = needsDetail ? (
    <Link href={`/${slug}/menu/producto/${item.menu_item_id}`}
      className={'h-8 w-8 shrink-0 rounded-full shadow-sm md:hidden ' + btnBase}
      style={{ backgroundColor: accent }}>+</Link>
  ) : (
    <button onClick={handleAdd} disabled={!isOpen}
      className={'h-8 w-8 shrink-0 rounded-full shadow-sm md:hidden ' + btnBase + ' disabled:opacity-40'}
      style={{ backgroundColor: accent }}>+</button>
  )

  const desktopBtn = needsDetail ? (
    <Link href={`/${slug}/menu/producto/${item.menu_item_id}`}
      className={'hidden md:flex w-full py-2 mt-1 ' + btnBase}
      style={{ backgroundColor: accent }}>Agregar</Link>
  ) : (
    <button onClick={handleAdd} disabled={!isOpen}
      className={'hidden md:flex w-full py-2 mt-1 ' + btnBase + ' disabled:opacity-40'}
      style={{ backgroundColor: accent }}>Agregar</button>
  )

  const catEmoji = getCatIcon(catName)

  return (
    <div className="flex flex-col bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      {/* Image */}
      <div className="relative h-36 shrink-0 overflow-hidden">
        {item.image_url ? (
          <Image src={item.image_url} alt={item.name} fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center flex-col gap-1 select-none"
            style={{ backgroundColor: accentLightBg(accent) }}>
            <span className="text-4xl leading-none">{catEmoji}</span>
            <span className="text-xs font-medium opacity-40" style={{ color: accent }}>Sin foto</span>
          </div>
        )}
      </div>
      {/* Body */}
      <div className="flex flex-col flex-1 p-3">
        <p className="font-bold text-gray-900 leading-tight text-sm">{item.name}</p>
        {item.description && (
          <p className="text-gray-400 text-xs line-clamp-2 leading-relaxed mt-0.5">{item.description}</p>
        )}
        {/* Mobile: price + round button */}
        <div className="flex items-center justify-between mt-auto pt-2 md:hidden">
          <span className="font-bold text-sm text-gray-900">{displayPrice}</span>
          {mobileBtn}
        </div>
        {/* Desktop: price + full button */}
        <div className="hidden md:flex flex-col mt-auto pt-2">
          <span className="font-semibold text-sm" style={{ color: accent }}>{displayPrice}</span>
          {desktopBtn}
        </div>
      </div>
    </div>
  )
}

// ─── Cart sidebar (desktop) ───────────────────────────────────────────────────
function CartSidebar({ slug, deliveryMinOrder, accent }: { slug: string; deliveryMinOrder: number; accent: string }) {
  const items     = useCartStore((s) => s.items)
  const updateQty = useCartStore((s) => s.updateQty)
  const subtotal  = useCartStore((s) => s.subtotal())
  const fmt       = useFmt()
  if (items.length === 0) return null
  const showMinWarning = deliveryMinOrder > 0 && subtotal < deliveryMinOrder

  return (
    <aside className="hidden md:flex flex-col w-72 shrink-0">
      <div className="sticky top-[120px] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" style={{ color: accent }}>
            <path d="M1 1.75A.75.75 0 011.75 1h1.628a1.75 1.75 0 011.734 1.51L5.43 3h13.57a.75.75 0 01.74.873l-1.5 7.5a.75.75 0 01-.74.627h-10a.75.75 0 01-.74-.627L5.245 5.001 5.11 4.26A.25.25 0 004.862 4H1.75A.75.75 0 011 3.25v-1.5zM6 15.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm8.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
          </svg>
          <h2 className="font-bold text-gray-900 text-sm">Tu pedido</h2>
        </div>
        <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
          {items.map((item) => {
            const key = `${item.itemId}:${item.variantId ?? 'none'}:${item.extras.map((e) => e.id).join(',')}`
            return (
              <li key={key} className="flex gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.itemName}</p>
                  {item.variantName && <p className="text-xs text-gray-400 truncate">{item.variantName}</p>}
                  {item.extras.length > 0 && <p className="text-xs text-gray-400 truncate">{item.extras.map((e) => e.name).join(', ')}</p>}
                  <p className="text-xs font-medium text-gray-700 mt-0.5">{fmt(item.unitPrice * item.qty)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => updateQty(item.itemId, item.variantId, item.extras, item.qty - 1)}
                    className="h-6 w-6 rounded-full bg-gray-100 text-gray-600 text-base flex items-center justify-center hover:bg-gray-200 leading-none">−</button>
                  <span className="text-sm w-4 text-center tabular-nums font-medium">{item.qty}</span>
                  <button onClick={() => updateQty(item.itemId, item.variantId, item.extras, item.qty + 1)}
                    className="h-6 w-6 rounded-full text-white text-base flex items-center justify-center hover:opacity-90 leading-none"
                    style={{ backgroundColor: accent }}>+</button>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="p-4 border-t border-gray-100 space-y-3">
          {showMinWarning && (
            <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 leading-snug">
              Mínimo delivery {fmt(deliveryMinOrder)} · Faltan <span className="font-semibold">{fmt(deliveryMinOrder - subtotal)}</span>
            </p>
          )}
          <div className="flex justify-between text-sm font-semibold text-gray-900">
            <span>Subtotal</span><span>{fmt(subtotal)}</span>
          </div>
          <Link href={`/${slug}/carrito`}
            className="block w-full text-center rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent }}>
            Confirmar pedido →
          </Link>
        </div>
      </div>
    </aside>
  )
}

// ─── Cart floating button (mobile) ───────────────────────────────────────────
function CartFloatingButton({ slug, accent }: { slug: string; accent: string }) {
  const itemCount = useCartStore((s) => s.itemCount())
  const total     = useCartStore((s) => s.total())
  const fmt       = useFmt()
  if (itemCount === 0) return null
  return (
    <div className="md:hidden fixed bottom-5 left-0 right-0 px-4 z-50">
      <Link href={`/${slug}/carrito`}
        className="flex items-center gap-3 rounded-2xl px-5 text-white shadow-xl w-full justify-between"
        style={{ backgroundColor: accent, minHeight: 52 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0">
          <path d="M1 1.75A.75.75 0 011.75 1h1.628a1.75 1.75 0 011.734 1.51L5.43 3h13.57a.75.75 0 01.74.873l-1.5 7.5a.75.75 0 01-.74.627h-10a.75.75 0 01-.74-.627L5.245 5.001 5.11 4.26A.25.25 0 004.862 4H1.75A.75.75 0 011 3.25v-1.5zM6 15.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm8.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        </svg>
        <span className="text-sm font-semibold">Ver pedido ({itemCount})</span>
        <span className="text-sm font-semibold tabular-nums">{fmt(total)}</span>
      </Link>
    </div>
  )
}

// ─── Social footer ────────────────────────────────────────────────────────────
function SocialFooter({ name }: { name: string }) {
  return (
    <footer className="border-t border-gray-100 mt-8 pb-10 md:pb-6">
      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold text-gray-500">{name}</p>
        <p className="text-xs text-gray-300">Pedidos online · EasyOrder</p>
      </div>
    </footer>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function MenuView({ slug, menu, restaurant }: Props) {
  const { categories } = menu
  const accent   = restaurant.brand_color ?? FALLBACK_ACCENT
  const isOpen   = restaurant.is_open
  const deliveryMinOrder = menu.delivery_min_order ?? restaurant.delivery_min_order ?? 0
  const moneda: string = menu.moneda ?? restaurant.moneda ?? 'EUR'
  const setMoneda      = useCartStore((s) => s.setMoneda)
  const setAccentColor = useCartStore((s) => s.setAccentColor)
  useEffect(() => {
    setMoneda(moneda)
    setAccentColor(accent)
  }, [moneda, accent, setMoneda, setAccentColor])

  const activeCategories = categories
    .filter((c) => c.items.some((i) => i.is_active))
    .sort((a, b) => a.sort_order - b.sort_order)

  const [activeTab, setActiveTab] = useState<number | null>(activeCategories[0]?.menu_category_id ?? null)
  const sectionRefs = useRef<Record<number, HTMLElement | null>>({})

  function scrollToCategory(id: number) {
    setActiveTab(id)
    const el = sectionRefs.current[id]
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 130
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  return (
    <div className="min-h-screen pb-4 md:pb-10" style={{ backgroundColor: '#F8FAFC' }}>

      {/* ── Sticky header (includes banners) ─────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100" style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.07)' }}>

        {/* Promo banner — stays visible while scrolling */}
        {restaurant.texto_banner && (
          <div className="px-4 py-2 text-center text-xs font-semibold text-white tracking-wide" style={{ backgroundColor: accent }}>
            {restaurant.texto_banner}
          </div>
        )}

        {/* Closed banner */}
        {!isOpen && (
          <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-800">
            <span className="font-semibold">Local cerrado.</span>
            {restaurant.next_opening && <>{' '}Vuelve a abrir: <span className="font-semibold">{restaurant.next_opening}</span></>}
          </div>
        )}

        {/* Brand bar */}
        <div className="flex items-center gap-3 px-4 max-w-5xl mx-auto" style={{ height: 52 }}>
          {restaurant.logo_url ? (
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg">
              <Image src={restaurant.logo_url} alt={`Logo ${restaurant.name}`} fill className="object-cover" />
            </div>
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: accent }}>
              {restaurant.name?.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm truncate leading-tight">{restaurant.name}</p>
            {restaurant.eslogan && <p className="text-xs text-gray-400 truncate leading-tight">{restaurant.eslogan}</p>}
          </div>

          {/* Redes sociales — visible solo en desktop */}
          {(() => {
            const validRedes = (restaurant.redes_sociales ?? []).filter(r => r.url?.trim())
            return validRedes.length > 0 ? (
              <div className="hidden md:flex items-center gap-1.5 shrink-0">
                {validRedes.slice(0, 5).map(r => (
                  <a key={r.red} href={r.url} target="_blank" rel="noopener noreferrer"
                    aria-label={r.red}
                    className="flex items-center justify-center h-7 w-7 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                    style={{ color: accent }}
                  >
                    {SOCIAL_ICONS[r.red] ?? SOCIAL_ICONS['web']}
                  </a>
                ))}
              </div>
            ) : null
          })()}

          {isOpen ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Abierto
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-500 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 shrink-0" />
              Cerrado
            </span>
          )}
        </div>

        {/* Category tabs with icons */}
        {activeCategories.length > 0 && (
          <nav className="border-t border-gray-100 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
            <div className="flex px-3 gap-1 min-w-max py-2">
              {activeCategories.map((cat) => {
                const isActive = activeTab === cat.menu_category_id
                return (
                  <button key={cat.menu_category_id} onClick={() => scrollToCategory(cat.menu_category_id)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full whitespace-nowrap transition-all"
                    style={{
                      fontSize: 12,
                      backgroundColor: isActive ? accentLightPill(accent) : 'transparent',
                      color: isActive ? accent : '#6B7280',
                      fontWeight: isActive ? 700 : 500,
                    }}>
                    <span style={{ fontSize: 14 }}>{getCatIcon(cat.name)}</span>
                    {cat.name}
                  </button>
                )
              })}
            </div>
          </nav>
        )}
      </header>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-5 md:py-7 flex gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-8 md:space-y-10">
          {activeCategories.map((cat) => {
            const visibleItems = cat.items.filter((i) => i.is_active)
            const catIcon = getCatIcon(cat.name)
            return (
              <section key={cat.menu_category_id} ref={(el) => { sectionRefs.current[cat.menu_category_id] = el }}>
                {/* Category header */}
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="text-xl leading-none">{catIcon}</span>
                  <h2 className="text-base font-bold text-gray-900">{cat.name}</h2>
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400 font-medium shrink-0">{visibleItems.length} item{visibleItems.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
                  {visibleItems.map((item) => (
                    <ProductCard key={item.menu_item_id} item={item} slug={slug} isOpen={isOpen} accent={accent} catName={cat.name} />
                  ))}
                </div>
              </section>
            )
          })}
          {activeCategories.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
              <span className="text-5xl">🍽️</span>
              <p className="text-sm">No hay productos disponibles.</p>
            </div>
          )}
        </div>
        <CartSidebar slug={slug} deliveryMinOrder={deliveryMinOrder} accent={accent} />
      </div>

      <SocialFooter name={restaurant.name} />
      <div className="h-20 md:hidden" />
      <CartFloatingButton slug={slug} accent={accent} />
    </div>
  )
}
