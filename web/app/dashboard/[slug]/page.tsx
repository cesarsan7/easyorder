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
  items: unknown[]
  created_at: string
  updated_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000
const PRIMARY = '#F3274C'

const ESTADO_META: Record<string, { label: string; color: string; bg: string }> = {
  recibido:       { label: 'Por confirmar',  color: '#92400E', bg: '#FEF3C7' },
  en_curso:       { label: 'En curso',       color: '#6B7280', bg: '#F3F4F6' },
  pendiente_pago: { label: 'Pend. pago',     color: '#D97706', bg: '#FEF3C7' },
  confirmado:     { label: 'Confirmado',     color: '#2563EB', bg: '#DBEAFE' },
  pagado:         { label: 'Pagado',         color: '#059669', bg: '#D1FAE5' },
  en_preparacion: { label: 'Preparando',     color: '#7C3AED', bg: '#EDE9FE' },
  listo:          { label: 'Listo',          color: '#059669', bg: '#D1FAE5' },
  en_camino:      { label: 'En camino',      color: '#0284C7', bg: '#E0F2FE' },
  entregado:      { label: 'Entregado',      color: '#6B7280', bg: '#F3F4F6' },
  cancelado:      { label: 'Cancelado',      color: '#DC2626', bg: '#FEE2E2' },
  expirado:       { label: 'Expirado',       color: '#6B7280', bg: '#F3F4F6' },
}

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

const STATE_FLOW: { key: string; emoji: string; label: string }[] = [
  { key: 'recibido',       emoji: '⏳', label: 'Por confirmar'  },
  { key: 'confirmado',     emoji: '✓',  label: 'Confirmado'     },
  { key: 'en_preparacion', emoji: '🍳', label: 'En preparacion' },
  { key: 'listo',          emoji: '🔔', label: 'Listo'          },
  { key: 'en_camino',      emoji: '🛵', label: 'En despacho'    },
  { key: 'entregado',      emoji: '📦', label: 'Entregado'      },
]

const FILTER_TABS = [
  { key: '',               label: 'Activos'       },
  { key: 'recibido',       label: 'Por confirmar' },
  { key: 'pendiente_pago', label: 'Pend. pago'    },
  { key: 'en_preparacion', label: 'Preparando'    },
  { key: 'entregado',      label: 'Entregados'    },
  { key: 'cancelado',      label: 'Cancelados'    },
  { key: 'expirado',       label: 'Expirados'     },
]

const PAGO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transfer.', tarjeta: 'Tarjeta', bizum: 'Bizum', online: 'Online',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number)   { return `${n.toFixed(2).replace('.', ',')}` }
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s/60)}m`
  return `${Math.floor(s/3600)}h`
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Atlantic/Canary' })
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', timeZone: 'Atlantic/Canary' })
}
function openWhatsApp(tel: string) { window.open(`https://wa.me/${tel.replace(/\D/g,'')}`, '_blank') }

type DatePreset = 'hoy' | 'ayer' | '7dias' | 'mes' | 'rango' | null
function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getDateRange(preset: DatePreset, from: string, to: string) {
  const today = new Date()
  if (preset === 'hoy')   { const d = localDateStr(today); return { fecha_desde: d, fecha_hasta: d } }
  if (preset === 'ayer')  { const y = new Date(today); y.setDate(y.getDate()-1); const d = localDateStr(y); return { fecha_desde: d, fecha_hasta: d } }
  if (preset === '7dias') { const w = new Date(today); w.setDate(w.getDate()-6); return { fecha_desde: localDateStr(w), fecha_hasta: localDateStr(today) } }
  if (preset === 'mes')   { const f = new Date(today.getFullYear(), today.getMonth(), 1); return { fecha_desde: localDateStr(f), fecha_hasta: localDateStr(today) } }
  if (preset === 'rango' && from && to) return { fecha_desde: from, fecha_hasta: to }
  return {} as Record<string, string>
}

// ─── normalizeItem ────────────────────────────────────────────────────────────

