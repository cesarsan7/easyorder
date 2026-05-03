'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCartStore, DispatchType, ZoneInfo } from '@/lib/store/cart'
import { fmtPrice } from '@/lib/fmt'

const ACCENT = '#E63946'

const STEPS = ['Datos', 'Despacho', 'Pago', 'Confirmar'] as const

function ProgressBar({ current }: { current: number }) {
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
                style={{ backgroundColor: active || done ? ACCENT : '#D1D5DB' }}
              />
              <span
                className="text-[10px] font-medium whitespace-nowrap"
                style={{ color: active ? ACCENT : done ? '#6B7280' : '#9CA3AF' }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="flex-1 h-px mb-3 mx-1"
                style={{ backgroundColor: done ? ACCENT : '#E5E7EB' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

interface DeliveryZone {
  delivery_zone_id:      number
  zone_name:             string
  postal_code:           string
  fee:                   number
  min_order_amount:      number | null
  estimated_minutes_min: number | null
  estimated_minutes_max: number | null
  description:           string | null
}

interface RestaurantInfo {
  delivery_enabled: boolean
  pickup_enabled:   boolean
}

export default function CheckoutDespachoPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()

  const customerName = useCartStore((s) => s.customerName)
  const customerPhone = useCartStore((s) => s.customerPhone)
  const subtotal = useCartStore((s) => s.subtotal)
  const isCartEmpty = useCartStore((s) => s.isCartEmpty)
  const setDispatch = useCartStore((s) => s.setDispatch)
  const moneda = useCartStore((s) => s.moneda)

  const fmt = (n: number) => fmtPrice(n, moneda)

  const [restaurant, setRestaurant]         = useState<RestaurantInfo | null>(null)
  const [zones, setZones]                   = useState<DeliveryZone[]>([])
  const [loadingData, setLoadingData]       = useState(true)
  const [selectedType, setSelectedType]     = useState<DispatchType | null>(null)
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null)
  const [address, setAddress]               = useState('')

  // Guards
  useEffect(() => {
    if (isCartEmpty()) router.replace(`/${slug}/menu`)
  }, [isCartEmpty, router, slug])

  useEffect(() => {
    if (!customerName || !customerPhone) router.replace(`/${slug}/checkout/datos`)
  }, [customerName, customerPhone, router, slug])

  // Fetch restaurant info + delivery zones in parallel
  useEffect(() => {
    async function fetchData() {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL
        const [restRes, zonesRes] = await Promise.all([
          fetch(`${base}/public/${slug}/restaurant`),
          fetch(`${base}/public/${slug}/delivery/zones`),
        ])

        if (restRes.ok) {
          const d: RestaurantInfo = await restRes.json()
          setRestaurant(d)
          if (d.pickup_enabled) setSelectedType('pickup')
          else if (d.delivery_enabled) setSelectedType('delivery')
        }

        if (zonesRes.ok) {
          const d: { zones: DeliveryZone[] } = await zonesRes.json()
          setZones(d.zones)
        }
      } finally {
        setLoadingData(false)
      }
    }
    fetchData()
  }, [slug])

  const currentSubtotal = subtotal()
  const selectedZone = zones.find((z) => z.delivery_zone_id === selectedZoneId) ?? null

  const deliveryCost   = selectedZone?.fee ?? 0
  const minOrder       = selectedZone?.min_order_amount ?? 0
  const shortfall      = minOrder - currentSubtotal
  const belowMin       = selectedType === 'delivery' && selectedZone !== null && shortfall > 0

  const canContinue =
    selectedType === 'pickup' ||
    (selectedType === 'delivery' &&
      selectedZone !== null &&
      address.trim().length > 0 &&
      !belowMin)

  function handleContinue() {
    if (!canContinue || !selectedType) return

    if (selectedType === 'pickup') {
      setDispatch('pickup', '', 0)
    } else if (selectedZone) {
      const zone: ZoneInfo = {
        id:     selectedZone.delivery_zone_id,
        name:   selectedZone.zone_name,
        estMin: selectedZone.estimated_minutes_min,
        estMax: selectedZone.estimated_minutes_max,
      }
      setDispatch('delivery', address.trim(), deliveryCost, zone)
    }

    router.push(`/${slug}/checkout/pago`)
  }

  // Derived: min fee across zones for the delivery card subtitle
  const minFee = zones.length > 0 ? Math.min(...zones.map((z) => z.fee)) : null

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
            >←</button>
            <h1 className="text-xl font-bold text-gray-900">Checkout</h1>
          </div>
          <ProgressBar current={1} />
        </div>

        <div className="mx-4 mt-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">
            ¿Cómo quieres recibir tu pedido?
          </h2>

          {loadingData ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 rounded-full border-4 border-gray-200 border-t-red-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Tipo de despacho ─────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-3">
                {restaurant?.pickup_enabled && (
                  <button
                    type="button"
                    onClick={() => setSelectedType('pickup')}
                    className="rounded-2xl border-2 p-4 text-left transition-all"
                    style={{
                      borderColor:     selectedType === 'pickup' ? ACCENT : '#E5E7EB',
                      backgroundColor: selectedType === 'pickup' ? '#FFF5F5' : 'white',
                    }}
                  >
                    <span className="text-2xl block mb-2">🏪</span>
                    <span className="text-sm font-semibold block"
                      style={{ color: selectedType === 'pickup' ? ACCENT : '#111827' }}>
                      Retiro en local
                    </span>
                    <span className="text-xs text-gray-500 mt-1 block">Sin costo de envío</span>
                  </button>
                )}

                {restaurant?.delivery_enabled && (
                  <button
                    type="button"
                    onClick={() => setSelectedType('delivery')}
                    className="rounded-2xl border-2 p-4 text-left transition-all"
                    style={{
                      borderColor:     selectedType === 'delivery' ? ACCENT : '#E5E7EB',
                      backgroundColor: selectedType === 'delivery' ? '#FFF5F5' : 'white',
                    }}
                  >
                    <span className="text-2xl block mb-2">🛵</span>
                    <span className="text-sm font-semibold block"
                      style={{ color: selectedType === 'delivery' ? ACCENT : '#111827' }}>
                      Delivery
                    </span>
                    <span className="text-xs text-gray-500 mt-1 block">
                      {minFee !== null ? `Desde ${fmt(minFee)}` : 'Ver zonas disponibles'}
                    </span>
                  </button>
                )}
              </div>

              {/* ── Retiro summary ───────────────────────────────────── */}
              {selectedType === 'pickup' && (
                <div className="bg-white rounded-2xl px-5 py-4 shadow-sm flex justify-between text-sm text-gray-600">
                  <span>Costo de envío</span>
                  <span className="font-medium text-green-600">Sin costo</span>
                </div>
              )}

              {/* ── Delivery: zona + dirección ───────────────────────── */}
              {selectedType === 'delivery' && (
                <div className="space-y-3">
                  {/* Zone selector */}
                  {zones.length === 0 ? (
                    <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4">
                      <p className="text-sm text-red-700">
                        No hay zonas de delivery disponibles en este momento.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 pt-4 pb-2">
                        Selecciona tu zona
                      </p>
                      {zones.map((zone) => {
                        const selected = selectedZoneId === zone.delivery_zone_id
                        const hasTime  = zone.estimated_minutes_min !== null && zone.estimated_minutes_max !== null
                        return (
                          <button
                            key={zone.delivery_zone_id}
                            type="button"
                            onClick={() => setSelectedZoneId(zone.delivery_zone_id)}
                            className="w-full flex items-center justify-between px-4 py-3 border-t border-gray-50 first:border-0 transition-colors text-left"
                            style={{ backgroundColor: selected ? '#FFF5F5' : 'transparent' }}
                          >
                            <div className="flex items-center gap-3">
                              {/* Radio indicator */}
                              <span className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                                selected ? 'border-red-500' : 'border-gray-300'
                              }`}>
                                {selected && (
                                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ACCENT }} />
                                )}
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{zone.zone_name}</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {zone.min_order_amount !== null
                                    ? `Mín. ${fmt(zone.min_order_amount)}`
                                    : 'Sin mínimo'}
                                  {hasTime && ` · ${zone.estimated_minutes_min}–${zone.estimated_minutes_max} min`}
                                </p>
                              </div>
                            </div>
                            <span
                              className="text-sm font-bold shrink-0 ml-2"
                              style={{ color: selected ? ACCENT : '#374151' }}
                            >
                              {fmt(zone.fee)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Address input — only when zone selected */}
                  {selectedZoneId !== null && (
                    <div className="bg-white rounded-2xl px-5 py-5 shadow-sm space-y-3">
                      <div>
                        <label htmlFor="address"
                          className="block text-xs font-medium text-gray-600 mb-1.5">
                          Dirección de entrega <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="address"
                          type="text"
                          autoComplete="street-address"
                          placeholder="Calle, número, referencias…"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition"
                          style={{ '--tw-ring-color': ACCENT } as React.CSSProperties}
                        />
                      </div>

                      {/* Fee + estimated time summary */}
                      {!belowMin && selectedZone && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm text-gray-600">
                            <span>Costo de envío</span>
                            <span className="font-medium">{fmt(deliveryCost)}</span>
                          </div>
                          {selectedZone.estimated_minutes_min !== null &&
                           selectedZone.estimated_minutes_max !== null && (
                            <div className="flex justify-between text-sm text-gray-600">
                              <span>Tiempo estimado</span>
                              <span className="font-medium">
                                {selectedZone.estimated_minutes_min}–{selectedZone.estimated_minutes_max} min
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Below minimum — reglas #7 y #10 */}
                      {belowMin && (
                        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-4">
                          <p className="text-sm font-semibold text-red-700 mb-1">
                            Monto mínimo no alcanzado
                          </p>
                          <p className="text-xs text-red-600 mb-3">
                            Te faltan{' '}
                            <span className="font-bold">{fmt(shortfall)}</span>
                            {' '}para el mínimo de {selectedZone?.zone_name} ({fmt(minOrder)}).
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => router.push(`/${slug}/menu`)}
                              className="flex-1 rounded-xl border border-red-300 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                            >
                              Agregar más productos
                            </button>
                            {restaurant?.pickup_enabled && (
                              <button
                                type="button"
                                onClick={() => setSelectedType('pickup')}
                                className="flex-1 rounded-xl py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                                style={{ backgroundColor: ACCENT }}
                              >
                                Cambiar a Retiro
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sticky footer CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 z-20 shadow-lg">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="w-full rounded-2xl py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: ACCENT }}
          >
            Continuar
          </button>
        </div>
      </div>
    </main>
  )
}
