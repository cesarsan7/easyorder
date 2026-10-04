'use client'

import { useEffect, useState, useCallback, useRef, createContext, useContext } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'
import { useBranding } from '@/lib/context/branding'
import ManualOrderModal from '@/components/ManualOrderModal'

const AccentCtx      = createContext('#6366F1')
const AccentLightCtx = createContext('#EEF2FF')
const AccentTextCtx  = createContext('#4338CA')
const useAccent      = () => useContext(AccentCtx)
const useAccentLight = () => useContext(AccentLightCtx)
const useAccentText  = () => useContext(AccentTextCtx)

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItemExtra {
  extra_id: number
  name:     string
  price:    number
}

interface OrderItem {
  menu_item_id:    number
  menu_variant_id: number
  item_name:       string
  variant_name:    string
  quantity:        number
  unit_price:      number
  extras:          OrderItemExtra[]
}

interface Cliente {
  usuario_id:          number
  telefono:            string
  nombre:              string | null
  direccion_frecuente: string | null
  total_pedidos:       number
  total_gastado:       number
  ultimo_pedido:       string | null
  cliente_desde:       string | null
}

interface PedidoCliente {
  id:            number
  pedido_codigo: string | null
  estado:        string
  estado_pago:   string
  tipo_despacho: string | null
  metodo_pago:   string | null
  subtotal:      number
  costo_envio:   number
  total:         number
  items_count:   number
  direccion:     string | null
  created_at:    string
  items:         OrderItem[]
  notas:         { item: string; nota: string }[] | null
}

interface ClienteDetalle {
  cliente: Cliente
  pedidos: PedidoCliente[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number, sym: string) {
  return sym + n.toFixed(2).replace('.', ',')
}

function timeAgo(iso: string, tz: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (mins < 1)   return 'ahora'
  if (mins < 60)  return `hace ${mins}m`
  if (hours < 24) return `hace ${hours}h`
  if (days < 30)  return `hace ${days}d`
  return new Date(iso).toLocaleDateString('es-ES', { timeZone: tz, day: '2-digit', month: 'short' })
}

function fmtDate(iso: string, tz: string) {
  return new Date(iso).toLocaleDateString('es-ES', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' })
}

const ESTADO_META: Record<string, { label: string; color: string; bg: string }> = {
  recibido:       { label: 'Por confirmar',  color: '#92400E', bg: '#FEF3C7' },
  en_curso:       { label: 'En curso',       color: '#6B7280', bg: '#F3F4F6' },
  confirmado:     { label: 'Confirmado',     color: '#2563EB', bg: '#DBEAFE' },
  en_preparacion: { label: 'En preparación', color: '#7C3AED', bg: '#EDE9FE' },
  listo:          { label: 'Listo',          color: '#059669', bg: '#D1FAE5' },
  en_camino:      { label: 'En camino',      color: '#0284C7', bg: '#E0F2FE' },
  entregado:      { label: 'Entregado',      color: '#6B7280', bg: '#F3F4F6' },
  cancelado:      { label: 'Cancelado',      color: '#DC2626', bg: '#FEE2E2' },
}

function EstadoBadge({ estado }: { estado: string }) {
  const meta = ESTADO_META[estado] ?? { label: estado, color: '#6B7280', bg: '#F3F4F6' }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color: meta.color, backgroundColor: meta.bg }}>
      {meta.label}
    </span>
  )
}

// ─── PhoneDisplay ─────────────────────────────────────────────────────────────

function PhoneDisplay({
  telefono, linkHref,
}: {
  telefono: string
  linkHref?: string
}) {
  const accent = useAccent()
  const [visible, setVisible] = useState(false)
  const digits  = telefono.replace(/\D/g, '')
  const masked  = `••••${digits.slice(-4)}`
  const display = visible ? telefono : masked

  return (
    <span className="inline-flex items-center gap-1">
      {visible && linkHref ? (
        <a href={linkHref} target="chatwoot_panel" rel="noopener noreferrer"
          className="text-xs underline underline-offset-2" style={{ color: accent }}>
          {display}
        </a>
      ) : (
        <span className="text-xs text-gray-500 font-mono">{display}</span>
      )}
      <button
        onClick={() => setVisible(v => !v)}
        className="text-[10px] underline text-gray-400 hover:text-gray-600 shrink-0"
      >
        {visible ? 'ocultar' : 'mostrar'}
      </button>
    </span>
  )
}