function normalizeItem(raw: unknown): OrderItem {
  const r = raw as Record<string, unknown>
  if (typeof r.item_name === 'string') return {
    menu_item_id: Number(r.menu_item_id ?? 0), item_name: r.item_name,
    variant_name: (r.variant_name as string | null) ?? null,
    quantity: Number(r.quantity ?? 1), unit_price: Number(r.unit_price ?? 0),
    notas: typeof r.notas === 'string' && r.notas.trim() ? r.notas.trim() : null,
    extras: Array.isArray(r.extras) ? (r.extras as OrderItem['extras']) : undefined,
  }
  return {
    menu_item_id: 0, item_name: String(r.nombre ?? r.name ?? 'Producto'), variant_name: null,
    quantity: Number(r.cantidad ?? r.quantity ?? 1), unit_price: Number(r.precio_unitario ?? r.unit_price ?? 0),
    notas: typeof r.notas === 'string' && r.notas.trim() ? r.notas.trim() : null,
    extras: Array.isArray(r.extras) ? (r.extras as OrderItem['extras']) : undefined,
  }
}

// ─── printComanda ─────────────────────────────────────────────────────────────

function printComanda(order: Order, detail: OrderDetail | null) {
  const items = detail?.items ?? []
  const html = `<html><head><title>Comanda #${order.pedido_codigo}</title>
  <style>body{font-family:monospace;font-size:13px;max-width:280px;margin:0 auto;padding:8px}
  h2{text-align:center;font-size:15px;border-bottom:1px dashed #000;padding-bottom:6px}
  .row{display:flex;justify-content:space-between;margin:4px 0}.sep{border-top:1px dashed #000;margin:6px 0}.bold{font-weight:bold}</style></head><body>
  <h2>COMANDA</h2>
  <div class="row"><span>${order.pedido_codigo}</span><span>${formatTime(order.created_at)}</span></div>
  <div class="row bold"><span>${order.nombre_cliente}</span><span>${order.telefono}</span></div>
  <div class="sep"></div>
  ${items.map(i=>`<div class="row"><span>${i.quantity}x ${i.item_name}${i.variant_name?' ('+i.variant_name+')':''}</span><span>${fmt(i.unit_price*i.quantity)}</span></div>${(i.extras??[]).map(e=>`<div style="padding-left:12px;color:#666">+ ${e.name}</div>`).join('')}`).join('')}
  <div class="sep"></div>
  <div class="row"><span>Despacho</span><span>${order.tipo_despacho==='delivery'?'Delivery':'Retiro'}</span></div>
  ${order.direccion?`<div style="font-size:11px">${order.direccion}</div>`:''}
  <div class="sep"></div>
  <div class="row bold"><span>TOTAL</span><span>${fmt(order.total)}</span></div>
  </body></html>`
  const win = window.open('','_blank','width=350,height=600')
  if (!win) return; win.document.write(html); win.document.close(); win.focus()
  setTimeout(()=>{win.print();win.close()},300)
}

// ─── OrderDetailPanel ────────────────────────────────────────────────────────

