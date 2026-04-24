'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCartStore } from '@/lib/store/cart'
import { fmtPrice } from '@/lib/fmt'

const ACCENT = '#E63946'

const STEPS = ['Datos', 'Despacho', 'Pago', 'Confirmar'] as const

const DISPATCH_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  pickup: 'Retiro en local',
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  bizum: 'Bizum',
  online: 'Online',
}

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
      {children}
    </h3>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2 py-1">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  )
}

function buildWhatsAppMessage({
  customerName,
  customerPhone,
  items,
  dispatchType,
  address,
  paymentMethod,
  subtotal,
  deliveryCost,
  total,
  moneda,
}: {
  customerName: string
  customerPhone: string
  items: ReturnType<typeof useCartStore.getState>['items']
  dispatchType: string
  address: string
  paymentMethod: string
  subtotal: number
  deliveryCost: number
  total: number
  moneda: string
}): string {
  const fmt = (n: number) => fmtPrice(n, moneda)

  const itemLines = items
    .map((item) => {
      const variant = item.variantName ? ` (${item.variantName})` : ''
      const extras =
        item.extras.length > 0
          ? ` + ${item.extras.map((e) => e.name).join(', ')}`
          : ''
      return `• ${item.qty}x ${item.itemName}${variant}${extras}: ${fmt(item.unitPrice * item.qty)}`
    })
    .join('\n')

  const dispatchLine =
    dispatchType === 'delivery'
      ? `Delivery — ${address}`
      : 'Retiro en local'

  const shippingLine =
    dispatchType === 'delivery'
      ? `\nEnvío: ${fmt(deliveryCost)}`
      : ''

  return (
    `*Pedido EasyOrder*\n` +
    `Nombre: ${customerName}\n` +
    `Teléfono: ${customerPhone}\n\n` +
    `*Ítems:*\n${itemLines}\n\n` +
    `*Despacho:* ${dispatchLine}\n` +
    `*Pago:* ${PAYMENT_LABELS[paymentMethod] ?? paymentMethod}\n\n` +
    `Subtotal: ${fmt(subtotal)}${shippingLine}\n` +
    `*Total: ${fmt(total)}*`
  )
}