// ─── OrderCard (expandable) ───────────────────────────────────────────────────

function OrderCard({
  pedido, tz, moneda, onReorder,
}: {
  pedido:    PedidoCliente
  tz:        string
  moneda:    string
  onReorder: (items: OrderItem[]) => void
}) {
  const accent      = useAccent()
  const accentLight = useAccentLight()
  const accentText  = useAccentText()
  const [open, setOpen] = useState(false)
  const sym = moneda === 'EUR' ? '€' : moneda

  const hasItems = pedido.items && pedido.items.length > 0
  const notas = Array.isArray(pedido.notas) ? pedido.notas.filter(n => n.nota?.trim()) : []

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      {/* Row header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-xs font-mono font-semibold text-gray-700">{pedido.pedido_codigo ?? `#${pedido.id}`}</span>
          <div className="flex items-center gap-1.5">
            <EstadoBadge estado={pedido.estado} />
            <span className="text-gray-300 text-xs">{open ? '▲' : '▼'}</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {pedido.tipo_despacho ?? '—'} · {pedido.items_count} ítem{pedido.items_count !== 1 ? 's' : ''}
            {pedido.metodo_pago ? ` · ${pedido.metodo_pago}` : ''}
          </span>
          <span className="font-semibold text-gray-800">{sym}{pedido.total.toFixed(2)}</span>
        </div>
        <p className="text-[10px] text-gray-300 mt-1">{fmtDate(pedido.created_at, tz)}</p>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
          {/* Items */}
          {hasItems ? (
            <div className="space-y-1.5">
              {pedido.items.map((item, idx) => (
                <div key={idx} className="flex justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800">
                      {item.quantity}× {item.item_name}
                      {item.variant_name && item.variant_name !== item.item_name
                        ? <span className="text-gray-400"> ({item.variant_name})</span>
                        : null}
                    </p>
                    {item.extras && item.extras.length > 0 && (
                      <p className="text-[10px] text-gray-400 ml-2">
                        + {item.extras.map(e => e.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-600 shrink-0">
                    {sym}{((item.unit_price + (item.extras?.reduce((s, e) => s + e.price, 0) ?? 0)) * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">Sin detalle de ítems</p>
          )}

          {/* Notas */}
          {notas.length > 0 && (
            <div className="mt-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
              ⚠ {notas.map(n => n.nota).join(' · ')}
            </div>
          )}

          {/* Totals */}
          <div className="pt-1 border-t border-gray-200 space-y-0.5">
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Subtotal</span><span>{sym}{pedido.subtotal.toFixed(2)}</span>
            </div>
            {pedido.costo_envio > 0 && (
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Envío</span><span>{sym}{pedido.costo_envio.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs font-bold text-gray-800">
              <span>Total</span><span style={{ color: accent }}>{sym}{pedido.total.toFixed(2)}</span>
            </div>
          </div>

          {/* Re-order button */}
          {hasItems && (
            <button
              onClick={() => onReorder(pedido.items)}
              className="mt-1 w-full py-1.5 rounded-xl text-xs font-semibold border-2 transition-all"
              style={{ borderColor: accent, color: accent, backgroundColor: `${accent}10` }}
            >
              🔁 Re-ordenar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Cliente Detail Panel (slide-over) ───────────────────────────────────────

function ClientePanel({
  telefono, slug, authFetch, onClose, onReorder, moneda,
}: {
  telefono:  string
  slug:      string
  authFetch: ReturnType<typeof useAuthFetch>
  onClose:   () => void
  onReorder: (items: OrderItem[]) => void
  moneda:    string
}) {
  const accent      = useAccent()
  const accentLight = useAccentLight()
  const accentText  = useAccentText()
  const { chatwootBaseUrl, chatwootAccountId, zonaHoraria } = useBranding()
  const [data, setData] = useState<ClienteDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await authFetch(`${apiBase}/dashboard/${slug}/clientes/${encodeURIComponent(telefono)}`)
        if (res.ok) setData(await res.json() as ClienteDetalle)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [telefono, slug, apiBase, authFetch])

  const c = data?.cliente

  const chatLink = chatwootBaseUrl && chatwootAccountId
    ? `${chatwootBaseUrl}/app/accounts/${chatwootAccountId}/contacts?q=${encodeURIComponent((c?.telefono ?? telefono).replace(/\D/g, ''))}`
    : `https://wa.me/${(c?.telefono ?? telefono).replace(/\D/g, '')}`

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ backgroundColor: accentLight, borderColor: accentLight }}>
          <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
            style={{ backgroundColor: accentLight, color: accentText }}>
            {c?.nombre?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{c?.nombre ?? c?.telefono ?? telefono}</p>
            <PhoneDisplay telefono={c?.telefono ?? telefono} linkHref={chatLink} />
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: accent }} />
          </div>
        ) : !data ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">No se encontró el cliente</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-0 border-b border-gray-100">
              {[
                { label: 'Pedidos', value: String(c!.total_pedidos) },
                { label: 'Gastado', value: fmtPrice(c!.total_gastado, moneda === 'EUR' ? '€' : moneda) },
                { label: 'Último',  value: c!.ultimo_pedido ? timeAgo(c!.ultimo_pedido, zonaHoraria) : '—' },
              ].map(stat => (
                <div key={stat.label} className="flex flex-col items-center py-4 gap-0.5 border-r border-gray-100 last:border-0">
                  <span className="text-base font-bold text-gray-900">{stat.value}</span>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">{stat.label}</span>
                </div>
              ))}
            </div>

            {/* Info */}
            <div className="px-5 py-4 flex flex-col gap-2 border-b border-gray-100">
              {c!.direccion_frecuente && (
                <div className="flex gap-2">
                  <span className="text-xs text-gray-400 shrink-0">📍 Dirección:</span>
                  <span className="text-xs text-gray-700">{c!.direccion_frecuente}</span>
                </div>
              )}
              {c!.cliente_desde && (
                <div className="flex gap-2">
                  <span className="text-xs text-gray-400 shrink-0">📅 Cliente desde:</span>
                  <span className="text-xs text-gray-700">{fmtDate(c!.cliente_desde, zonaHoraria)}</span>
                </div>
              )}
              <a href={chatLink} target="chatwoot_panel" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-1 text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl hover:bg-blue-100 w-fit transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                </svg>
                {chatwootBaseUrl ? 'Ver en Chatwoot' : 'Abrir WhatsApp'}
              </a>
            </div>

            {/* Order history */}
            <div className="px-5 pt-4 pb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                Historial de pedidos ({data.pedidos.length})
              </p>
              {data.pedidos.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Sin pedidos registrados</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.pedidos.map(p => (
                    <OrderCard
                      key={p.id}
                      pedido={p}
                      tz={zonaHoraria}
                      moneda={moneda}
                      onReorder={(items) => { onReorder(items); onClose() }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClientesPage() {
  const { slug } = useParams<{ slug: string }>()
  const router   = useRouter()
  const authFetch   = useAuthFetch()
  const branding    = useBranding() as ReturnType<typeof useBranding> & { moneda?: string }
  const { theme, chatwootBaseUrl, chatwootAccountId, zonaHoraria } = branding
  const moneda      = branding.moneda ?? 'EUR'
  const accent      = theme.accent
  const accentLight = theme.accentLight
  const accentText  = theme.accentText
  const apiBase     = process.env.NEXT_PUBLIC_API_URL ?? ''

  const [clientes, setClientes]   = useState<Cliente[]>([])
  const [total,    setTotal]      = useState(0)
  const [page,     setPage]       = useState(1)
  const [pages,    setPages]      = useState(1)
  const [loading,  setLoading]    = useState(true)
  const [query,    setQuery]      = useState('')
  const [selected, setSelected]   = useState<string | null>(null)

  // Re-order state
  const [reorderItems, setReorderItems] = useState<OrderItem[] | null>(null)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedQ, setDebouncedQ] = useState('')

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setDebouncedQ(query); setPage(1) }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (debouncedQ) params.set('q', debouncedQ)
      const res = await authFetch(`${apiBase}/dashboard/${slug}/clientes?${params}`)
      if (res.ok) {
        const data = await res.json() as { clientes: Cliente[]; total: number; page: number; pages: number }
        setClientes(data.clientes)
        setTotal(data.total)
        setPages(data.pages)
      }
    } finally {
      setLoading(false)
    }
  }, [slug, apiBase, authFetch, page, debouncedQ])

  useEffect(() => { load() }, [load])

  const chatwootLink = (tel: string) =>
    chatwootBaseUrl && chatwootAccountId
      ? `${chatwootBaseUrl}/app/accounts/${chatwootAccountId}/contacts?q=${encodeURIComponent(tel.replace(/\D/g, ''))}`
      : `https://wa.me/${tel.replace(/\D/g, '')}`

  return (
    <AccentCtx.Provider value={accent}>
    <AccentLightCtx.Provider value={accentLight}>
    <AccentTextCtx.Provider value={accentText}>
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <div className="h-8 w-8 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ backgroundColor: accent }}>
          E
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-bold text-gray-900 leading-none">Clientes</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <button onClick={() => router.push(`/dashboard/${slug}`)}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
              ← pedidos
            </button>
            <span className="text-gray-200">|</span>
            <span className="text-xs text-gray-400 capitalize">{slug}</span>
          </div>
        </div>
      </div>

      {/* Search + counter */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono…"
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        />
        <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
          {loading ? '…' : `${total} cliente${total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* List */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : clientes.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-sm font-semibold text-gray-700">
              {debouncedQ ? `Sin resultados para "${debouncedQ}"` : 'Sin clientes todavía'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Los clientes aparecen aquí cuando hacen su primer pedido</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {clientes.map(c => (
                <div key={c.usuario_id} className="w-full text-left rounded-2xl border border-gray-200 bg-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ backgroundColor: accentLight, color: accentText }}>
                      {c.nombre?.charAt(0).toUpperCase() ?? c.telefono.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 truncate">{c.nombre ?? c.telefono}</span>
                        {c.nombre && (
                          <PhoneDisplay telefono={c.telefono} linkHref={chatwootLink(c.telefono)} />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: accentLight, color: accentText }}>
                          {c.total_pedidos} pedido{c.total_pedidos !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs font-semibold text-gray-700">
                          {fmtPrice(c.total_gastado, moneda === 'EUR' ? '€' : moneda)}
                        </span>
                        {c.ultimo_pedido && (
                          <span className="text-xs text-gray-400">{timeAgo(c.ultimo_pedido, zonaHoraria)}</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => setSelected(c.telefono)}
                      className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl text-white transition-colors"
                      style={{ backgroundColor: accent }}>
                      Ver detalle
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-6">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-4 py-2 text-xs rounded-xl border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                  ← Anterior
                </button>
                <span className="text-xs text-gray-500">{page} / {pages}</span>
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                  className="px-4 py-2 text-xs rounded-xl border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <ClientePanel
          telefono={selected}
          slug={slug}
          authFetch={authFetch}
          moneda={moneda}
          onClose={() => setSelected(null)}
          onReorder={(items) => { setSelected(null); setReorderItems(items) }}
        />
      )}

      {/* Re-order modal */}
      {reorderItems && (
        <ManualOrderModal
          slug={slug}
          accent={accent}
          moneda={moneda}
          initialCart={reorderItems}
          onClose={() => setReorderItems(null)}
          onCreated={(codigo) => { setReorderItems(null); alert(`Pedido ${codigo} creado`) }}
        />
      )}
    </div>
    </AccentTextCtx.Provider>
    </AccentLightCtx.Provider>
    </AccentCtx.Provider>
  )
}