function OrderDetailPanel({ slug, order, onClose, onStatusChange, updatingId }: {
  slug: string; order: Order; onClose: () => void
  onStatusChange: (id: number, estado: string) => void; updatingId: number | null
}) {
  const authFetch = useAuthFetch()
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(true)
  const [estadoPago, setEstadoPago] = useState(order.estado_pago ?? 'pendiente')
  const [confirmingPago, setConfirmingPago] = useState(false)

  async function handleConfirmPago(nuevoEstado: 'pagado' | 'rechazado') {
    setConfirmingPago(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/orders/${order.id}/payment`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado_pago: nuevoEstado }),
      })
      if (res.ok) setEstadoPago(nuevoEstado)
    } catch { /* silent */ } finally { setConfirmingPago(false) }
  }

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/orders/${order.pedido_codigo}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDetail({ ...d, items: Array.isArray(d.items) ? d.items.map(normalizeItem) : [] }) })
      .catch(()=>{}).finally(()=>setLoadingDetail(false))
  }, [slug, order.pedido_codigo])

  const meta = ESTADO_META[order.estado] ?? { label: order.estado, color: '#6B7280', bg: '#F3F4F6' }
  const transitions = TRANSITIONS[order.estado] ?? []
  const canCancel = transitions.includes('cancelado')
  const updating = updatingId === order.id
  const isDelivery = order.tipo_despacho === 'delivery'
  const flowKeys = STATE_FLOW.map(s => s.key)
  const currentIdx = flowKeys.indexOf(order.estado)

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-4 border-b border-gray-100">
          <div>
            <p className="font-mono text-xs text-gray-400">#{order.pedido_codigo}</p>
            <p className="text-base font-bold text-gray-900 mt-0.5">{order.nombre_cliente}</p>
            <p className="text-xs text-gray-500">{order.telefono} · {formatTime(order.created_at)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ color: meta.color, backgroundColor: meta.bg }}>{meta.label}</span>
            <button onClick={onClose}
              className="h-8 w-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 text-lg">x</button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {loadingDetail ? (
            <div className="flex justify-center py-6">
              <div className="h-6 w-6 rounded-full border-4 border-gray-200 border-t-red-500 animate-spin" />
            </div>
          ) : detail ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Items del pedido</p>
              <div className="space-y-3">
                {detail.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {item.quantity}x {item.item_name}
                        {item.variant_name && <span className="text-gray-500 font-normal"> · {item.variant_name}</span>}
                      </p>
                      {item.extras && item.extras.length > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">+ {item.extras.map(e=>e.name).join(', ')}</p>
                      )}
                      {item.notas && (
                        <p className="text-xs text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-0.5 inline-block">{item.notas}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-900 shrink-0 tabular-nums">
                      {fmt(item.unit_price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 mt-4 pt-3 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span><span>{fmt(detail.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Envio</span><span>{detail.costo_envio > 0 ? fmt(detail.costo_envio) : 'Sin costo'}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-gray-900">
                  <span>Total</span><span style={{ color: PRIMARY }}>{fmt(detail.total)}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No se pudieron cargar los items.</p>
          )}

          <div className="bg-gray-50 rounded-2xl px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Despacho</span>
              <span className="font-medium">{isDelivery ? 'Delivery' : 'Retiro en local'}</span>
            </div>
            {order.direccion && (
              <div className="flex justify-between">
                <span className="text-gray-500">Direccion</span>
                <span className="font-medium text-right max-w-[60%]">{order.direccion}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Pago</span>
              <span className="font-medium">{PAGO_LABEL[order.metodo_pago] ?? order.metodo_pago}</span>
            </div>
            {order.tiempo_estimado && (
              <div className="flex justify-between">
                <span className="text-gray-500">Tiempo est.</span>
                <span className="font-medium">{order.tiempo_estimado} min</span>
              </div>
            )}
          </div>

          {Array.isArray(order.notas) && order.notas.length > 0 && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-xs font-semibold text-amber-800 mb-1">Notas</p>
              {order.notas.map((n, i) => (
                <p key={i} className="text-sm text-amber-700">
                  {n.item !== 'general' && <span className="font-medium">{n.item}: </span>}{n.nota}
                </p>
              ))}
            </div>
          )}

          <div className="rounded-2xl border px-4 py-3 flex items-center justify-between"
            style={estadoPago==='pagado'?{backgroundColor:'#D1FAE5',borderColor:'#6EE7B7'}:estadoPago==='rechazado'?{backgroundColor:'#FEE2E2',borderColor:'#FCA5A5'}:{backgroundColor:'#FEF3C7',borderColor:'#FCD34D'}}>
            <p className="text-xs font-semibold"
              style={{color:estadoPago==='pagado'?'#065F46':estadoPago==='rechazado'?'#991B1B':'#92400E'}}>
              {estadoPago==='pagado'?'Pago confirmado':estadoPago==='rechazado'?'Pago rechazado':'Pago pendiente'}
            </p>
            {estadoPago === 'pendiente' && (
              <div className="flex gap-2">
                <button onClick={()=>handleConfirmPago('pagado')} disabled={confirmingPago}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  style={{backgroundColor:'#059669'}}>{confirmingPago?'...':'Confirmar'}</button>
                <button onClick={()=>handleConfirmPago('rechazado')} disabled={confirmingPago}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  style={{backgroundColor:'#DC2626'}}>X</button>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pt-4 pb-2 border-t border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Estado del pedido</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {STATE_FLOW.filter(s => s.key !== 'en_camino' || isDelivery).map(s => {
              const stepIdx = flowKeys.indexOf(s.key)
              const isCurrent = s.key === order.estado
              const isPast = stepIdx >= 0 && currentIdx >= 0 && stepIdx < currentIdx
              const isNext = transitions.includes(s.key)
              return (
                <button key={s.key}
                  disabled={!isNext || isCurrent || updating}
                  onClick={() => { if (isNext && !isCurrent) { onStatusChange(order.id, s.key); onClose() } }}
                  className="flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold transition-all border border-transparent hover:border-gray-200 disabled:cursor-default"
                  style={{
                    backgroundColor: isCurrent ? PRIMARY : '#F3F4F6',
                    color: isCurrent ? '#fff' : isPast ? '#9CA3AF' : '#374151',
                    opacity: isPast ? '0.5' : '1',
                    cursor: isNext && !isCurrent ? 'pointer' : 'default',
                  }}>
                  <span>{s.emoji}</span>
                  <span>{isCurrent ? '' : ''}{s.label}</span>
                </button>
              )
            })}
          </div>
          {canCancel && (
            <button onClick={() => { onStatusChange(order.id, 'cancelado'); onClose() }} disabled={updating}
              className="w-full rounded-2xl py-2.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 disabled:opacity-50">
              Cancelar pedido
            </button>
          )}
          {order.estado === 'recibido' && (
            <button onClick={() => { onStatusChange(order.id, 'expirado'); onClose() }} disabled={updating}
              className="w-full mt-2 rounded-2xl py-2.5 text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 disabled:opacity-50">
              Expirar pedido
            </button>
          )}
        </div>

        <div className="flex gap-2 px-5 pb-8 pt-3">
          <button onClick={() => printComanda(order, detail)}
            className="rounded-2xl px-4 py-3 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">
            Imprimir
          </button>
          <button onClick={() => openWhatsApp(order.telefono)}
            className="rounded-2xl px-4 py-3 text-sm font-medium"
            style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}>
            WhatsApp
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Notifications ────────────────────────────────────────────────────────────

interface EscalacionNotif {
  id: number; pedido_id: number; pedido_codigo: string
  telefono: string; nombre_cliente: string; problema: string; created_at: string
}
interface NotifData {
  badge: number; escalaciones: EscalacionNotif[]; pedidos_expirados_24h: number
}
function useNotifications(slug: string, authFetch: ReturnType<typeof useAuthFetch>, enabled: boolean) {
  const [data, setData] = useState<NotifData>({ badge: 0, escalaciones: [], pedidos_expirados_24h: 0 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetch_ = useCallback(async () => {
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/notifications`)
      if (res.ok) setData(await res.json())
    } catch { /* silent */ }
  }, [slug, authFetch])
  useEffect(() => {
    if (!enabled) return; fetch_()
    timerRef.current = setTimeout(function poll() { fetch_(); timerRef.current = setTimeout(poll, POLL_INTERVAL_MS) }, POLL_INTERVAL_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [fetch_, enabled])
  return { notifData: data, refetchNotifs: fetch_ }
}

// ─── StatusToggle ─────────────────────────────────────────────────────────────

function StatusToggle({ slug, authFetch }: { slug: string; authFetch: ReturnType<typeof useAuthFetch> }) {
  const [isOpen, setIsOpen] = useState<boolean | null>(null)
  const [toggling, setToggling] = useState(false)
  useEffect(() => {
    authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/restaurant/status`)
      .then(r => r.json()).then((d: { is_open: boolean }) => setIsOpen(d.is_open)).catch(()=>{})
  }, [slug, authFetch])
  async function toggle() {
    if (isOpen === null || toggling) return; setToggling(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/restaurant/status`, {
        method: 'PATCH', body: JSON.stringify({ is_open_override: !isOpen }),
      })
      if (res.ok) { const d: { is_open_effective: boolean } = await res.json(); setIsOpen(d.is_open_effective) }
    } finally { setToggling(false) }
  }
  if (isOpen === null) return null
  return (
    <button onClick={toggle} disabled={toggling}
      className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
      style={{ backgroundColor: isOpen ? '#D1FAE5' : '#FEE2E2', color: isOpen ? '#065F46' : '#991B1B' }}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: isOpen ? '#10B981' : '#EF4444' }} />
      {toggling ? '...' : isOpen ? 'Abierto' : 'Cerrado'}
    </button>
  )
}

