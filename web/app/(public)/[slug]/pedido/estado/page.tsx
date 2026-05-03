'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useCartStore } from '@/lib/store/cart'
import { fmtPrice } from '@/lib/fmt'

const ACCENT = '#E63946'

const ESTADO_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  pendiente_pago:  { label: 'Pendiente de pago',  icon: '⏳', color: '#F59E0B' },
  confirmado:      { label: 'Confirmado',          icon: '✅', color: '#10B981' },
  en_preparacion:  { label: 'En preparación',      icon: '👨‍🍳', color: '#3B82F6' },
  listo_retiro:    { label: 'Listo para retiro',   icon: '🎉', color: '#10B981' },
  en_camino:       { label: 'En camino',            icon: '🛵', color: '#3B82F6' },
  entregado:       { label: 'Entregado',            icon: '🏠', color: '#10B981' },
  cancelado:       { label: 'Cancelado',            icon: '❌', color: '#EF4444' },
}

interface OrderItem {
  menu_item_id: number
  item_name: string
  variant_name: string | null
  quantity: number
  unit_price: number
  extras?: { name: string; unit_price: number; quantity: number }[]
}

interface OrderData {
  pedido_codigo: string
  estado: string
  tipo_despacho: string
  metodo_pago: string
  items: OrderItem[]
  subtotal: number
  costo_envio: number
  total: number
  direccion: string | null
  postal_code: string | null
  tiempo_estimado: number | null
  datos_transferencia?: { banco?: string; titular?: string; cuenta?: string; alias?: string } | null
}


export default function PedidoEstadoPage() {
  const { slug } = useParams<{ slug: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const clearCart = useCartStore((s) => s.clearCart)
  const moneda = useCartStore((s) => s.moneda)
  const fmt = (n: number) => fmtPrice(n, moneda)

  const codigo = searchParams.get('codigo') ?? ''

  const [order, setOrder] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!codigo) {
      setError('No se encontró el código del pedido.')
      setLoading(false)
      return
    }

    async function fetchOrder() {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL
        const res = await fetch(`${base}/public/${slug}/orders/${codigo}`)
        if (!res.ok) {
          setError('No se pudo encontrar el pedido.')
          return
        }
        const data: OrderData = await res.json()
        setOrder(data)
        clearCart()
      } catch {
        setError('Error al obtener el estado del pedido.')
      } finally {
        setLoading(false)
      }
    }

    fetchOrder()
  }, [slug, codigo, clearCart])

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-gray-500 animate-spin" />
      </main>
    )
  }

  if (error || !order) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-6">
        <div className="text-5xl">😕</div>
        <p className="text-gray-600 text-center text-sm">{error ?? 'Pedido no encontrado.'}</p>
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

  const estadoInfo = ESTADO_LABELS[order.estado] ?? { label: order.estado, icon: '📋', color: '#6B7280' }

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="bg-white px-5 pt-6 pb-5 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Estado del pedido</h1>
          <p className="text-sm text-gray-500 font-mono">#{order.pedido_codigo}</p>
        </div>

        <div className="mx-4 mt-5 space-y-4">

          {/* Estado */}
          <div
            className="rounded-2xl px-5 py-5 flex items-center gap-4"
            style={{ backgroundColor: `${estadoInfo.color}15`, border: `1px solid ${estadoInfo.color}40` }}
          >
            <span className="text-4xl">{estadoInfo.icon}</span>
            <div>
              <p className="text-base font-bold" style={{ color: estadoInfo.color }}>
                {estadoInfo.label}
              </p>
              {order.tiempo_estimado && order.estado !== 'entregado' && order.estado !== 'cancelado' && (
                <p className="text-sm text-gray-500 mt-0.5">
                  Tiempo estimado: {order.tiempo_estimado} min
                </p>
              )}
            </div>
          </div>

          {/* Instrucciones de transferencia */}
          {order.estado === 'pendiente_pago' && order.metodo_pago === 'transferencia' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-5">
              <p className="text-sm font-semibold text-amber-800 mb-2">📲 Realiza tu transferencia</p>
              {order.datos_transferencia ? (
                <div className="space-y-1 text-sm text-amber-700">
                  {order.datos_transferencia.banco    && <p><span className="font-medium">Banco:</span> {order.datos_transferencia.banco}</p>}
                  {order.datos_transferencia.titular  && <p><span className="font-medium">Titular:</span> {order.datos_transferencia.titular}</p>}
                  {order.datos_transferencia.cuenta   && <p><span className="font-medium">Cuenta:</span> {order.datos_transferencia.cuenta}</p>}
                  {order.datos_transferencia.alias    && <p><span className="font-medium">Alias:</span> {order.datos_transferencia.alias}</p>}
                  <p className="font-semibold mt-2">Monto: {fmt(order.total)}</p>
                </div>
              ) : (
                <p className="text-sm text-amber-700">
                  Contacta al local para obtener los datos de transferencia.
                </p>
              )}
            </div>
          )}

          {/* Ítems */}
          <div className="bg-white rounded-2xl px-5 py-5 shadow-sm">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Tu pedido
            </h3>
            <div className="space-y-3">
              {order.items.map((item, idx) => {
                const extrasLabel = item.extras?.map((e) => e.name).join(', ')
                return (
                  <div key={idx} className="flex justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 leading-snug">
                        {item.quantity}× {item.item_name}
                        {item.variant_name && (
                          <span className="text-gray-500 font-normal"> · {item.variant_name}</span>
                        )}
                      </p>
                      {extrasLabel && (
                        <p className="text-xs text-gray-400 mt-0.5">+ {extrasLabel}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-900 shrink-0">
                      {fmt(item.unit_price * item.quantity)}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Totales */}
            <div className="border-t border-gray-100 mt-4 pt-3 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>{fmt(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Envío</span>
                <span>{order.costo_envio > 0 ? fmt(order.costo_envio) : 'Sin costo'}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 pt-1">
                <span>Total</span>
                <span style={{ color: ACCENT }}>{fmt(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Despacho */}
          <div className="bg-white rounded-2xl px-5 py-4 shadow-sm">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Entrega
            </h3>
            <p className="text-sm text-gray-800">
              {order.tipo_despacho === 'delivery' ? '🛵 Delivery' : '🏪 Retiro en local'}
            </p>
            {order.direccion && (
              <p className="text-sm text-gray-500 mt-0.5">
                {order.direccion}
                {order.postal_code && (
                  <span className="ml-1 text-xs text-gray-400">· CP {order.postal_code}</span>
                )}
              </p>
            )}
          </div>

          {/* Volver al menú */}
          <button
            onClick={() => router.push(`/${slug}/menu`)}
            className="w-full rounded-2xl py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: ACCENT }}
          >
            Volver al menú
          </button>
        </div>
      </div>
    </main>
  )
}
