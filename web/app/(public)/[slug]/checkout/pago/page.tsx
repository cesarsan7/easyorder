'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCartStore } from '@/lib/store/cart'

const STEPS = ['Datos', 'Despacho', 'Pago', 'Confirmar'] as const

const METHOD_ICONS: Record<string, string> = {
  efectivo: '💵',
  tarjeta: '💳',
  transferencia: '🏦',
  bizum: '📱',
  online: '🌐',
}

const METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  bizum: 'Bizum',
  online: 'Online',
}

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

export default function CheckoutPagoPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()

  const dispatchType     = useCartStore((s) => s.dispatchType)
  const setPaymentMethod = useCartStore((s) => s.setPaymentMethod)
  const accent           = useCartStore((s) => s.accentColor)

  const [methods, setMethods] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!dispatchType) {
      router.replace(`/${slug}/checkout/despacho`)
    }
  }, [dispatchType, router, slug])

  useEffect(() => {
    async function fetchRestaurant() {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL
        const res = await fetch(`${base}/public/${slug}/restaurant`)
        if (!res.ok) return
        const data: { payment_methods?: string[] } = await res.json()
        if (Array.isArray(data.payment_methods)) {
          setMethods(data.payment_methods.map((m) => m.toLowerCase()))
        }
      } finally {
        setLoading(false)
      }
    }
    fetchRestaurant()
  }, [slug])

  function handleContinue() {
    if (!selected) return
    setPaymentMethod(selected)
    router.push(`/${slug}/checkout/confirmar`)
  }

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
          <ProgressBar current={2} accent={accent} />
        </div>

        <div className="mx-4 mt-6 space-y-3">
          <h2 className="text-base font-semibold text-gray-900">
            ¿Cómo vas a pagar?
          </h2>

          {loading ? (
            <p className="text-sm text-gray-400 py-4">Cargando métodos de pago…</p>
          ) : methods.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">
              No hay métodos de pago configurados para este local.
            </p>
          ) : (
            <div className="space-y-3">
              {methods.map((method) => {
                const isSelected = selected === method
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setSelected(method)}
                    className="w-full flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-all"
                    style={{
                      borderColor: isSelected ? accent : '#E5E7EB',
                      backgroundColor: isSelected ? '#FFF5F5' : 'white',
                    }}
                  >
                    <span className="text-2xl shrink-0">
                      {METHOD_ICONS[method] ?? '💰'}
                    </span>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: isSelected ? accent : '#111827' }}
                    >
                      {METHOD_LABELS[method] ?? method}
                    </span>
                    {isSelected && (
                      <span
                        className="ml-auto w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: accent }}
                      >
                        <svg
                          width="10"
                          height="8"
                          viewBox="0 0 10 8"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 z-20 shadow-lg">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleContinue}
            disabled={!selected}
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
