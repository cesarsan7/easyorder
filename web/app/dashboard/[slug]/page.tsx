'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'

// Design tokens -- Riday-inspired orange accent
const ACCENT = '#6366F1'

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_MS = 30_000

const ESTADO_META: Record<string, { label: string; color: string; bg: string }> = {
  recibido:       { label: 'Por confirmar',  color: '#92400E', bg: '#FEF3C7' },
  en_curso:       { label: 'En curso',       color: '#6B7280', bg: '#F3F4F6' },
  pendiente_pago: { label: 'Pend. pago',     color: '#B45309', bg: '#FEF9C3' },
  confirmado:     { label: 'Confirmado',     color: '#1D4ED8', bg: '#DBEAFE' },
  pagado:         { label: 'Pagado',         color: '#065F46', bg: '#D1FAE5' },
  en_preparacion: { label: 'Preparando',     color: '#5B21B6', bg: '#EDE9FE' },
  listo:          { label: 'Listo',          color: '#065F46', bg: '#D1FAE5' },
  en_camino:      { label: 'En camino',      color: '#0369A1', bg: '#E0F2FE' },
  entregado:      { label: 'Entregado',      color: '#374151', bg: '#F3F4F6' },
  cancelado:      { label: 'Cancelado',      color: '#B91C1C', bg: '#FEE2E2' },
  expirado:       { label: 'Expirado',       color: '#9CA3AF', bg: '#F9FAFB' },
}

const TRANSITIONS: Record<string, string[]> = {
  recibido:       ['confirmado','en_preparacion','listo','en_camino','entregado','cancelado','expirado'],
  en_curso:       ['confirmado','en_preparacion','listo','en_camino','entregado','cancelado','expirado'],
  pendiente_pago: ['confirmado','en_preparacion','listo','en_camino','entregado','cancelado'],
  confirmado:     ['en_preparacion','listo','en_camino','entregado','cancelado'],
  pagado:         ['en_preparacion','listo','en_camino','entregado','cancelado'],
  en_preparacion: ['listo','en_camino','entregado','cancelado'],
  listo:          ['en_camino','entregado','cancelado'],
  en_camino:      ['entregado','cancelado'],
  entregado:[], cancelado:[], expirado:[],
}

const STATE_FLOW = [
  { key:'recibido',       emoji:'⏳', label:'Por confirmar'  },
  { key:'confirmado',     emoji:'✓', label:'Confirmado'     },
  { key:'en_preparacion', emoji:'🍳', label:'En preparación' },
  { key:'listo',          emoji:'🔔', label:'Listo'          },
  { key:'en_camino',      emoji:'🛵', label:'En despacho'    },
  { key:'entregado',      emoji:'📦', label:'Entregado'      },
]

// All statuses shown in filter tabs (with emojis)
const FILTER_TABS = [
  { key:'',               emoji:'📋', label:'Activos'        },
  { key:'recibido',       emoji:'⏳',        label:'Por confirmar'  },
  { key:'confirmado',     emoji:'✓',        label:'Confirmado'     },
  { key:'en_preparacion', emoji:'🍳',  label:'En preparación' },
  { key:'listo',          emoji:'🔔',  label:'Listo'          },
  { key:'en_camino',      emoji:'🛵',  label:'En despacho'    },
  { key:'entregado',      emoji:'📦',  label:'Entregado'      },
  { key:'expirado',       emoji:'💤',  label:'Expirados'      },
  { key:'cancelado',      emoji:'✕',        label:'Cancelados'     },
]

const PAGO_LABEL: Record<string,string> = {
  efectivo:'Efectivo', transferencia:'Transfer.', tarjeta:'Tarjeta', bizum:'Bizum', online:'Online',
}

type SortField = 'pedido_codigo' | 'created_at' | 'nombre_cliente' | 'estado' | 'total'
type SortDir   = 'asc' | 'desc'
type DatePreset = 'hoy'|'ayer'|'7dias'|'mes'|'rango'|null

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n:number) { return `€${n.toFixed(2).replace('.',',')}` }

function timeAgo(iso:string) {
  const s = Math.floor((Date.now()-new Date(iso).getTime())/1000)
  if (s<60) return `${s}s`; if (s<3600) return `${Math.floor(s/60)}m`
  return `${Math.floor(s/3600)}h`
}

