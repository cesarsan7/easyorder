'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  menu_item_id: number
  item_name: string
  variant_name: string | null
  quantity: number
  unit_price: number
  notas?: string | null
  extras?: { name: string; unit_price: number; quantity: number }[]
}

interface OrderDetail {
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

interface Order {
  id: number
  pedido_codigo: string
  estado: string
  estado_pago: string
  tipo_despacho: string
  total: number
  subtotal: number
  costo_envio: number
  metodo_pago: string
  notas: { item: string; nota: string }[] | null
  telefono: string
  nombre_cliente: string
  direccion: string | null
  tiempo_estimado: number | null
  items_count: number
  created_at: string
  updated_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000

// Color primario EasyOrder
const PRIMARY = '#F3274C'

// ─── Normaliza items de BD: soporta formato web y formato n8n/WhatsApp ────────
// Web:      { item_name, variant_name, quantity, unit_price, extras }
// WhatsApp: { nombre, cantidad, precio_unitario, subtotal, notas }
function normalizeItem(raw: unknown): OrderItem {
  const r = raw as Record<string, unknown>
  if (typeof r.item_name === 'string') {
    // Formato web — ya está en el shape correcto
    return {
      menu_item_id: Number(r.menu_item_id ?? 0),
      item_name:    r.item_name,
      variant_name: (r.variant_name as string | null) ?? null,
      quantity:     Number(r.quantity ?? 1),
      unit_price:   Number(r.unit_price ?? 0),
      notas:        typeof r.notas === 'string' && r.notas.trim() ? r.notas.trim() : null,
      extras:       Array.isArray(r.extras) ? (r.extras as OrderItem['extras']) : undefined,
    }
  }
  // Formato WhatsApp/n8n — mapear campos
  const nombre = String(r.nombre ?? r.name ?? 'Producto')
  return {
    menu_item_id: 0,
    item_name:    nombre,
    variant_name: null,
    quantity:     Number(r.cantidad ?? r.quantity ?? 1),
    unit_price:   Number(r.precio_unitario ?? r.unit_price ?? 0),
    notas:        typeof r.notas === 'string' && r.notas.trim() ? r.notas.trim() : null,
  }
}

const ESTADO_META: Record<string, { label: string; color: string; bg: string }> = {
  recibido:       { label: 'Por confirmar',    color: '#92400E', bg: '#FEF3C7' },
  en_curso:       { label: 'En curso',         color: '#6B7280', bg: '#F3F4F6' },
  pendiente_pago: { label: 'Pend. de pago',    color: '#D97706', bg: '#FEF3C7' },
  confirmado:     { label: 'Confirmado',        color: '#2563EB', bg: '#DBEAFE' },
  pagado:         { label: 'Pagado',            color: '#059669', bg: '#D1FAE5' },
  en_preparacion: { label: 'En preparación',   color: '#7C3AED', bg: '#EDE9FE' },
  listo:          { label: 'Listo',             color: '#059669', bg: '#D1FAE5' },
  en_camino:      { label: 'En camino',         color: '#0284C7', bg: '#E0F2FE' },
  entregado:      { label: 'Entregado',         color: '#6B7280', bg: '#F3F4F6' },
  cancelado:      { label: 'Cancelado',         color: '#DC2626', bg: '#FEE2E2' },
  expirado:       { label: 'Expirado',          color: '#6B7280', bg: '#F3F4F6' },
}

// Transiciones relajadas — espejo del backend. Permite saltos hacia adelante.
const TRANSITIONS: Record<string, string[]> = {
  recibido:       ['confirmado', 'en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado', 'expirado'],
  en_curso:       ['confirmado', 'en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado', 'expirado'],
  pendiente_pago: ['confirmado', 'en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado'],
  confirmado:     ['en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado'],
  pagado:         ['en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado'],
  en_preparacion: ['listo', 'en_camino', 'entregado', 'cancelado'],
  listo:          ['en_camino', 'entregado', 'cancelado'],
  en_camino:      ['entregado', 'cancelado'],
  entregado:      [],
  cancelado:      [],
  expirado:       [],
}

// Orden canónico del flujo operativo (sin cancelado — se trata aparte)
const STATE_FLOW: { key: string; emoji: string; label: string }[] = [
  { key: 'recibido',       emoji: '⏳', label: 'Por confirmar'  },
  { key: 'confirmado',     emoji: '✅', label: 'Confirmado'     },
  { key: 'en_preparacion', emoji: '👨‍🍳', label: 'En preparación' },
  { key: 'listo',          emoji: '🔔', label: 'Listo'          },
  { key: 'en_camino',      emoji: '🛵', label: 'En despacho'    },
  { key: 'entregado',      emoji: '📦', label: 'Entregado'      },
]

const DESPACHO_ICON: Record<string, string> = {
  delivery: '🛵',
  retiro:   '🏪',
}

const PAGO_LABEL: Record<string, string> = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  tarjeta:       'Tarjeta',
  bizum:         'Bizum',
  online:        'Online',
}

// Tab "Por confirmar" usa key especial para filtrar solo estado recibido
const FILTER_TABS = [
  { key: '',               label: 'Activos',        badgeKey: null },
  { key: 'recibido',       label: 'Por confirmar',  badgeKey: 'recibido' },
  { key: 'pendiente_pago', label: 'Pend. pago',     badgeKey: null },
  { key: 'en_preparacion', label: 'Preparando',     badgeKey: null },
  { key: 'entregado',      label: 'Entregados',     badgeKey: null },
  { key: 'cancelado',      label: 'Cancelados',     badgeKey: null },
  { key: 'expirado',       label: 'Expirados',      badgeKey: null },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `€${n.toFixed(2).replace('.', ',')}`
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)   return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Atlantic/Canary',
  })
}