// ─── Sidebar nav ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: '',              icon: '📋', label: 'Pedidos'    },
  { href: '/metricas',     icon: '📊', label: 'Metricas'   },
  { href: '/menu',         icon: '🍽',  label: 'Menu'       },
  { href: '/clientes',     icon: '👥', label: 'Clientes'   },
  { href: '/configuracion',icon: '⚙',  label: 'Config'     },
  { href: '/escalaciones', icon: '🙋', label: 'Derivados'  },
]

function Sidebar({ slug, active, notifBadge }: { slug: string; active: string; notifBadge: number }) {
  const router = useRouter()
  return (
    <aside className="hidden lg:flex flex-col bg-white border-r border-gray-100 w-56 shrink-0 min-h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center text-white font-black text-sm"
            style={{ backgroundColor: PRIMARY }}>E</div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-none">EasyOrder</p>
            <p className="text-xs text-gray-400 capitalize mt-0.5">{slug}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(item => {
          const href = `/dashboard/${slug}${item.href}`
          const isActive = active === item.href
          return (
            <button key={item.href} onClick={() => router.push(href)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left"
              style={isActive
                ? { backgroundColor: '#FFF1F3', color: PRIMARY }
                : { color: '#6B7280' }}>
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
              {item.href === '/escalaciones' && notifBadge > 0 && (
                <span className="ml-auto rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: PRIMARY }}>{notifBadge > 9 ? '9+' : notifBadge}</span>
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const authFetch = useAuthFetch()

  useEffect(() => { localStorage.setItem('easyorder-last-slug', slug) }, [slug])

  async function handleLogout() {
    const supabase = createClient(); await supabase.auth.signOut(); router.replace('/login')
  }

  const [orders,        setOrders]        = useState<Order[]>([])
  const [total,         setTotal]         = useState(0)
  const [newCount,      setNewCount]      = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const [filter,        setFilter]        = useState('')
  const [datePreset,    setDatePreset]    = useState<DatePreset>(null)
  const [dateFrom,      setDateFrom]      = useState('')
  const [dateTo,        setDateTo]        = useState('')
  const [updatingId,    setUpdatingId]    = useState<number | null>(null)
  const [lastUpdated,   setLastUpdated]   = useState<Date | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const DATE_PRESETS: { key: DatePreset; label: string }[] = [
    { key: 'hoy',   label: 'Hoy'     },
    { key: 'ayer',  label: 'Ayer'     },
    { key: '7dias', label: '7 dias'   },
    { key: 'mes',   label: 'Este mes' },
    { key: 'rango', label: 'Rango'   },
  ]

  const { notifData } = useNotifications(slug, authFetch, !loading)

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (filter) params.set('estado', filter)
      const range = getDateRange(datePreset, dateFrom, dateTo)
      if (range.fecha_desde) params.set('fecha_desde', range.fecha_desde)
      if (range.fecha_hasta) params.set('fecha_hasta', range.fecha_hasta)
      const qs = params.toString()
      const url = `${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/orders${qs ? '?' + qs : ''}`
      const res = await authFetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { orders: Order[]; total: number } = await res.json()
      setOrders(data.orders); setTotal(data.total)
      if (!filter && !datePreset) setNewCount(data.orders.filter(o => o.estado === 'recibido').length)
      setLastUpdated(new Date())
    } catch { setError('No se pudieron cargar los pedidos.') }
    finally { if (!silent) setLoading(false) }
  }, [slug, filter, datePreset, dateFrom, dateTo, authFetch])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => {
    timerRef.current = setTimeout(function poll() {
      fetchOrders(true); timerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
    }, POLL_INTERVAL_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [fetchOrders])

  async function handleStatusChange(id: number, estado: string) {
    setUpdatingId(id)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/orders/${id}/status`, {
        method: 'PATCH', body: JSON.stringify({ estado }),
      })
      if (!res.ok) throw new Error()
      const updated: { id: number; estado: string; updated_at: string } = await res.json()
      setOrders(prev => prev
        .map(o => o.id === updated.id ? { ...o, estado: updated.estado, updated_at: updated.updated_at } : o)
        .filter(o => { if (filter !== '') return true; return !['entregado','cancelado','expirado'].includes(o.estado) }))
      setNewCount(prev => {
        if (estado !== 'recibido' && updated.estado !== 'recibido') {
          const wasRecibido = orders.find(o => o.id === id)?.estado === 'recibido'
          return wasRecibido ? Math.max(0, prev - 1) : prev
        }
        return prev
      })
      setSelectedOrder(prev => prev?.id === updated.id ? { ...prev, estado: updated.estado, updated_at: updated.updated_at } : prev)
    } catch { /* silent */ }
    finally { setUpdatingId(null) }
  }

  const activeTab = FILTER_TABS.find(t => t.key === filter) ?? FILTER_TABS[0]

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar slug={slug} active="" notifBadge={notifData.badge} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
          <div className="px-5 py-3 flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-gray-900">Pedidos</h1>
              {lastUpdated && (
                <p className="text-xs text-gray-400">Actualizado {timeAgo(lastUpdated.toISOString())}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusToggle slug={slug} authFetch={authFetch} />
              {notifData.badge > 0 && (
                <button onClick={() => router.push(`/dashboard/${slug}/escalaciones`)}
                  className="relative rounded-lg px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                  {notifData.badge} alerta{notifData.badge !== 1 ? 's' : ''}
                </button>
              )}
              <button onClick={() => fetchOrders()}
                className="rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 transition-colors">
                Actualizar
              </button>
              <button onClick={handleLogout}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
                Salir
              </button>
            </div>
          </div>

          {/* Stat chips */}
          {!loading && (
            <div className="px-5 pb-3 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100">
                <span className="text-xs text-gray-500">Total</span>
                <span className="text-sm font-bold text-gray-900">{total}</span>
              </div>
              {newCount > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 border"
                  style={{ backgroundColor: '#FFF1F3', borderColor: '#FECDD3' }}>
                  <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: PRIMARY }} />
                  <span className="text-xs font-semibold" style={{ color: PRIMARY }}>{newCount} por confirmar</span>
                </div>
              )}
            </div>
          )}

          {/* Status filter tabs */}
          <div className="px-5 flex gap-0.5 overflow-x-auto scrollbar-none border-t border-gray-50">
            {FILTER_TABS.map(tab => (
              <button key={tab.key} onClick={() => setFilter(tab.key)}
                className="shrink-0 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1"
                style={filter === tab.key
                  ? { borderColor: PRIMARY, color: PRIMARY }
                  : { borderColor: 'transparent', color: '#6B7280' }}>
                {tab.label}
                {tab.key === 'recibido' && newCount > 0 && (
                  <span className="rounded-full px-1.5 py-0.5 text-xs font-bold text-white leading-none"
                    style={{ backgroundColor: PRIMARY }}>{newCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* Date preset bar */}
          <div className="px-5 py-2 flex flex-wrap items-center gap-2 border-t border-gray-50">
            {DATE_PRESETS.map(p => (
              <button key={p.key as string}
                onClick={() => setDatePreset(datePreset === p.key ? null : p.key)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap"
                style={datePreset === p.key
                  ? { backgroundColor: PRIMARY, color: '#fff' }
                  : { backgroundColor: '#F3F4F6', color: '#6B7280' }}>
                {p.label}
              </button>
            ))}
            {datePreset === 'rango' && (
              <div className="flex items-center gap-1.5">
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="rounded-lg border border-gray-200 text-xs px-2 py-1 focus:outline-none" />
                <span className="text-xs text-gray-400">-</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="rounded-lg border border-gray-200 text-xs px-2 py-1 focus:outline-none" />
              </div>
            )}
            {datePreset && (
              <button onClick={() => { setDatePreset(null); setDateFrom(''); setDateTo('') }}
                className="text-xs text-gray-400 hover:text-gray-600 ml-1">
                x limpiar
              </button>
            )}
          </div>
        </header>

        {/* Orders table */}
        <main className="flex-1 px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-red-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-5 text-center">
              <p className="text-sm text-red-700">{error}</p>
              <button onClick={() => fetchOrders()} className="mt-3 text-xs text-red-600 underline">Reintentar</button>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <span className="text-5xl">🎉</span>
              <p className="text-sm text-gray-500">
                {filter ? `No hay pedidos en "${activeTab.label}"` : 'No hay pedidos activos por ahora'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Table header */}
              <div className="hidden md:grid grid-cols-[1fr_140px_100px_100px_120px_100px] gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Despacho</span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Total</span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hora</span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Accion</span>
              </div>

              {/* Table rows */}
              <div className="divide-y divide-gray-50">
                {orders.map(order => {
                  const meta = ESTADO_META[order.estado] ?? { label: order.estado, color: '#6B7280', bg: '#F3F4F6' }
                  const transitions = TRANSITIONS[order.estado] ?? []
                  const primaryNext = transitions.filter(t => t !== 'cancelado')[0]
                  const isNew = order.estado === 'recibido'
                  return (
                    <div key={order.id}
                      className="grid md:grid-cols-[1fr_140px_100px_100px_120px_100px] grid-cols-1 gap-2 md:gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer items-center"
                      style={{ borderLeft: isNew ? `3px solid ${PRIMARY}` : '3px solid transparent' }}
                      onClick={() => setSelectedOrder(order)}>
                      {/* Cliente */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-400">#{order.pedido_codigo}</span>
                          {isNew && (
                            <span className="rounded-full px-1.5 py-0.5 text-xs font-bold text-white leading-none"
                              style={{ backgroundColor: PRIMARY }}>NUEVO</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-gray-900 truncate">{order.nombre_cliente}</p>
                        <p className="text-xs text-gray-400">{order.telefono}</p>
                      </div>

                      {/* Estado */}
                      <div>
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{ color: meta.color, backgroundColor: meta.bg }}>
                          {meta.label}
                        </span>
                        {order.estado_pago === 'pendiente' && (
                          <p className="text-xs mt-0.5 font-medium" style={{ color: '#D97706' }}>Pago pend.</p>
                        )}
                      </div>

                      {/* Despacho */}
                      <div className="text-xs text-gray-600">
                        <p>{order.tipo_despacho === 'delivery' ? 'Delivery' : 'Retiro'}</p>
                        <p className="text-gray-400">{PAGO_LABEL[order.metodo_pago] ?? order.metodo_pago}</p>
                      </div>

                      {/* Total */}
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900 tabular-nums">{fmt(order.total)}</p>
                        <p className="text-xs text-gray-400">{order.items_count} item{order.items_count !== 1 ? 's' : ''}</p>
                      </div>

                      {/* Hora */}
                      <div className="text-xs text-gray-500">
                        <p className="font-medium">{formatTime(order.created_at)}</p>
                        <p className="text-gray-400">{formatDate(order.created_at)}</p>
                      </div>

                      {/* Accion */}
                      <div className="flex gap-1.5 items-center" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openWhatsApp(order.telefono)}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium"
                          style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}>WA</button>
                        {primaryNext && (
                          <button onClick={() => handleStatusChange(order.id, primaryNext)}
                            disabled={updatingId === order.id}
                            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: PRIMARY }}>
                            {updatingId === order.id ? '...' : STATE_FLOW.find(s => s.key === primaryNext)?.emoji ?? '>'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {selectedOrder && (
        <OrderDetailPanel slug={slug} order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={handleStatusChange} updatingId={updatingId} />
      )}
    </div>
  )
}