function formatTime(iso:string) {
  return new Date(iso).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:'Atlantic/Canary'})
}

// Merged datetime: YYYY-MM-DD HH:MM (Swedish locale = ISO date naturally)
function formatDateTime(iso:string) {
  const d = new Date(iso)
  const tz = 'Atlantic/Canary'
  const date = d.toLocaleDateString('sv-SE',{timeZone:tz})
  const time = d.toLocaleTimeString('sv-SE',{timeZone:tz,hour:'2-digit',minute:'2-digit'})
  return `${date} ${time}`
}

function localDateStr(d:Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getDateRange(preset:DatePreset, from:string, to:string) {
  const t = new Date()
  if (preset==='hoy')  { const d=localDateStr(t); return {fecha_desde:d,fecha_hasta:d} }
  if (preset==='ayer') { const y=new Date(t); y.setDate(y.getDate()-1); const d=localDateStr(y); return {fecha_desde:d,fecha_hasta:d} }
  if (preset==='7dias'){ const w=new Date(t); w.setDate(w.getDate()-6); return {fecha_desde:localDateStr(w),fecha_hasta:localDateStr(t)} }
  if (preset==='mes')  { const f=new Date(t.getFullYear(),t.getMonth(),1); return {fecha_desde:localDateStr(f),fecha_hasta:localDateStr(t)} }
  if (preset==='rango'&&from&&to) return {fecha_desde:from,fecha_hasta:to}
  return {} as Record<string,string>
}

function openWhatsApp(tel:string) { window.open(`https://wa.me/${tel.replace(/\D/g,'')}`, '_blank') }

function extractZona(order: Order): string {
  if (order.tipo_despacho !== 'delivery') return '—'
  if (!order.direccion) return 'Delivery'
  const d = order.direccion.trim()
  return d.length > 26 ? d.slice(0, 24) + '…' : d
}

function previewItems(order: Order): string {
  if (Array.isArray(order.items) && order.items.length > 0) {
    const raw = order.items as Array<Record<string, unknown>>
    const names = raw.slice(0, 2).map(i => String(i.item_name ?? i.nombre ?? '?'))
    const more = order.items_count - 2
    return names.join(', ') + (more > 0 ? ` +${more}` : '')
  }
  return `${order.items_count} ítem${order.items_count !== 1 ? 's' : ''}`
}

function normalizeItem(raw:unknown):OrderItem {
  const r = raw as Record<string,unknown>
  if (typeof r.item_name==='string') return {
    menu_item_id:Number(r.menu_item_id??0), item_name:r.item_name,
    variant_name:(r.variant_name as string|null)??null,
    quantity:Number(r.quantity??1), unit_price:Number(r.unit_price??0),
    notas: typeof r.notas==='string'&&r.notas.trim()?r.notas.trim():null,
    extras: Array.isArray(r.extras)?(r.extras as OrderItem['extras']):undefined,
  }
  return {
    menu_item_id:0, item_name:String(r.nombre??r.name??'Producto'), variant_name:null,
    quantity:Number(r.cantidad??r.quantity??1), unit_price:Number(r.precio_unitario??r.unit_price??0),
    notas: typeof r.notas==='string'&&r.notas.trim()?r.notas.trim():null,
    extras: Array.isArray(r.extras)?(r.extras as OrderItem['extras']):undefined,
  }
}

function sortOrders(orders: Order[], field: SortField, dir: SortDir): Order[] {
  return [...orders].sort((a, b) => {
    let va: string|number = a[field] ?? ''
    let vb: string|number = b[field] ?? ''
    if (field === 'total') { va = a.total; vb = b.total }
    if (field === 'created_at') { va = a.created_at; vb = b.created_at }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return dir === 'asc' ? cmp : -cmp
  })
}

// ── Print comanda ─────────────────────────────────────────────────────────────

function printComanda(order:Order, detail:OrderDetail|null) {
  const items = detail?.items??[]
  const html = `<html><head><title>Comanda #${order.pedido_codigo}</title>
  <style>body{font-family:monospace;font-size:13px;max-width:280px;margin:0 auto;padding:8px}
  h2{text-align:center;font-size:15px;border-bottom:1px dashed #000;padding-bottom:6px}
  .row{display:flex;justify-content:space-between;margin:4px 0}.sep{border-top:1px dashed #000;margin:6px 0}.bold{font-weight:bold}</style></head><body>
  <h2>COMANDA</h2>
  <div class="row"><span>${order.pedido_codigo}</span><span>${formatTime(order.created_at)}</span></div>
  <div class="row bold"><span>${order.nombre_cliente}</span><span>${order.telefono}</span></div>
  <div class="sep"></div>
  ${items.map(i=>`<div class="row"><span>${i.quantity}x ${i.item_name}</span><span>€${(i.unit_price*i.quantity).toFixed(2)}</span></div>`).join('')}
  <div class="sep"></div>
  <div class="row bold"><span>TOTAL</span><span>€${order.total.toFixed(2)}</span></div>
  </body></html>`
  const win=window.open('','_blank','width=350,height=600')
  if (!win) return; win.document.write(html); win.document.close(); win.focus()
  setTimeout(()=>{win.print();win.close()},300)
}

// ── SortTh ────────────────────────────────────────────────────────────────────

function SortTh({ label, field, sortField, sortDir, onSort }: {
  label:string; field:SortField; sortField:SortField; sortDir:SortDir
  onSort:(f:SortField)=>void
}) {
  const active = sortField===field
  return (
    <th
      className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
      style={{ color: active?ACCENT:'#6B7280' }}
      onClick={()=>onSort(field)}
    >
      {label}{' '}
      <span style={{ opacity: active?1:0.3 }}>
        {active ? (sortDir==='asc'?'↑':'↓') : '↕'}
      </span>
    </th>
  )
}

// ── OrderDetailPanel ──────────────────────────────────────────────────────────

function OrderDetailPanel({ slug, order, onClose, onStatusChange, updatingId }:{
  slug:string; order:Order; onClose:()=>void
  onStatusChange:(id:number,estado:string)=>void; updatingId:number|null
}) {
  const authFetch = useAuthFetch()
  const [detail,         setDetail]         = useState<OrderDetail|null>(null)
  const [loadingDetail,  setLoadingDetail]  = useState(true)
  const [estadoPago,     setEstadoPago]     = useState(order.estado_pago??'pendiente')
  const [confirmingPago, setConfirmingPago] = useState(false)

  async function handleConfirmPago(v:'pagado'|'rechazado') {
    setConfirmingPago(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/orders/${order.id}/payment`,{
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({estado_pago:v}),
      })
      if (res.ok) setEstadoPago(v)
    } catch{} finally { setConfirmingPago(false) }
  }

  useEffect(()=>{
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/orders/${order.pedido_codigo}`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(d) setDetail({...d, items:Array.isArray(d.items)?d.items.map(normalizeItem):[]}) })
      .catch(()=>{}).finally(()=>setLoadingDetail(false))
  },[slug,order.pedido_codigo])

  const meta        = ESTADO_META[order.estado]??{label:order.estado,color:'#6B7280',bg:'#F3F4F6'}
  const transitions = TRANSITIONS[order.estado]??[]
  const canCancel   = transitions.includes('cancelado')
  const updating    = updatingId===order.id
  const isDelivery  = order.tipo_despacho==='delivery'
  const flowKeys    = STATE_FLOW.map(s=>s.key)
  const currentIdx  = flowKeys.indexOf(order.estado)

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
              style={{color:meta.color,backgroundColor:meta.bg}}>{meta.label}</span>
            <button onClick={onClose}
              className="h-8 w-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 text-lg">
              ×
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {loadingDetail ? (
            <div className="flex justify-center py-6">
              <div className="h-6 w-6 rounded-full border-4 border-gray-200 border-t-orange-400 animate-spin" />
            </div>
          ) : detail ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Ítems</p>
              <div className="space-y-3">
                {detail.items.map((item,idx)=>(
                  <div key={idx} className="flex justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {item.quantity}× {item.item_name}
                        {item.variant_name&&<span className="text-gray-400 font-normal"> · {item.variant_name}</span>}
                      </p>
                      {item.extras&&item.extras.length>0&&(
                        <p className="text-xs text-gray-400 mt-0.5">+ {item.extras.map(e=>e.name).join(', ')}</p>
                      )}
                      {item.notas&&(
                        <p className="text-xs text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-0.5 inline-block">{item.notas}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(item.unit_price*item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 mt-4 pt-3 space-y-1">
                <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{fmt(detail.subtotal)}</span></div>
                <div className="flex justify-between text-sm text-gray-500"><span>Envío</span><span>{detail.costo_envio>0?fmt(detail.costo_envio):'Sin costo'}</span></div>
                <div className="flex justify-between text-base font-bold text-gray-900">
                  <span>Total</span><span style={{color:ACCENT}}>{fmt(detail.total)}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No se pudieron cargar los ítems.</p>
          )}

          <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Despacho</span>
              <span className="font-medium text-gray-900">{isDelivery?'Delivery':'Retiro en local'}</span>
            </div>
            {order.direccion&&<div className="flex justify-between"><span className="text-gray-500">Dirección</span><span className="font-medium text-gray-900 text-right max-w-[60%]">{order.direccion}</span></div>}
            <div className="flex justify-between"><span className="text-gray-500">Pago</span><span className="font-medium text-gray-900">{PAGO_LABEL[order.metodo_pago]??order.metodo_pago}</span></div>
            {order.tiempo_estimado&&<div className="flex justify-between"><span className="text-gray-500">Tiempo est.</span><span className="font-medium text-gray-900">{order.tiempo_estimado} min</span></div>}
          </div>

          {Array.isArray(order.notas)&&order.notas.length>0&&(
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
              <p className="text-xs font-semibold text-amber-800 mb-1">Notas</p>
              {order.notas.map((n,i)=>(
                <p key={i} className="text-sm text-amber-700">
                  {n.item!=='general'&&<span className="font-medium">{n.item}: </span>}{n.nota}
                </p>
              ))}
            </div>
          )}

          <div className="rounded-xl border px-4 py-3 flex items-center justify-between"
            style={estadoPago==='pagado'?{backgroundColor:'#D1FAE5',borderColor:'#6EE7B7'}:estadoPago==='rechazado'?{backgroundColor:'#FEE2E2',borderColor:'#FCA5A5'}:{backgroundColor:'#FEF3C7',borderColor:'#FCD34D'}}>
            <p className="text-xs font-semibold" style={{color:estadoPago==='pagado'?'#065F46':estadoPago==='rechazado'?'#991B1B':'#92400E'}}>
              {estadoPago==='pagado'?'✓ Pago confirmado':estadoPago==='rechazado'?'✕ Pago rechazado':'⚠ Pago pendiente'}
            </p>
            {estadoPago==='pendiente'&&(
              <div className="flex gap-2">
                <button onClick={()=>handleConfirmPago('pagado')} disabled={confirmingPago}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  style={{backgroundColor:'#059669'}}>{confirmingPago?'…':'✓ Pagado'}</button>
                <button onClick={()=>handleConfirmPago('rechazado')} disabled={confirmingPago}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  style={{backgroundColor:'#DC2626'}}>✕</button>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pt-4 pb-2 border-t border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Cambiar estado</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {STATE_FLOW.filter(s=>s.key!=='en_camino'||isDelivery).map(s=>{
              const stepIdx   = flowKeys.indexOf(s.key)
              const isCurrent = s.key===order.estado
              const isPast    = stepIdx>=0&&currentIdx>=0&&stepIdx<currentIdx
              const isNext    = transitions.includes(s.key)
              return (
                <button key={s.key} disabled={!isNext||isCurrent||updating}
                  onClick={()=>{ if(isNext&&!isCurrent){onStatusChange(order.id,s.key);onClose()} }}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all border border-transparent disabled:cursor-default"
                  style={{
                    backgroundColor:isCurrent?ACCENT:'#F3F4F6',
                    color:isCurrent?'#fff':isPast?'#9CA3AF':'#374151',
                    opacity:isPast?0.5:1,
                    borderColor:isNext&&!isCurrent?'#E5E7EB':'transparent',
                  }}>
                  <span>{s.emoji}</span><span>{s.label}</span>
                </button>
              )
            })}
          </div>
          {canCancel&&(
            <button onClick={()=>{onStatusChange(order.id,'cancelado');onClose()}} disabled={updating}
              className="w-full rounded-xl py-2.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 disabled:opacity-50">
              Cancelar pedido
            </button>
          )}
          {order.estado==='recibido'&&(
            <button onClick={()=>{onStatusChange(order.id,'expirado');onClose()}} disabled={updating}
              className="w-full mt-2 rounded-xl py-2.5 text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 disabled:opacity-50">
              Expirar pedido
            </button>
          )}
        </div>

        <div className="flex gap-2 px-5 pb-8 pt-3">
          <button onClick={()=>printComanda(order,detail)}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">
            🖶 Imprimir
          </button>
          <button onClick={()=>openWhatsApp(order.telefono)}
            className="rounded-xl px-4 py-2.5 text-sm font-medium"
            style={{backgroundColor:'#D1FAE5',color:'#065F46'}}>
            💬 WhatsApp
          </button>
        </div>
      </div>
    </>
  )
}

// ── StatusToggle ──────────────────────────────────────────────────────────────

function StatusToggle({slug,authFetch}:{slug:string;authFetch:ReturnType<typeof useAuthFetch>}) {
  const [isOpen,   setIsOpen]  = useState<boolean|null>(null)
  const [toggling, setToggling]= useState(false)
  useEffect(()=>{
    authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/restaurant/status`)
      .then(r=>r.json()).then((d:{is_open:boolean})=>setIsOpen(d.is_open)).catch(()=>{})
  },[slug,authFetch])
  async function toggle() {
    if (isOpen===null||toggling) return; setToggling(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/restaurant/status`,{
        method:'PATCH', body:JSON.stringify({is_open_override:!isOpen}),
      })
      if (res.ok){const d:{is_open_effective:boolean}=await res.json();setIsOpen(d.is_open_effective)}
    } finally{setToggling(false)}
  }
  if (isOpen===null) return null
  return (
    <button onClick={toggle} disabled={toggling}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 transition-colors"
      style={{backgroundColor:isOpen?'#D1FAE5':'#FEE2E2',color:isOpen?'#065F46':'#991B1B'}}>
      <span className="h-2 w-2 rounded-full" style={{backgroundColor:isOpen?'#10B981':'#EF4444'}} />
      {toggling?'…':isOpen?'Abierto':'Cerrado'}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const {slug}    = useParams<{slug:string}>()
  const router    = useRouter()
  const authFetch = useAuthFetch()

  useEffect(()=>{ localStorage.setItem('easyorder-last-slug', slug) },[slug])

  async function handleLogout() {
    const supabase = createClient(); await supabase.auth.signOut(); router.replace('/login')
  }

  const [orders,         setOrders]         = useState<Order[]>([])
  const [total,          setTotal]          = useState(0)
  const [newCount,       setNewCount]       = useState(0)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState<string|null>(null)
  const [filter,         setFilter]         = useState('')
  const [filterPago,     setFilterPago]     = useState('')
  const [filterDespacho, setFilterDespacho] = useState('')
  const [datePreset,     setDatePreset]     = useState<DatePreset>(null)
  const [dateFrom,       setDateFrom]       = useState('')
  const [dateTo,         setDateTo]         = useState('')
  const [sortField,      setSortField]      = useState<SortField>('created_at')
  const [sortDir,        setSortDir]        = useState<SortDir>('desc')
  const [updatingId,     setUpdatingId]     = useState<number|null>(null)
  const [lastUpdated,    setLastUpdated]    = useState<Date|null>(null)
  const [selectedOrder,  setSelectedOrder]  = useState<Order|null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>|null>(null)

  const DATE_PRESETS: {key:DatePreset;label:string}[] = [
    {key:'hoy',label:'Hoy'},{key:'ayer',label:'Ayer'},
    {key:'7dias',label:'7 días'},{key:'mes',label:'Este mes'},{key:'rango',label:'Rango'},
  ]

  const fetchOrders = useCallback(async (silent=false)=>{
    if (!silent) setLoading(true); setError(null)
    try {
      const p = new URLSearchParams()
      if (filter) p.set('estado',filter)
      const range = getDateRange(datePreset,dateFrom,dateTo)
      if (range.fecha_desde) p.set('fecha_desde',range.fecha_desde)
      if (range.fecha_hasta) p.set('fecha_hasta',range.fecha_hasta)
      const qs = p.toString()
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/orders${qs?'?'+qs:''}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data:{orders:Order[];total:number} = await res.json()
      setOrders(data.orders); setTotal(data.total)
      if (!filter&&!datePreset) setNewCount(data.orders.filter(o=>o.estado==='recibido').length)
      setLastUpdated(new Date())
    } catch { setError('No se pudieron cargar los pedidos.') }
    finally { if (!silent) setLoading(false) }
  },[slug,filter,datePreset,dateFrom,dateTo,authFetch])

  useEffect(()=>{fetchOrders()},[fetchOrders])
  useEffect(()=>{
    timerRef.current=setTimeout(function poll(){
      fetchOrders(true); timerRef.current=setTimeout(poll,POLL_MS)
    },POLL_MS)
    return ()=>{ if (timerRef.current) clearTimeout(timerRef.current) }
  },[fetchOrders])

  async function handleStatusChange(id:number, estado:string) {
    setUpdatingId(id)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/orders/${id}/status`,{
        method:'PATCH', body:JSON.stringify({estado}),
      })
      if (!res.ok) throw new Error()
      const updated:{id:number;estado:string;updated_at:string} = await res.json()
      setOrders(prev=>prev
        .map(o=>o.id===updated.id?{...o,estado:updated.estado,updated_at:updated.updated_at}:o)
        .filter(o=>{ if(filter!=='') return true; return !['entregado','cancelado','expirado'].includes(o.estado) }))
      setNewCount(prev=>{
        if (estado!=='recibido'&&updated.estado!=='recibido') {
          const was = orders.find(o=>o.id===id)?.estado==='recibido'
          return was?Math.max(0,prev-1):prev
        }
        return prev
      })
      setSelectedOrder(prev=>prev?.id===updated.id?{...prev,estado:updated.estado,updated_at:updated.updated_at}:prev)
    } catch {} finally { setUpdatingId(null) }
  }

  function toggleSort(field:SortField) {
    if (sortField===field) setSortDir(d=>d==='asc'?'desc':'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  // Client-side secondary filters applied on top of server results
  const filteredOrders = orders
    .filter(o => !filterPago     || o.estado_pago    === filterPago)
    .filter(o => !filterDespacho || o.tipo_despacho  === filterDespacho)

  const displayOrders   = sortOrders(filteredOrders, sortField, sortDir)
  const activeTab       = FILTER_TABS.find(t=>t.key===filter)??FILTER_TABS[0]
  const hasExtraFilters = !!(filterPago || filterDespacho)

  return (
    <div className="flex-1 flex flex-col min-w-0">

      {/* ── Top bar ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">

        {/* Title row */}
        <div className="px-6 py-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-bold text-gray-900">Pedidos</h1>
            <p className="text-xs text-gray-400">
              {lastUpdated ? `Actualizado hace ${timeAgo(lastUpdated.toISOString())}` : 'Cargando…'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusToggle slug={slug} authFetch={authFetch} />
            <button onClick={()=>fetchOrders()}
              className="rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 transition-colors text-gray-600">
              ↻ Actualizar
            </button>
            <button onClick={handleLogout}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors">
              Salir
            </button>
          </div>
        </div>

        {/* Stat chips */}
        {!loading&&(
          <div className="px-6 pb-2 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
              {total} pedido{total!==1?'s':''}
            </span>
            {newCount>0&&(
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{backgroundColor:'#FFF7ED',color:ACCENT}}>
                <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{backgroundColor:ACCENT}} />
                {newCount} por confirmar
              </span>
            )}
            {filteredOrders.length !== orders.length && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-600">
                {filteredOrders.length} mostrados
              </span>
            )}
          </div>
        )}

        {/* Status tabs -- all statuses with emojis */}
        <div className="px-6 flex gap-0 overflow-x-auto" style={{borderTop:'1px solid #F3F4F6',scrollbarWidth:'none'}}>
          {FILTER_TABS.map(tab=>(
            <button key={tab.key} onClick={()=>setFilter(tab.key)}
              className="shrink-0 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1"
              style={filter===tab.key
                ?{borderColor:ACCENT,color:ACCENT}
                :{borderColor:'transparent',color:'#9CA3AF'}}>
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
              {tab.key==='recibido'&&newCount>0&&(
                <span className="rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center text-white font-bold"
                  style={{fontSize:9,backgroundColor:ACCENT}}>{newCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Filter bar: date presets + pago + despacho */}
        <div className="px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5" style={{borderTop:'1px solid #F9FAFB'}}>

          {/* Date presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {DATE_PRESETS.map(p=>(
              <button key={p.key as string}
                onClick={()=>setDatePreset(datePreset===p.key?null:p.key)}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap"
                style={datePreset===p.key
                  ?{backgroundColor:ACCENT,color:'#fff'}
                  :{backgroundColor:'#F3F4F6',color:'#6B7280'}}>
                {p.label}
              </button>
            ))}
            {datePreset==='rango'&&(
              <div className="flex items-center gap-1">
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                  className="rounded-lg border border-gray-200 text-xs px-2 py-0.5 focus:outline-none" />
                <span className="text-gray-300 text-xs">-</span>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                  className="rounded-lg border border-gray-200 text-xs px-2 py-0.5 focus:outline-none" />
              </div>
            )}
            {datePreset&&(
              <button onClick={()=>{setDatePreset(null);setDateFrom('');setDateTo('')}}
                className="text-xs text-gray-400 hover:text-gray-600">× fecha</button>
            )}
          </div>

          <span className="h-4 w-px bg-gray-200" />

          {/* Estado pago */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Pago:</span>
            <select value={filterPago} onChange={e=>setFilterPago(e.target.value)}
              className="rounded-lg border text-xs px-2 py-0.5 bg-white text-gray-700 focus:outline-none cursor-pointer"
              style={{borderColor:filterPago?ACCENT:'#E5E7EB',color:filterPago?ACCENT:'#374151'}}>
              <option value="">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="pagado">Pagado</option>
              <option value="rechazado">Rechazado</option>
            </select>
          </div>

          {/* Tipo despacho */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Despacho:</span>
            <select value={filterDespacho} onChange={e=>setFilterDespacho(e.target.value)}
              className="rounded-lg border text-xs px-2 py-0.5 bg-white text-gray-700 focus:outline-none cursor-pointer"
              style={{borderColor:filterDespacho?ACCENT:'#E5E7EB',color:filterDespacho?ACCENT:'#374151'}}>
              <option value="">Todos</option>
              <option value="delivery">Delivery</option>
              <option value="retiro">Retiro</option>
            </select>
          </div>

          {hasExtraFilters&&(
            <button onClick={()=>{setFilterPago('');setFilterDespacho('')}}
              className="text-xs text-gray-400 hover:text-orange-500 transition-colors">× limpiar</button>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 p-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-orange-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-5 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={()=>fetchOrders()} className="mt-3 text-xs text-red-600 underline">Reintentar</button>
          </div>
        ) : displayOrders.length===0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{backgroundColor:'#FFF7ED'}}>🎉</div>
            <p className="text-sm font-medium text-gray-500">
              {filter||hasExtraFilters
                ? `Sin pedidos con los filtros aplicados`
                : 'No hay pedidos activos'}
            </p>
            {hasExtraFilters&&(
              <button onClick={()=>{setFilterPago('');setFilterDespacho('')}}
                className="text-xs text-orange-500 underline">Limpiar filtros</button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse">
                <thead>
                  <tr style={{backgroundColor:'#F9FAFB',borderBottom:'2px solid #E5E7EB'}}>
                    <SortTh label="Pedido"     field="pedido_codigo"  sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Fecha/Hora" field="created_at"     sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Cliente"    field="nombre_cliente" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Estado"     field="estado"         sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Despacho</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Zona / Dir.</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Productos</th>
                    <SortTh label="Total"      field="total"          sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {displayOrders.map((order,idx)=>{
                    const meta        = ESTADO_META[order.estado]??{label:order.estado,color:'#6B7280',bg:'#F3F4F6'}
                    const transitions = TRANSITIONS[order.estado]??[]
                    const primaryNext = transitions.filter(t=>t!=='cancelado')[0]
                    const isNew       = order.estado==='recibido'
                    const isEven      = idx%2===0
                    return (
                      <tr key={order.id}
                        className="transition-colors cursor-pointer"
                        style={{
                          backgroundColor:isNew?'#FFFBEB':isEven?'#FFFFFF':'#FAFAFA',
                          borderBottom:'1px solid #F3F4F6',
                          borderLeft:isNew?`3px solid ${ACCENT}`:'3px solid transparent',
                        }}
                        onClick={()=>setSelectedOrder(order)}
                        onMouseEnter={e=>(e.currentTarget as HTMLTableRowElement).style.backgroundColor='#FFF7ED'}
                        onMouseLeave={e=>(e.currentTarget as HTMLTableRowElement).style.backgroundColor=isNew?'#FFFBEB':isEven?'#FFFFFF':'#FAFAFA'}
                      >
                        {/* Pedido # */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold text-gray-700">#{order.pedido_codigo}</span>
                            {isNew&&(
                              <span className="rounded-full px-1.5 py-0.5 text-white font-bold leading-none"
                                style={{backgroundColor:ACCENT,fontSize:9}}>NEW</span>
                            )}
                          </div>
                        </td>

                        {/* Fecha/Hora -- merged, sortable */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="font-mono text-xs text-gray-700">{formatDateTime(order.created_at)}</span>
                        </td>

                        {/* Cliente */}
                        <td className="px-3 py-3" style={{maxWidth:150}}>
                          <p className="text-sm font-medium text-gray-900 truncate">{order.nombre_cliente}</p>
                          <p className="text-xs text-gray-400 truncate">{order.telefono}</p>
                        </td>

                        {/* Estado */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
                            style={{color:meta.color,backgroundColor:meta.bg}}>
                            {meta.label}
                          </span>
                          {order.estado_pago==='pendiente'&&(
                            <p className="text-xs mt-0.5 font-medium text-amber-600">⚠ pago</p>
                          )}
                        </td>

                        {/* Despacho + metodo pago */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <p className="text-xs font-medium text-gray-700">
                            {order.tipo_despacho==='delivery'?'🛵 Delivery':'🏪 Retiro'}
                          </p>
                          <p className="text-xs text-gray-400">{PAGO_LABEL[order.metodo_pago]??order.metodo_pago}</p>
                        </td>

                        {/* Zona / Direccion */}
                        <td className="px-3 py-3" style={{maxWidth:140}}>
                          <span className="text-xs text-gray-600 truncate block">{extractZona(order)}</span>
                        </td>

                        {/* Productos preview */}
                        <td className="px-3 py-3" style={{maxWidth:180}}>
                          <span className="text-xs text-gray-600 truncate block">{previewItems(order)}</span>
                        </td>

                        {/* Total */}
                        <td className="px-3 py-3 whitespace-nowrap text-right">
                          <p className="text-sm font-bold text-gray-900 tabular-nums">{fmt(order.total)}</p>
                        </td>

                        {/* Acciones */}
                        <td className="px-3 py-3 whitespace-nowrap" onClick={e=>e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button onClick={()=>openWhatsApp(order.telefono)}
                              className="rounded-lg px-2 py-1 text-xs font-medium"
                              style={{backgroundColor:'#D1FAE5',color:'#065F46'}}>
                              WA
                            </button>
                            {primaryNext&&(
                              <button onClick={()=>handleStatusChange(order.id,primaryNext)}
                                disabled={updatingId===order.id}
                                className="rounded-lg px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                style={{backgroundColor:ACCENT}}>
                                {updatingId===order.id?'…':STATE_FLOW.find(s=>s.key===primaryNext)?.emoji??'>'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {selectedOrder&&(
        <OrderDetailPanel slug={slug} order={selectedOrder}
          onClose={()=>setSelectedOrder(null)}
          onStatusChange={handleStatusChange} updatingId={updatingId} />
      )}
    </div>
  )
}