export default function CheckoutConfirmarPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()

  const items = useCartStore((s) => s.items)
  const customerName = useCartStore((s) => s.customerName)
  const customerPhone = useCartStore((s) => s.customerPhone)
  const dispatchType = useCartStore((s) => s.dispatchType)
  const address = useCartStore((s) => s.address)
  const deliveryCost = useCartStore((s) => s.deliveryCost)
  const zoneId = useCartStore((s) => s.zoneId)
  const zoneName = useCartStore((s) => s.zoneName)
  const estimatedMinutesMin = useCartStore((s) => s.estimatedMinutesMin)
  const estimatedMinutesMax = useCartStore((s) => s.estimatedMinutesMax)
  const paymentMethod = useCartStore((s) => s.paymentMethod)
  const subtotal = useCartStore((s) => s.subtotal)
  const total = useCartStore((s) => s.total)
  const setOrderId = useCartStore((s) => s.setOrderId)
  const moneda = useCartStore((s) => s.moneda)

  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!paymentMethod) {
      router.replace(`/${slug}/checkout/pago`)
    }
  }, [paymentMethod, router, slug])

  useEffect(() => {
    async function fetchRestaurant() {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL
        const res = await fetch(`${base}/public/${slug}/restaurant`)
        if (!res.ok) return
        const data: { phone?: string } = await res.json()
        if (data.phone) {
          setWhatsappNumber(data.phone)
        }
      } catch {
        // best-effort; el botón mostrará error si falta el número
      }
    }
    fetchRestaurant()
  }, [slug])

  async function handleConfirm() {
    if (!paymentMethod || !dispatchType) return
    setSubmitting(true)
    setError(null)

    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const orderStatus =
        paymentMethod === 'transferencia' ? 'pendiente_pago' : 'confirmado'

      const res = await fetch(`${base}/public/${slug}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: customerName,
          telefono: customerPhone,
          tipo_despacho: dispatchType === 'pickup' ? 'retiro' : 'delivery',
          metodo_pago: paymentMethod,
          ...(dispatchType === 'delivery' && {
            direccion: address,
            zona_id: zoneId ?? undefined,
          }),
          items: items.map((i) => ({
            menu_item_id: i.itemId,
            menu_variant_id: i.variantId ?? null,
            item_name: i.itemName,
            variant_name: i.variantName ?? '',
            quantity: i.qty,
            unit_price: i.unitPrice,
            extras: i.extras.map((e) => ({
              extra_id: e.id,
              name: e.name,
              unit_price: e.price,
              quantity: 1,
            })),
          })),
        }),
      })

      if (!res.ok) {
        const errData: { error?: string; reason?: string; detail?: string; menu_variant_id?: number; extra_id?: number } = await res.json().catch(() => ({}))
        if (errData.error === 'local_closed') {
          throw new Error('El local está cerrado en este momento. No se pueden tomar pedidos.')
        }
        const detail = [errData.error, errData.reason, errData.menu_variant_id ?? errData.extra_id].filter(Boolean).join(' / ')
        throw new Error(`Error al crear el pedido: ${detail || `HTTP ${res.status}`}`)
      }

      const data: { pedido_codigo?: string; id?: string } = await res.json()
      const pedidoCodigo = data.pedido_codigo ?? data.id ?? ''
      setOrderId(pedidoCodigo)

      if (whatsappNumber) {
        const message = buildWhatsAppMessage({
          customerName,
          customerPhone,
          items,
          dispatchType,
          address,
          paymentMethod,
          subtotal: subtotal(),
          deliveryCost,
          total: total(),
          moneda,
        })
        const waLink = `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
        window.open(waLink, '_blank')
      }

      router.push(`/${slug}/pedido/estado?codigo=${pedidoCodigo}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.')
    } finally {
      setSubmitting(false)
    }
  }

  const fmt = (n: number) => fmtPrice(n, moneda)
  const currentSubtotal = subtotal()
  const currentTotal = total()

  return (
    <main className="min-h-screen bg-gray-50 pb-40">
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
          <ProgressBar current={3} />
        </div>

        <div className="mx-4 mt-6 space-y-4">
          {/* Items */}
          <div className="bg-white rounded-2xl px-5 py-5 shadow-sm">
            <SectionTitle>Tu pedido</SectionTitle>
            <div className="space-y-3">
              {items.map((item, idx) => {
                const variant = item.variantName ? ` · ${item.variantName}` : ''
                const extras =
                  item.extras.length > 0
                    ? item.extras.map((e) => e.name).join(', ')
                    : null
                return (
                  <div key={idx} className="flex justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 leading-snug">
                        {item.qty}× {item.itemName}
                        {variant && (
                          <span className="text-gray-500 font-normal">{variant}</span>
                        )}
                      </p>
                      {extras && (
                        <p className="text-xs text-gray-400 mt-0.5">+ {extras}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-900 shrink-0">
                      {fmt(item.unitPrice * item.qty)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Customer + dispatch */}
          <div className="bg-white rounded-2xl px-5 py-5 shadow-sm">
            <SectionTitle>Datos del pedido</SectionTitle>
            <Row label="Nombre" value={customerName} />
            <Row label="Teléfono" value={customerPhone} />
            <Row
              label="Despacho"
              value={DISPATCH_LABELS[dispatchType ?? ''] ?? dispatchType ?? '—'}
            />
            {dispatchType === 'delivery' && zoneName && (
              <Row label="Zona" value={zoneName} />
            )}
            {dispatchType === 'delivery' && address && (
              <Row label="Dirección" value={address} />
            )}
            {dispatchType === 'delivery' && estimatedMinutesMin !== null && estimatedMinutesMax !== null && (
              <Row label="Tiempo estimado" value={`${estimatedMinutesMin}–${estimatedMinutesMax} min`} />
            )}
            <Row
              label="Método de pago"
              value={PAYMENT_LABELS[paymentMethod ?? ''] ?? paymentMethod ?? '—'}
            />
          </div>

          {/* Totals */}
          <div className="bg-white rounded-2xl px-5 py-5 shadow-sm">
            <SectionTitle>Resumen de pago</SectionTitle>
            <Row label="Subtotal" value={fmt(currentSubtotal)} />
            <Row
              label="Envío"
              value={dispatchType === 'delivery' ? fmt(deliveryCost) : 'Sin costo'}
            />
            <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between items-baseline">
              <span className="text-sm font-bold text-gray-900">Total</span>
              <span className="text-lg font-bold" style={{ color: ACCENT }}>
                {fmt(currentTotal)}
              </span>
            </div>
          </div>

          {/* WhatsApp notice */}
          <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-4">
            <span className="text-xl shrink-0">💬</span>
            <p className="text-sm text-green-800">
              Se abrirá WhatsApp con tu pedido. Solo toca enviar.
            </p>
          </div>

          {error && (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 z-20 shadow-lg">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full rounded-2xl py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ backgroundColor: '#25D366' }}
          >
            {submitting ? (
              'Enviando pedido…'
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 2.054.518 4.001 1.432 5.705L0 24l6.545-1.407C8.218 23.51 10.068 24 12 24c6.626 0 12-5.373 12-12S18.626 0 12 0zm0 22c-1.876 0-3.672-.494-5.246-1.38l-.376-.222-3.882.836.855-3.78-.244-.39C2.01 15.525 1.5 13.817 1.5 12 1.5 6.201 6.201 1.5 12 1.5S22.5 6.201 22.5 12 17.799 22.5 12 22.5z" />
                </svg>
                Enviar pedido por WhatsApp
              </>
            )}
          </button>
        </div>
      </div>
    </main>
  )
}
