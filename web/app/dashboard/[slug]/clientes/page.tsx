'use client'

import { useEffect, useState, useCallback, useRef, createContext, useContext } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'
import { useBranding } from '@/lib/context/branding'

const AccentCtx      = createContext('#6366F1')
const AccentLightCtx = createContext('#EEF2FF')
const AccentTextCtx  = createContext('#4338CA')
const useAccent      = () => useContext(AccentCtx)
const useAccentLight = () => useContext(AccentLightCtx)
const useAccentText  = () => useContext(AccentTextCtx)

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

interface ClienteDetalle {
  cliente: Cliente
  pedidos: PedidoCliente[]
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number) {
  return '€' + n.toFixed(2).replace('.', ',')
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

// ─── Cliente Detail Panel (slide-over) ───────────────────────────────────────

function ClientePanel({
  telefono, slug, authFetch, onClose,
}: {
  telefono: string; slug: string
  authFetch: ReturnType<typeof useAuthFetch>
  onClose: () => void
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

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ backgroundColor: accentLight, borderColor: accentLight }}>
          <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ backgroundColor: accentLight, color: accentText }}>
            {c?.nombre?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{c?.nombre ?? c?.telefono ?? telefono}</p>
            <p className="text-xs text-gray-400">{c?.telefono}</p>
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
                { label: 'Gastado', value: fmtPrice(c!.total_gastado) },
                { label: 'Último', value: c!.ultimo_pedido ? timeAgo(c!.ultimo_pedido, zonaHoraria) : '—' },
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
              <a
                href={
                  chatwootBaseUrl && chatwootAccountId
                    ? `${chatwootBaseUrl}/app/accounts/${chatwootAccountId}/contacts?q=${encodeURIComponent(c!.telefono.replace(/\D/g, ''))}`
                    : `https://wa.me/${c!.telefono.replace(/\D/g, '')}`
                }
                target="chatwoot_panel" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-1 text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl hover:bg-blue-100 w-fit transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                {chatwootBaseUrl ? 'Ver en Chatwoot' : 'Abrir WhatsApp'}
              </a>
            </div>

            {/* Order history */}
            <div className="px-5 pt-4 pb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                Historial de pedidos ({data.pedidos.length})
              </p>
              {data.pedidos.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Sin pedidos registrados</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.pedidos.map(p => (
                    <div key={p.id} className="rounded-xl border border-gray-100 px-4 py-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-mono font-semibold text-gray-700">{p.pedido_codigo ?? `#${p.id}`}</span>
                        <EstadoBadge estado={p.estado} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          {p.tipo_despacho ?? '—'} · {p.items_count} ítem{p.items_count !== 1 ? 's' : ''}
                          {p.metodo_pago ? ` · ${p.metodo_pago}` : ''}
                        </span>
                        <span className="font-semibold text-gray-800">{fmtPrice(p.total)}</span>
                      </div>
                      <p className="text-[10px] text-gray-300 mt-1">{fmtDate(p.created_at, zonaHoraria)}</p>
                    </div>
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
  const { theme, chatwootBaseUrl, chatwootAccountId, zonaHoraria } = useBranding()
  const accent      = theme.accent
  const accentLight = theme.accentLight
  const accentText  = theme.accentText
  const apiBase  = process.env.NEXT_PUBLIC_API_URL ?? ''

  const [clientes, setClientes]       = useState<Cliente[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [pages, setPages]             = useState(1)
  const [loading, setLoading]         = useState(true)
  const [query, setQuery]             = useState('')
  const [selected, setSelected]       = useState<string | null>(null)

  // Debounce search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedQ, setDebouncedQ] = useState('')

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setDebouncedQ(query)
      setPage(1)
    }, 350)
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
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />
            ))}
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
                <div
                  key={c.usuario_id}
                  className="w-full text-left rounded-2xl border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar circular 40x40 con iniciales */}
                    <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ backgroundColor: accentLight, color: accentText }}>
                      {c.nombre?.charAt(0).toUpperCase() ?? c.telefono.charAt(0)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {c.nombre ?? c.telefono}
                        </span>
                        {c.nombre && (
                          <a
                            href={
                              chatwootBaseUrl && chatwootAccountId
                                ? `${chatwootBaseUrl}/app/accounts/${chatwootAccountId}/contacts?q=${encodeURIComponent(c.telefono.replace(/\D/g, ''))}`
                                : `https://wa.me/${c.telefono.replace(/\D/g, '')}`
                            }
                            target="chatwoot_panel" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-xs shrink-0 underline underline-offset-2" style={{ color: accent }}
                          >
                            {c.telefono}
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: accentLight, color: accentText }}>
                          {c.total_pedidos} pedido{c.total_pedidos !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs font-semibold text-gray-700">{fmtPrice(c.total_gastado)}</span>
                        {c.ultimo_pedido && <span className="text-xs text-gray-400">{timeAgo(c.ultimo_pedido, zonaHoraria)}</span>}
                      </div>
                    </div>

                    <button
                      onClick={() => setSelected(c.telefono)}
                      className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl text-white transition-colors" style={{ backgroundColor: accent }}
                    >
                      Ver detalle
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-6">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 text-xs rounded-xl border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                >
                  ← Anterior
                </button>
                <span className="text-xs text-gray-500">{page} / {pages}</span>
                <button
                  onClick={() => setPage(p => Math.min(pages, p + 1))}
                  disabled={page === pages}
                  className="px-4 py-2 text-xs rounded-xl border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                >
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
          onClose={() => setSelected(null)}
        />
      )}
    </div>
    </AccentTextCtx.Provider>
    </AccentLightCtx.Provider>
    </AccentCtx.Provider>
  )
}
