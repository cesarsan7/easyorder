'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import type { MenuItem, MenuVariant, Extra } from '@/types/api'
import { useCartStore } from '@/lib/store/cart'
import { fmtPrice } from '@/lib/fmt'

const ACCENT_FALLBACK = '#E63946'

export default function ProductoPage() {
  const { slug, item_id } = useParams<{ slug: string; item_id: string }>()
  const router = useRouter()
  const addItem = useCartStore((s) => s.addItem)
  const moneda = useCartStore((s) => s.moneda)
  const fmt = (n: number) => fmtPrice(n, moneda)

  const [item, setItem] = useState<MenuItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<MenuVariant | null>(null)
  const [selectedExtras, setSelectedExtras] = useState<Extra[]>([])
  const [qty, setQty] = useState(1)

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL
    fetch(`${base}/public/${slug}/menu`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((d) => {
        // Find the item across all categories
        const allItems = (d.categories ?? []).flatMap((c: any) => c.items ?? [])
        const found = allItems.find((i: any) => String(i.menu_item_id) === String(item_id))
        if (!found) throw new Error('not found')
        setItem(found)
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false))
  }, [slug, item_id])

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-gray-500 animate-spin" />
      </main>
    )
  }

  if (fetchError || !item) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-gray-500">Producto no disponible.</p>
        <button
          onClick={() => router.push(`/${slug}/menu`)}
          className="text-sm text-blue-600 underline"
        >
          Volver al menú
        </button>
      </main>
    )
  }

  const accent = ACCENT_FALLBACK
  const basePrice = selectedVariant ? selectedVariant.price : item.base_price
  const extrasTotal = selectedExtras.reduce((s, e) => s + (e.price ?? 0), 0)
  const lineTotal = (basePrice + extrasTotal) * qty
  const canAdd = item.variants.length === 0 || selectedVariant !== null

  function toggleExtra(extra: Extra) {
    setSelectedExtras((prev) =>
      prev.some((e) => e.extra_id === extra.extra_id)
        ? prev.filter((e) => e.extra_id !== extra.extra_id)
        : [...prev, extra],
    )
  }

  function handleAdd() {
    if (!canAdd || !item) return
    addItem({
      itemId: Number(item.menu_item_id),
      itemName: item.name,
      variantId: selectedVariant ? Number(selectedVariant.menu_variant_id) : null,
      variantName: selectedVariant?.variant_name ?? null,
      extras: selectedExtras.map((e) => ({ id: Number(e.extra_id), name: e.name, price: e.price ?? 0 })),
      unitPrice: basePrice + extrasTotal,
      qty,
    })
    router.push(`/${slug}/menu`)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="max-w-lg mx-auto">
        {/* Product image */}
        <div className="relative h-56 sm:h-72 w-full bg-gray-100 overflow-hidden">
          {item.image_url ? (
            <Image src={item.image_url} alt={item.name} fill className="object-cover" priority />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-7xl font-bold text-white select-none"
              style={{ backgroundColor: accent }}
            >
              {item.name.charAt(0).toUpperCase()}
            </div>
          )}
          <button
            onClick={() => router.push(`/${slug}/menu`)}
            className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-800 shadow backdrop-blur-sm hover:bg-white transition-colors"
            aria-label="Volver al menú"
          >
            ← Volver
          </button>
        </div>

        <div className="bg-white px-5 pt-5 pb-6 space-y-6">
          {/* Name + description */}
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">{item.name}</h1>
            {item.description && (
              <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">{item.description}</p>
            )}
          </div>

          {/* Variant selector */}
          {item.variants.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-2.5">
                Tamaño / variante
                {item.requires_variant && <span className="ml-1 text-red-500">*</span>}
              </h2>
              <div className="space-y-2">
                {item.variants.map((v) => {
                  const active = selectedVariant?.menu_variant_id === v.menu_variant_id
                  return (
                    <label
                      key={v.menu_variant_id}
                      className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors"
                      style={
                        active
                          ? { borderColor: accent, backgroundColor: `${accent}12` }
                          : { borderColor: '#e5e7eb' }
                      }
                    >
                      <input
                        type="radio"
                        name="variant"
                        value={v.menu_variant_id}
                        checked={active}
                        onChange={() => setSelectedVariant(v)}
                        className="sr-only"
                      />
                      <div
                        className="h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors"
                        style={{ borderColor: active ? accent : '#d1d5db' }}
                      >
                        {active && (
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                        )}
                      </div>
                      <span className="flex-1 text-sm text-gray-900">{v.variant_name}</span>
                      <span className="text-sm font-semibold text-gray-900">{fmt(v.price)}</span>
                    </label>
                  )
                })}
              </div>
              {item.variants.length > 0 && !selectedVariant && (
                <p className="mt-2 text-xs text-red-500">Selecciona una opción para continuar</p>
              )}
            </div>
          )}

          {/* Extras */}
          {item.extras.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-2.5">
                Extras{' '}
                <span className="font-normal text-gray-400">(opcional)</span>
              </h2>
              <div className="space-y-2">
                {item.extras.map((extra) => {
                  const checked = selectedExtras.some((e) => e.extra_id === extra.extra_id)
                  return (
                    <label
                      key={extra.extra_id}
                      className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors"
                      style={
                        checked
                          ? { borderColor: accent, backgroundColor: `${accent}12` }
                          : { borderColor: '#e5e7eb' }
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleExtra(extra)}
                        className="sr-only"
                      />
                      <div
                        className="h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors"
                        style={
                          checked
                            ? { borderColor: accent, backgroundColor: accent }
                            : { borderColor: '#d1d5db' }
                        }
                      >
                        {checked && (
                          <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                            <path
                              d="M1.5 5l3 3 4-4"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <span className="flex-1 text-sm text-gray-900">{extra.name}</span>
                      <span className="text-sm text-gray-600">+{fmt(extra.price ?? 0)}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quantity + real-time total */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="h-9 w-9 rounded-full bg-gray-100 text-gray-700 text-xl flex items-center justify-center hover:bg-gray-200 leading-none"
                aria-label="Reducir cantidad"
              >
                −
              </button>
              <span className="w-6 text-center text-base font-semibold tabular-nums">{qty}</span>
              <button
                onClick={() => setQty((q) => q + 1)}
                className="h-9 w-9 rounded-full text-white text-xl flex items-center justify-center hover:opacity-90 leading-none"
                style={{ backgroundColor: accent }}
                aria-label="Aumentar cantidad"
              >
                +
              </button>
            </div>
            <p className="text-xl font-bold text-gray-900 tabular-nums">{fmt(lineTotal)}</p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2.5 pt-1">
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: accent }}
            >
              Agregar al pedido · {fmt(lineTotal)}
            </button>
            <button
              onClick={() => router.push(`/${slug}/menu`)}
              className="w-full rounded-2xl border border-gray-200 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
