'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCartStore } from '@/lib/store/cart'

const PHONE_PREFIX = '+34'

const STEPS = ['Datos', 'Despacho', 'Pago', 'Confirmar'] as const

function ProgressBar({ current, accent }: { current: number; accent: string }) {
  return (
    <div className="flex items-center gap-1 px-5 py-4">
      {STEPS.map((label, i) => {
        const active = i === current
        const done = i < current
        return (
          <div key={label} className="flex items-center gap-1 flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: active || done ? accent : '#D1D5DB' }}
              />
              <span
                className="text-[10px] font-medium whitespace-nowrap"
                style={{ color: active ? accent : done ? '#6B7280' : '#9CA3AF' }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="flex-1 h-px mb-3 mx-1"
                style={{ backgroundColor: done ? accent : '#E5E7EB' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function CheckoutDatosPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()

  const isCartEmpty   = useCartStore((s) => s.isCartEmpty)
  const customerName  = useCartStore((s) => s.customerName)
  const customerPhone = useCartStore((s) => s.customerPhone)
  const setCustomer   = useCartStore((s) => s.setCustomer)
  const accent        = useCartStore((s) => s.accentColor)

  const [name, setName] = useState(customerName)
  const [phone, setPhone] = useState(customerPhone)
  const [lookupLoading, setLookupLoading] = useState(false)
  const lastLookedUp = useRef('')

  useEffect(() => {
    if (isCartEmpty()) {
      router.replace(`/${slug}/menu`)
    }
  }, [isCartEmpty, router, slug])

  async function handlePhoneBlur() {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 9) return
    if (phone === lastLookedUp.current) return

    lastLookedUp.current = phone
    setLookupLoading(true)

    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const res = await fetch(
        `${base}/public/${slug}/customer/lookup?phone=${encodeURIComponent(phone)}`,
      )
      if (!res.ok) return
      const data: { name?: string } = await res.json()
      if (data.name && !name) {
        setName(data.name)
      }
    } catch {
      // lookup es best-effort; el usuario completa manualmente si falla
    } finally {
      setLookupLoading(false)
    }
  }

  /** Normaliza a +34XXXXXXXXX si el usuario no puso código de país */
  function normalizePhone(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return trimmed
    if (trimmed.startsWith('+')) return trimmed
    // Solo dígitos → prefijo +34 (España)
    const digits = trimmed.replace(/\D/g, '')
    return `+34${digits}`
  }

  function handleContinue() {
    const trimName  = name.trim()
    const trimPhone = phone.trim()
    if (!trimName || !trimPhone) return
    setCustomer(trimName, normalizePhone(trimPhone))
    router.push(`/${slug}/checkout/despacho`)
  }

  const canContinue = name.trim().length > 0 && phone.trim().length > 0

  return (
    <main className="min-h-screen bg-gray-50 pb-36">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-white px-5 pt-6 pb-2 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={() => router.back()}
              className="text-gray-500 hover:text-gray-800 transition-colors"
              aria-label="Volver"
            >
              ←
            </button>
            <h1 className="text-xl font-bold text-gray-900">Checkout</h1>
          </div>
          <ProgressBar current={0} accent={accent} />
        </div>

        {/* Form card */}
        <div className="mx-4 mt-6 bg-white rounded-2xl px-5 py-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-5">
            ¿A nombre de quién va el pedido?
          </h2>

          {/* Nombre */}
          <div className="mb-4">
            <label
              htmlFor="customer-name"
              className="block text-xs font-medium text-gray-600 mb-1.5"
            >
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              id="customer-name"
              type="text"
              autoComplete="given-name"
              placeholder="Tu nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition"
              style={{ '--tw-ring-color': accent } as React.CSSProperties}
            />
          </div>

          {/* Teléfono */}
          <div className="mb-2">
            <label
              htmlFor="customer-phone"
              className="block text-xs font-medium text-gray-600 mb-1.5"
            >
              Teléfono <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="flex items-center rounded-xl border border-gray-200 px-3 py-3 bg-gray-50 text-sm text-gray-500 shrink-0 select-none">
                {PHONE_PREFIX}
              </div>
              <input
                id="customer-phone"
                type="tel"
                autoComplete="tel"
                placeholder="600 000 000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={handlePhoneBlur}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition"
                style={{ '--tw-ring-color': accent } as React.CSSProperties}
              />
            </div>
            {lookupLoading && (
              <p className="text-xs text-gray-400 mt-1.5">Buscando datos del cliente…</p>
            )}
          </div>
        </div>
      </div>

      {/* Sticky footer CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 z-20 shadow-lg">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="w-full rounded-2xl py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: accent }}
          >
            Continuar
          </button>
        </div>
      </div>
    </main>
  )
}
