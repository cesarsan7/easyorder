'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCartStore, CartItem } from '@/lib/store/cart'
import { fmtPrice } from '@/lib/fmt'

const ACCENT = '#E63946'

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  )
}

interface PriceChangeNotice {
  itemName: string
  oldPrice: number
  newPrice: number
}

export default function CarritoPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()

  const items = useCartStore((s) => s.items)
  const updateQty = useCartStore((s) => s.updateQty)
  const removeItem = useCartStore((s) => s.removeItem)
  const subtotalFn = useCartStore((s) => s.subtotal)
  const subtotal = subtotalFn()
  const moneda = useCartStore((s) => s.moneda)
  const fmt = (n: number) => fmtPrice(n, moneda)

  const [validating, setValidating] = useState(false)
  const [priceChanges, setPriceChanges] = useState<PriceChangeNotice[]>([])

  function handleQtyChange(item: CartItem, delta: number) {
    const next = item.qty + delta
    if (next <= 0) {
      removeItem(item.itemId, item.variantId, item.extras)
    } else {
      updateQty(item.itemId, item.variantId, item.extras, next)
    }
  }

  async function handleContinue() {
    if (items.length === 0) return

    setValidating(true)
    setPriceChanges([])

    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const payload = items.map((i) => ({
        menu_item_id: i.itemId,
        menu_variant_id: i.variantId,
        extras: i.extras.map((e) => e.id),
        unit_price: i.unitPrice,
      }))

      const res = await fetch(`${base}/public/${slug}/cart/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      })

      if (!res.ok) throw new Error('validate_failed')

      const data: {
        valid: boolean
        changes?: Array<{
          menu_item_id: number
          menu_variant_id: number | null
          item_name: string
          old_price: number
          new_price: number
        }>
      } = await res.json()

      if (!data.valid && data.changes && data.changes.length > 0) {
        const storeItems = useCartStore.getState().items

        const notices: PriceChangeNotice[] = []

        for (const change of data.changes) {
          const match = storeItems.find(
            (i) =>
              i.itemId === change.menu_item_id &&
              i.variantId === change.menu_variant_id,
          )
          if (match) {
            useCartStore.setState((s) => ({
              items: s.items.map((i) =>
                i.itemId === match.itemId && i.variantId === match.variantId
                  ? { ...i, unitPrice: change.new_price }
                  : i,
              ),
            }))
            notices.push({
              itemName: change.item_name,
              oldPrice: change.old_price,
              newPrice: change.new_price,
            })
          }
        }

        setPriceChanges(notices)
        return
      }

      router.push(`/${slug}/checkout/datos`)
    } catch {
      // Si el endpoint de validación falla (red, CORS, no implementado),
      // navegamos de todos modos — la validación de precios no es bloqueante en MVP.
      router.push(`/${slug}/checkout/datos`)
    } finally {
      setValidating(false)
    }
  }

  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-5 px-6">
        <div className="text-5xl select-none">🛒</div>
        <p className="text-gray-600 text-center text-sm leading-relaxed">
          Tu carrito está vacío.
          <br />
          Agrega productos desde el menú.
        </p>
        <button
          onClick={() => router.push(`/${slug}/menu`)}
          className="rounded-2xl py-3 px-8 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: ACCENT }}
        >
          Volver al menú
        </button>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-36">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-white px-5 pt-6 pb-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/${slug}/menu`)}
              className="text-gray-500 hover:text-gray-800 transition-colors"
              aria-label="Volver al menú"
            >
              ←
            </button>
            <h1 className="text-xl font-bold text-gray-900">Tu pedido</h1>
          </div>
        </div>

        {/* Price change notice */}
        {priceChanges.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <p className="font-semibold text-amber-800 mb-1">Precios actualizados</p>
            <p className="text-amber-700 mb-2">
              Algunos precios cambiaron. Revisa tu pedido y continúa.
            </p>
            <ul className="space-y-1">
              {priceChanges.map((c, i) => (
                <li key={i} className="text-amber-700 flex gap-1">
                  <span className="font-medium">{c.itemName}:</span>
                  <span className="line-through text-amber-500">{fmt(c.oldPrice)}</span>
                  <span>→ {fmt(c.newPrice)}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setPriceChanges([])}
              className="mt-2 text-xs text-amber-600 underline"
            >
              Entendido, continuar
            </button>
          </div>
        )}

        {/* Item list */}
        <div className="mt-4 bg-white rounded-2xl mx-4 divide-y divide-gray-100 overflow-hidden shadow-sm">
          {items.map((item) => {
            const lineTotal = item.unitPrice * item.qty
            const extrasLabel = item.extras.map((e) => e.name).join(', ')

            return (
              <div
                key={`${item.itemId}:${item.variantId ?? 'none'}:${item.extras.map((e) => e.id).join(',')}`}
                className="px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 leading-tight">{item.itemName}</p>
                    {item.variantName && (
                      <p className="text-xs text-gray-500 mt-0.5">{item.variantName}</p>
                    )}
                    {extrasLabel && (
                      <p className="text-xs text-gray-400 mt-0.5">+ {extrasLabel}</p>
                    )}
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => removeItem(item.itemId, item.variantId, item.extras)}
                    className="text-gray-300 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                    aria-label={`Eliminar ${item.itemName}`}
                  >
                    <TrashIcon />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-3">
                  {/* Qty controls */}
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => handleQtyChange(item, -1)}
                      className="h-8 w-8 rounded-full bg-gray-100 text-gray-700 text-lg flex items-center justify-center hover:bg-gray-200 leading-none"
                      aria-label="Reducir cantidad"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => handleQtyChange(item, +1)}
                      className="h-8 w-8 rounded-full text-white text-lg flex items-center justify-center hover:opacity-90 leading-none"
                      style={{ backgroundColor: ACCENT }}
                      aria-label="Aumentar cantidad"
                    >
                      +
                    </button>
                  </div>

                  {/* Line price */}
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900 tabular-nums">{fmt(lineTotal)}</p>
                    {item.qty > 1 && (
                      <p className="text-xs text-gray-400 tabular-nums">
                        {fmt(item.unitPrice)} × {item.qty}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Summary */}
        <div className="mx-4 mt-4 bg-white rounded-2xl px-4 py-4 shadow-sm space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span className="tabular-nums">{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-100 pt-2">
            <span>Total provisional</span>
            <span className="tabular-nums">{fmt(subtotal)}</span>
          </div>
          <p className="text-xs text-gray-400 pt-0.5">
            El costo de envío se calcula en el siguiente paso.
          </p>
        </div>

        {/* Add more */}
        <div className="mx-4 mt-3">
          <button
            onClick={() => router.push(`/${slug}/menu`)}
            className="w-full rounded-2xl border border-gray-200 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            + Agregar más productos
          </button>
        </div>
      </div>

      {/* Sticky footer CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 z-20 shadow-lg">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleContinue}
            disabled={validating || items.length === 0}
            className="w-full rounded-2xl py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: ACCENT }}
          >
            {validating ? 'Verificando precios…' : 'Continuar con el pedido'}
          </button>
        </div>
      </div>
    </main>
  )
}