function openWhatsApp(telefono: string) {
  const clean = telefono.replace(/\D/g, '')
  window.open(`https://wa.me/${clean}`, '_blank')
}

// ─── Comanda print ────────────────────────────────────────────────────────────

function printComanda(order: Order, detail: OrderDetail | null) {
  const items = detail?.items ?? []
  const html = `
    <html><head><title>Comanda #${order.pedido_codigo}</title>
    <style>
      body { font-family: monospace; font-size: 13px; max-width: 280px; margin: 0 auto; padding: 8px; }
      h2 { text-align: center; font-size: 15px; border-bottom: 1px dashed #000; padding-bottom: 6px; }
      .row { display: flex; justify-content: space-between; margin: 4px 0; }
      .sep { border-top: 1px dashed #000; margin: 6px 0; }
      .bold { font-weight: bold; }
    </style></head><body>
    <h2>🍕 COMANDA</h2>
    <div class="row"><span>${order.pedido_codigo}</span><span>${formatTime(order.created_at)}</span></div>
    <div class="row bold"><span>${order.nombre_cliente}</span><span>${order.telefono}</span></div>
    <div class="sep"></div>
    ${items.map(i => `
      <div class="row">
        <span>${i.quantity}x ${i.item_name}${i.variant_name ? ' (' + i.variant_name + ')' : ''}</span>
        <span>${fmt(i.unit_price * i.quantity)}</span>
      </div>
      ${(i.extras ?? []).map(e => `<div style="padding-left:12px; color:#666">+ ${e.name}</div>`).join('')}
    `).join('')}
    <div class="sep"></div>
    <div class="row"><span>Despacho</span><span>${order.tipo_despacho === 'delivery' ? '🛵 Delivery' : '🏪 Retiro'}</span></div>
    ${order.direccion ? `<div style="font-size:11px;color:#555">📍 ${order.direccion}</div>` : ''}
    <div class="sep"></div>
    <div class="row"><span>Subtotal</span><span>${fmt(detail?.subtotal ?? order.subtotal)}</span></div>
    ${(detail?.costo_envio ?? 0) > 0 ? `<div class="row"><span>Envío</span><span>${fmt(detail!.costo_envio)}</span></div>` : ''}
    <div class="row bold"><span>TOTAL</span><span>${fmt(order.total)}</span></div>
    <div class="sep"></div>
    <div class="row"><span>Pago</span><span>${PAGO_LABEL[order.metodo_pago] ?? order.metodo_pago}</span></div>
    ${Array.isArray(order.notas) && order.notas.length ? order.notas.map(n => `<div style="margin-top:4px;padding:4px;border:1px dashed #000">📝 ${n.item !== 'general' ? `<b>${n.item}</b>: ` : ''}${n.nota}</div>`).join('') : ''}
    </body></html>
  `
  const win = window.open('', '_blank', 'width=350,height=600')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({
  order,
  onStatusChange,
  updating,
  onSelect,
}: {
  order: Order
  onStatusChange: (id: number, estado: string) => void
  updating: boolean
  onSelect: (order: Order) => void
}) {
  const meta        = ESTADO_META[order.estado] ?? { label: order.estado, color: '#6B7280', bg: '#F3F4F6' }
  const transitions = TRANSITIONS[order.estado] ?? []
  const primaryNext = transitions.filter((t) => t !== 'cancelado')[0]
  const canCancel   = transitions.includes('cancelado')
  const isNew       = order.estado === 'recibido'

  return (
    <div
      className="bg-white rounded-2xl shadow-sm border overflow-hidden transition-shadow hover:shadow-md"
      style={{ borderColor: isNew ? '#FCD34D' : '#F3F4F6' }}
    >
      {/* Header row */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => onSelect(order)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-semibold text-gray-500">
            #{order.pedido_codigo}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ color: meta.color, backgroundColor: meta.bg }}
          >
            {meta.label}
          </span>
          {isNew && (
            <span className="rounded-full px-1.5 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: PRIMARY }}>
              NUEVO
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{timeAgo(order.created_at)}</span>
          <span className="text-gray-300 text-sm">›</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        {/* Cliente */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">{order.nombre_cliente}</p>
            <p className="text-xs text-gray-400">{order.telefono}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-gray-900">{fmt(order.total)}</p>
            <p className="text-xs text-gray-400">{order.items_count} ítem{order.items_count !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Despacho + pago */}
        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
          <span>{DESPACHO_ICON[order.tipo_despacho] ?? '📦'} {order.tipo_despacho === 'delivery' ? 'Delivery' : 'Retiro'}</span>
          <span className="text-gray-300">·</span>
          <span>💳 {PAGO_LABEL[order.metodo_pago] ?? order.metodo_pago}</span>
          {order.tiempo_estimado && (
            <>
              <span className="text-gray-300">·</span>
              <span>⏱ {order.tiempo_estimado} min</span>
            </>
          )}
          {order.estado_pago === 'pendiente' && (
            <>
              <span className="text-gray-300">·</span>
              <span className="font-semibold" style={{ color: '#D97706' }}>⚠ Pago pendiente</span>
            </>
          )}
          {order.estado_pago === 'pagado' && (
            <>
              <span className="text-gray-300">·</span>
              <span className="font-semibold" style={{ color: '#059669' }}>✓ Pagado</span>
            </>
          )}
        </div>

        {order.direccion && (
          <p className="text-xs text-gray-500 truncate">📍 {order.direccion}</p>
        )}

        {Array.isArray(order.notas) && order.notas.length > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
            📝 {order.notas.map(n => n.item !== 'general' ? `${n.item}: ${n.nota}` : n.nota).join(' · ')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 pb-3">
        {/* WhatsApp button — siempre visible */}
        <button
          onClick={() => openWhatsApp(order.telefono)}
          className="rounded-xl px-3 py-2 text-xs font-medium transition-colors"
          style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}
          title="Abrir en WhatsApp"
        >
          💬
        </button>

        {primaryNext && (
          <button
            onClick={() => onStatusChange(order.id, primaryNext)}
            disabled={updating}
            className="flex-1 rounded-xl py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: PRIMARY }}
          >
            {updating ? '…' : (STATE_FLOW.find(s => s.key === primaryNext)?.label ?? primaryNext)}
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => onStatusChange(order.id, 'cancelado')}
            disabled={updating}
            className="rounded-xl px-3 py-2 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Order detail panel ───────────────────────────────────────────────────────

function OrderDetailPanel({
  slug,
  order,
  onClose,
  onStatusChange,
  updatingId,
}: {
  slug: string
  order: Order
  onClose: () => void
  onStatusChange: (id: number, estado: string) => void
  updatingId: number | null
}) {
  const authFetch        = useAuthFetch()
  const [detail,         setDetail]         = useState<OrderDetail | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [estadoPago,     setEstadoPago]     = useState(order.estado_pago ?? 'pendiente')
  const [confirmingPago, setConfirmingPago] = useState(false)

  async function handleConfirmPago(nuevoEstado: 'pagado' | 'rechazado') {
    setConfirmingPago(true)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const res  = await authFetch(`${base}/dashboard/${slug}/orders/${order.id}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado_pago: nuevoEstado }),
      })
      if (res.ok) setEstadoPago(nuevoEstado)
    } catch { /* silent */ } finally {
      setConfirmingPago(false)
    }
  }

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL
    fetch(`${base}/public/${slug}/orders/${order.pedido_codigo}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          // Normalizar items para soportar tanto pedidos web como pedidos
          // de WhatsApp (n8n) que usan schema diferente en BD.
          setDetail({
            ...d,
            items: Array.isArray(d.items) ? d.items.map(normalizeItem) : [],
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [slug, order.pedido_codigo])

  const meta        = ESTADO_META[order.estado] ?? { label: order.estado, color: '#6B7280', bg: '#F3F4F6' }
  const transitions = TRANSITIONS[order.estado] ?? []
  const canCancel   = transitions.includes('cancelado')
  const updating    = updatingId === order.id
  const isDelivery  = order.tipo_despacho === 'delivery'

  // Índice del estado actual en el flujo canónico (para saber qué es "pasado")
  const flowKeys    = STATE_FLOW.map((s) => s.key)
  const currentIdx  = flowKeys.indexOf(order.estado)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-4 border-b border-gray-100">
          <div>
            <p className="font-mono text-xs text-gray-400">#{order.pedido_codigo}</p>
            <p className="text-base font-bold text-gray-900 mt-0.5">{order.nombre_cliente}</p>
            <p className="text-xs text-gray-500">{order.telefono} · {formatTime(order.created_at)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ color: meta.color, backgroundColor: meta.bg }}
            >
              {meta.label}
            </span>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Items */}
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="h-6 w-6 rounded-full border-4 border-gray-200 border-t-red-500 animate-spin" />
            </div>
          ) : detail ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Ítems del pedido
              </p>
              <div className="space-y-3">
                {detail.items.map((item, idx) => {
                  const extrasLabel = item.extras?.map((e) => e.name).join(', ')
                  return (
                    <div key={idx} className="flex justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {item.quantity}× {item.item_name}
                          {item.variant_name && (
                            <span className="text-gray-500 font-normal"> · {item.variant_name}</span>
                          )}
                        </p>
                        {extrasLabel && (
                          <p className="text-xs text-gray-400 mt-0.5">+ {extrasLabel}</p>
                        )}
                        {item.notas && (
                          <p className="text-xs text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-0.5 inline-block">
                            📝 {item.notas}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-gray-900 shrink-0 tabular-nums">
                        {fmt(item.unit_price * item.quantity)}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Totals */}
              <div className="border-t border-gray-100 mt-4 pt-3 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span><span>{fmt(detail.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Envío</span>
                  <span>{detail.costo_envio > 0 ? fmt(detail.costo_envio) : 'Sin costo'}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-gray-900">
                  <span>Total</span>
                  <span style={{ color: PRIMARY }}>{fmt(detail.total)}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No se pudieron cargar los ítems.</p>
          )}

          {/* Despacho + pago */}
          <div className="bg-gray-50 rounded-2xl px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Despacho</span>
              <span className="font-medium text-gray-900">
                {order.tipo_despacho === 'delivery' ? '🛵 Delivery' : '🏪 Retiro'}
              </span>
            </div>
            {order.direccion && (
              <div className="flex justify-between">
                <span className="text-gray-500">Dirección</span>
                <span className="font-medium text-gray-900 text-right max-w-[60%]">{order.direccion}</span>
              </div>
            )}
            {detail?.postal_code && (
              <div className="flex justify-between">
                <span className="text-gray-500">Código postal</span>
                <span className="font-medium text-gray-900">{detail.postal_code}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Pago</span>
              <span className="font-medium text-gray-900">
                {PAGO_LABEL[order.metodo_pago] ?? order.metodo_pago}
              </span>
            </div>
            {order.tiempo_estimado && (
              <div className="flex justify-between">
                <span className="text-gray-500">Tiempo estimado</span>
                <span className="font-medium text-gray-900">{order.tiempo_estimado} min</span>
              </div>
            )}
          </div>

          {Array.isArray(order.notas) && order.notas.length > 0 && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-xs font-semibold text-amber-800 mb-1">Notas del pedido</p>
              <ul className="space-y-1">
                {order.notas.map((n, i) => (
                  <li key={i} className="text-sm text-amber-700">
                    {n.item !== 'general' && (
                      <span className="font-medium">{n.item}: </span>
                    )}
                    {n.nota}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Estado de pago */}
          <div className="rounded-2xl border px-4 py-3 flex items-center justify-between"
            style={
              estadoPago === 'pagado'
                ? { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' }
                : estadoPago === 'rechazado'
                ? { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }
                : { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }
            }
          >
            <div>
              <p className="text-xs font-semibold mb-0.5"
                style={{ color: estadoPago === 'pagado' ? '#065F46' : estadoPago === 'rechazado' ? '#991B1B' : '#92400E' }}
              >
                {estadoPago === 'pagado' ? '✓ Pago confirmado' : estadoPago === 'rechazado' ? '✕ Pago rechazado' : '⚠ Pago pendiente'}
              </p>
              <p className="text-xs" style={{ color: estadoPago === 'pagado' ? '#047857' : estadoPago === 'rechazado' ? '#B91C1C' : '#B45309' }}>
                {PAGO_LABEL[order.metodo_pago] ?? order.metodo_pago}
              </p>
            </div>
            {estadoPago === 'pendiente' && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleConfirmPago('pagado')}
                  disabled={confirmingPago}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#059669' }}
                >
                  {confirmingPago ? '…' : '✓ Pagado'}
                </button>
                <button
                  onClick={() => handleConfirmPago('rechazado')}
                  disabled={confirmingPago}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#DC2626' }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Transferencia */}
          {detail?.datos_transferencia && (
            <div className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3">
              <p className="text-xs font-semibold text-blue-800 mb-2">Datos de transferencia</p>
              <div className="space-y-1 text-sm text-blue-700">
                {detail.datos_transferencia.banco    && <p><span className="font-medium">Banco:</span> {detail.datos_transferencia.banco}</p>}
                {detail.datos_transferencia.titular  && <p><span className="font-medium">Titular:</span> {detail.datos_transferencia.titular}</p>}
                {detail.datos_transferencia.cuenta   && <p><span className="font-medium">Cuenta:</span> {detail.datos_transferencia.cuenta}</p>}
                {detail.datos_transferencia.alias    && <p><span className="font-medium">Alias:</span> {detail.datos_transferencia.alias}</p>}
              </div>
            </div>
          )}
        </div>

        {/* ── Estado selector ─────────────────────────────────────────── */}
        <div className="px-5 pt-4 pb-2 border-t border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Estado del pedido
          </p>

          {/* Chips de estado operativo */}
          <div className="flex flex-wrap gap-2 mb-3">
            {STATE_FLOW
              // Para retiro ocultamos "En despacho" — no aplica
              .filter((s) => s.key !== 'en_camino' || isDelivery)
              .map((s) => {
                const stepIdx   = flowKeys.indexOf(s.key)
                const isCurrent = s.key === order.estado
                const isPast    = stepIdx >= 0 && currentIdx >= 0 && stepIdx < currentIdx
                const isNext    = transitions.includes(s.key)

                let bg    = '#F3F4F6'
                let color = '#9CA3AF'
                let cursor = 'default'
                let opacity = '1'

                if (isCurrent) {
                  bg     = PRIMARY
                  color  = '#FFFFFF'
                } else if (isPast) {
                  bg     = '#F3F4F6'
                  color  = '#6B7280'
                  opacity = '0.5'
                } else if (isNext) {
                  bg     = '#F9FAFB'
                  color  = '#374151'
                  cursor = 'pointer'
                }

                return (
                  <button
                    key={s.key}
                    disabled={!isNext || isCurrent || updating}
                    onClick={() => {
                      if (isNext && !isCurrent) { onStatusChange(order.id, s.key); onClose() }
                    }}
                    style={{ backgroundColor: bg, color, opacity, cursor }}
                    className="flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold transition-all border border-transparent hover:border-gray-200 disabled:cursor-default"
                  >
                    <span>{s.emoji}</span>
                    <span>{isCurrent ? '✓ ' : ''}{s.label}</span>
                  </button>
                )
              })}
          </div>

          {/* Cancelar — separado visualmente */}
          {canCancel && (
            <button
              onClick={() => { onStatusChange(order.id, 'cancelado'); onClose() }}
              disabled={updating}
              className="w-full rounded-2xl py-2.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50 border border-red-100"
            >
              ✕ Cancelar pedido
            </button>
          )}

          {/* Expirar — solo para recibido (ventana cerrada manualmente) */}
          {order.estado === 'recibido' && (
            <button
              onClick={() => { onStatusChange(order.id, 'expirado'); onClose() }}
              disabled={updating}
              className="w-full rounded-2xl py-2.5 text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 border border-gray-200 mt-2"
            >
              ⏱ Expirar pedido
            </button>
          )}
        </div>

        {/* ── Acciones secundarias ─────────────────────────────────────────────────────────────────────────────── */}
        <div className="flex gap-2 px-5 pb-8 pt-3">
          <button
            onClick={() => printComanda(order, detail)}
            className="rounded-2xl px-4 py-3 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            title="Imprimir comanda"
          >
            🖨
          </button>
          <button
            onClick={() => openWhatsApp(order.telefono)}
            className="rounded-2xl px-4 py-3 text-sm font-medium transition-colors"
            style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}
            title="Abrir WhatsApp"
          >
            💬
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Notifications hook ───────────────────────────────────────────────────────

interface EscalacionNotif {
  id: number
  pedido_id: number
  pedido_codigo: string
  telefono: string
  nombre_cliente: string
  problema: string
  created_at: string
}

interface NotifData {
  badge: number
  escalaciones: EscalacionNotif[]
  pedidos_expirados_24h: number
}

function useNotifications(
  slug: string,
  authFetch: ReturnType<typeof useAuthFetch>,
  enabled: boolean,
) {
  const [data,    setData]    = useState<NotifData>({ badge: 0, escalaciones: [], pedidos_expirados_24h: 0 })
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetch_ = useCallback(async () => {
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const res  = await authFetch(`${base}/dashboard/${slug}/notifications`)
      if (res.ok) setData(await res.json())
    } catch { /* silent */ }
  }, [slug, authFetch])

  useEffect(() => {
    if (!enabled) return
    fetch_()
    timerRef.current = setTimeout(function poll() {
      fetch_()
      timerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
    }, POLL_INTERVAL_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [fetch_, enabled])

  return { notifData: data, refetchNotifs: fetch_ }
}

// ─── Notification bell ────────────────────────────────────────────────────────

function NotificationBell({
  slug,
  data,
}: {
  slug: string
  data: NotifData
}) {
  const router              = useRouter()
  const [open, setOpen]     = useState(false)
  const panelRef            = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-xl px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 transition-colors"
        title="Notificaciones"
      >
        🔔
        {data.badge > 0 && (
          <span
            className="absolute -top-1 -right-1 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center text-white font-bold"
            style={{ fontSize: '9px', backgroundColor: PRIMARY }}
          >
            {data.badge > 9 ? '9+' : data.badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">Notificaciones</p>
            {data.pedidos_expirados_24h > 0 && (
              <span className="text-xs text-gray-400">{data.pedidos_expirados_24h} exp. hoy</span>
            )}
          </div>

          {data.escalaciones.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-xs text-gray-400">Sin escalaciones pendientes</p>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
              {data.escalaciones.slice(0, 5).map((esc) => (
                <div key={esc.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">
                        {esc.nombre_cliente}
                        <span className="font-normal text-gray-400 ml-1">#{esc.pedido_codigo}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{esc.problema}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{timeAgo(esc.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-2.5 border-t border-gray-100">
            <button
              onClick={() => { router.push(`/dashboard/${slug}/escalaciones`); setOpen(false) }}
              className="w-full text-xs font-medium text-center transition-colors hover:opacity-80"
              style={{ color: PRIMARY }}
            >
              Ver todas las escalaciones →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Status toggle ─────────────────────────────────────────────────────────────────────────────────

function StatusToggle({ slug, authFetch }: { slug: string; authFetch: ReturnType<typeof useAuthFetch> }) {
  const [isOpen, setIsOpen]     = useState<boolean | null>(null)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL
    authFetch(`${base}/dashboard/${slug}/restaurant/status`)
      .then((r) => r.json())
      .then((d: { is_open: boolean }) => setIsOpen(d.is_open))
      .catch(() => {})
  }, [slug, authFetch])

  async function toggle() {
    if (isOpen === null || toggling) return
    setToggling(true)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const res  = await authFetch(`${base}/dashboard/${slug}/restaurant/status`, {
        method: 'PATCH',
        body:   JSON.stringify({ is_open_override: !isOpen }),
      })
      if (res.ok) {
        const d: { is_open_effective: boolean } = await res.json()
        setIsOpen(d.is_open_effective)
      }
    } finally {
      setToggling(false)
    }
  }

  if (isOpen === null) return null

  return (
    <button
      onClick={toggle}
      disabled={toggling}
      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
      style={{
        backgroundColor: isOpen ? '#D1FAE5' : '#FEE2E2',
        color:           isOpen ? '#065F46' : '#991B1B',
      }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: isOpen ? '#10B981' : '#EF4444' }}
      />
      {toggling ? '…' : isOpen ? 'Abierto' : 'Cerrado'}
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { slug }  = useParams<{ slug: string }>()
  const router    = useRouter()
  const authFetch = useAuthFetch()

  useEffect(() => {
    localStorage.setItem('easyorder-last-slug', slug)
  }, [slug])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const [orders,        setOrders]        = useState<Order[]>([])
  const [total,         setTotal]         = useState(0)
  const [newCount,      setNewCount]      = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const [filter,        setFilter]        = useState('')
  const [updatingId,    setUpdatingId]    = useState<number | null>(null)
  const [lastUpdated,   setLastUpdated]   = useState<Date | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { notifData } = useNotifications(slug, authFetch, !loading)

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const url  = filter
        ? `${base}/dashboard/${slug}/orders?estado=${filter}`
        : `${base}/dashboard/${slug}/orders`
      const res  = await authFetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { orders: Order[]; total: number } = await res.json()
      setOrders(data.orders)
      setTotal(data.total)
      if (!filter) {
        setNewCount(data.orders.filter((o) => o.estado === 'recibido').length)
      }
      setLastUpdated(new Date())
    } catch {
      setError('No se pudieron cargar los pedidos.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [slug, filter, authFetch])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    timerRef.current = setTimeout(function poll() {
      fetchOrders(true)
      timerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
    }, POLL_INTERVAL_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [fetchOrders])

  async function handleStatusChange(id: number, estado: string) {
    setUpdatingId(id)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const res  = await authFetch(`${base}/dashboard/${slug}/orders/${id}/status`, {
        method: 'PATCH',
        body:   JSON.stringify({ estado }),
      })
      if (!res.ok) throw new Error()
      const updated: { id: number; estado: string; updated_at: string } = await res.json()
      setOrders((prev) =>
        prev
          .map((o) => o.id === updated.id ? { ...o, estado: updated.estado, updated_at: updated.updated_at } : o)
          .filter((o) => {
            if (filter !== '') return true
            return !['entregado', 'cancelado', 'expirado'].includes(o.estado)
          })
      )
      setNewCount((prev) => {
        if (estado !== 'recibido' && updated.estado !== 'recibido') {
          const wasRecibido = orders.find((o) => o.id === id)?.estado === 'recibido'
          return wasRecibido ? Math.max(0, prev - 1) : prev
        }
        return prev
      })
      setSelectedOrder((prev) =>
        prev?.id === updated.id ? { ...prev, estado: updated.estado, updated_at: updated.updated_at } : prev
      )
    } catch {
      // Silent fail
    } finally {
      setUpdatingId(null)
    }
  }

  const activeTab = FILTER_TABS.find((t) => t.key === filter) ?? FILTER_TABS[0]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-8 w-8 rounded-xl flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: PRIMARY }}
            >
              E
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-none">Pedidos</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <button
                  onClick={() => router.push(`/dashboard/${slug}/metricas`)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors capitalize"
                >
                  {slug} · métricas →
                </button>
                <span className="text-gray-200">|</span>
                <button
                  onClick={() => router.push(`/dashboard/${slug}/configuracion`)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  ⚙ config
                </button>
                <span className="text-gray-200">|</span>
                <button
                  onClick={() => router.push(`/dashboard/${slug}/clientes`)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  👥 clientes
                </button>
                <span className="text-gray-200">|</span>
                <button
                  onClick={() => router.push(`/dashboard/${slug}/menu`)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  🍽 menú
                </button>
                <span className="text-gray-200">|</span>
                <button
                  onClick={() => router.push(`/dashboard/${slug}/escalaciones`)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  🙋 derivados
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-gray-400 hidden sm:block">
                {timeAgo(lastUpdated.toISOString())}
              </span>
            )}
            <StatusToggle slug={slug} authFetch={authFetch} />
            <NotificationBell slug={slug} data={notifData} />
            <button
              onClick={() => fetchOrders()}
              className="rounded-xl px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              ↻
            </button>
            <button
              onClick={handleLogout}
              className="rounded-xl px-3 py-2 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Salir
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 pb-0 flex gap-1 overflow-x-auto scrollbar-none">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`shrink-0 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap flex items-center gap-1 ${
                filter === tab.key
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.key === 'recibido' && newCount > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-xs font-bold text-white leading-none"
                  style={{ backgroundColor: PRIMARY }}
                >
                  {newCount}
                </span>
              )}
              {tab.key === '' && newCount > 0 && (
                <span
                  className="rounded-full w-2 h-2 inline-block"
                  style={{ backgroundColor: PRIMARY }}
                />
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-red-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-5 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => fetchOrders()}
              className="mt-3 text-xs text-red-600 underline"
            >
              Reintentar
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="text-5xl">🎉</span>
            <p className="text-sm text-gray-500">
              {filter ? `No hay pedidos en "${activeTab.label}"` : 'No hay pedidos activos por ahora'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-4">
              {total} pedido{total !== 1 ? 's' : ''}
              {newCount > 0 && filter === '' && (
                <span className="ml-2 font-semibold" style={{ color: PRIMARY }}>
                  · {newCount} por confirmar
                </span>
              )}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onStatusChange={handleStatusChange}
                  updating={updatingId === order.id}
                  onSelect={setSelectedOrder}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {selectedOrder && (
        <OrderDetailPanel
          slug={slug}
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={handleStatusChange}
          updatingId={updatingId}
        />
      )}
    </div>
  )
}