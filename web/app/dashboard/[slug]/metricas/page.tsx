'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Metrics {
  fecha: string
  zona_horaria: string
  today: {
    pedidos_total: number
    pedidos_confirmados: number
    pedidos_en_preparacion: number
    pedidos_en_camino: number
    pedidos_entregados: number
    pedidos_cancelados: number
    pedidos_pendiente_pago: number
    revenue_total: number
    revenue_delivery: number
    revenue_retiro: number
    ticket_promedio: number | null
    costo_envio_total: number
  }
  active_orders: { count: number; oldest_created_at: string | null }
  last_7_days: { pedidos_total: number; revenue_total: number }
}

interface Analytics {
  periodo_dias: number
  zona_horaria: string
  daily: { fecha: string; pedidos: number; entregados: number; revenue: number }[]
  top_items: { nombre: string; total_cantidad: number; total_revenue: number }[]
  by_despacho: Record<string, { pedidos: number; revenue: number }>
  by_pago:     Record<string, { pedidos: number; revenue: number }>
}

type Periodo = 7 | 30 | 90

const PRIMARY = '#F3274C'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '€' + n.toFixed(2).replace('.', ',')
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-100">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-6 mb-3 px-1">{children}</h2>
}

// ─── Mini bar chart (SVG) ─────────────────────────────────────────────────────

function RevenueChart({ daily, dias }: { daily: Analytics['daily']; dias: number }) {
  const W = 600
  const H = 80
  const BARS = Math.min(dias, daily.length, 30)
  const recent = daily.slice(-BARS)
  const maxRev = Math.max(...recent.map(d => d.revenue), 1)
  const barW = Math.max(2, Math.floor((W - BARS * 2) / BARS))
  const gap  = Math.floor((W - barW * BARS) / Math.max(1, BARS - 1))

  if (!recent.length) {
    return <div className="flex items-center justify-center h-20 text-xs text-gray-400">Sin datos para el período</div>
  }

  return (
    <div className="overflow-hidden rounded-xl">
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full" style={{ maxHeight: 100 }}>
        {recent.map((d, i) => {
          const barH = Math.max(2, Math.round((d.revenue / maxRev) * H))
          const x = i * (barW + gap)
          const y = H - barH
          const isLast = i === recent.length - 1
          return (
            <g key={d.fecha}>
              <rect x={x} y={y} width={barW} height={barH}
                fill={isLast ? PRIMARY : '#E5E7EB'} rx={2} />
              {/* Label every ~7 bars */}
              {(i % Math.ceil(BARS / 5) === 0 || isLast) && (
                <text x={x + barW / 2} y={H + 12} fontSize={8} fill="#9CA3AF"
                  textAnchor="middle">
                  {d.fecha.slice(5)} {/* MM-DD */}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MetricasPage() {
  const { slug } = useParams<{ slug: string }>()
  const router   = useRouter()
  const authFetch = useAuthFetch()
  const apiBase  = process.env.NEXT_PUBLIC_API_URL ?? ''

  const [metrics,   setMetrics]   = useState<Metrics | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [loadingAn, setLoadingAn] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [periodo,   setPeriodo]   = useState<Periodo>(30)

  const fetchMetrics = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await authFetch(`${apiBase}/dashboard/${slug}/home/metrics`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setMetrics(await res.json() as Metrics)
    } catch {
      setError('No se pudieron cargar las métricas.')
    } finally {
      setLoading(false)
    }
  }, [slug, apiBase, authFetch])

  const fetchAnalytics = useCallback(async (dias: Periodo) => {
    setLoadingAn(true)
    try {
      const res = await authFetch(`${apiBase}/dashboard/${slug}/analytics?dias=${dias}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setAnalytics(await res.json() as Analytics)
    } catch {
      // silently fail analytics
    } finally {
      setLoadingAn(false)
    }
  }, [slug, apiBase, authFetch])

  useEffect(() => { fetchMetrics() }, [fetchMetrics])
  useEffect(() => { fetchAnalytics(periodo) }, [fetchAnalytics, periodo])

  const m = metrics

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push(`/dashboard/${slug}`)}
              className="text-gray-400 hover:text-gray-700 transition-colors text-lg">←</button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Métricas</h1>
              {m && <p className="text-xs text-gray-400">{m.fecha} · {m.zona_horaria}</p>}
            </div>
          </div>
          <button onClick={() => { fetchMetrics(); fetchAnalytics(periodo) }}
            className="rounded-xl px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 transition-colors">
            ↻ Actualizar
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-red-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-5 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={fetchMetrics} className="mt-3 text-xs text-red-600 underline">Reintentar</button>
          </div>
        ) : m ? (
          <>
            {/* Activos ahora */}
            {m.active_orders.count > 0 && (
              <div className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center gap-3 mb-2">
                <span className="text-2xl">🔔</span>
                <div>
                  <p className="text-sm font-semibold text-blue-800">
                    {m.active_orders.count} pedido{m.active_orders.count !== 1 ? 's' : ''} activo{m.active_orders.count !== 1 ? 's' : ''} ahora
                  </p>
                  {m.active_orders.oldest_created_at && (
                    <p className="text-xs text-blue-600">
                      El más antiguo lleva {Math.floor((Date.now() - new Date(m.active_orders.oldest_created_at).getTime()) / 60000)} min esperando
                    </p>
                  )}
                </div>
                <button onClick={() => router.push(`/dashboard/${slug}`)}
                  className="ml-auto text-xs font-semibold text-blue-700 underline whitespace-nowrap">
                  Ver pedidos
                </button>
              </div>
            )}

            {/* ── Hoy ── */}
            <SectionTitle>Hoy</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Facturación total" value={fmt(m.today.revenue_total)}
                sub={`${m.today.pedidos_total} pedidos`} accent={PRIMARY} />
              <StatCard label="Ticket promedio"
                value={m.today.ticket_promedio !== null ? fmt(m.today.ticket_promedio) : '—'}
                sub={`${m.today.pedidos_entregados} entregados`} />
              <StatCard label="Delivery" value={fmt(m.today.revenue_delivery)}
                sub={`Envíos: ${fmt(m.today.costo_envio_total)}`} />
              <StatCard label="Retiro en local" value={fmt(m.today.revenue_retiro)} />
            </div>

            {/* ── Estados del día ── */}
            <SectionTitle>Estados del día</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
              {[
                { label: 'Pendiente de pago', value: m.today.pedidos_pendiente_pago, color: '#D97706' },
                { label: 'Confirmados',        value: m.today.pedidos_confirmados,   color: '#2563EB' },
                { label: 'En preparación',     value: m.today.pedidos_en_preparacion, color: '#7C3AED' },
                { label: 'En camino',          value: m.today.pedidos_en_camino,     color: '#0284C7' },
                { label: 'Entregados',         value: m.today.pedidos_entregados,    color: '#059669' },
                { label: 'Cancelados',         value: m.today.pedidos_cancelados,    color: '#DC2626' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm text-gray-700">{label}</span>
                  </div>
                  <span className="text-sm font-bold tabular-nums" style={{ color }}>{value}</span>
                </div>
              ))}
            </div>

            {/* ── Últimos 7 días ── */}
            <SectionTitle>Últimos 7 días</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Facturación" value={fmt(m.last_7_days.revenue_total)}
                sub="pedidos entregados" />
              <StatCard label="Pedidos totales" value={String(m.last_7_days.pedidos_total)} />
            </div>

            {/* ── Período selector ── */}
            <div className="flex items-center justify-between mt-8 mb-1 px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Histórico</h2>
              <div className="flex gap-1">
                {([7, 30, 90] as Periodo[]).map(p => (
                  <button key={p} onClick={() => setPeriodo(p)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                      periodo === p ? 'text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                    style={periodo === p ? { backgroundColor: PRIMARY } : undefined}>
                    {p}d
                  </button>
                ))}
              </div>
            </div>

            {loadingAn ? (
              <div className="flex justify-center py-10">
                <div className="h-6 w-6 rounded-full border-4 border-gray-200 border-t-red-500 animate-spin" />
              </div>
            ) : analytics ? (
              <>
                {/* ── Gráfico de ingresos diarios ── */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 pt-4 pb-3 mb-3">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-600">Ingresos diarios (últimos {periodo}d)</p>
                    {analytics.daily.length > 0 && (
                      <p className="text-xs text-gray-400">
                        Total: {fmt(analytics.daily.reduce((s, d) => s + d.revenue, 0))}
                      </p>
                    )}
                  </div>
                  <RevenueChart daily={analytics.daily} dias={periodo} />
                </div>

                {/* ── Resumen del período ── */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <StatCard label="Facturación"
                    value={fmt(analytics.daily.reduce((s, d) => s + d.revenue, 0))}
                    accent={PRIMARY} />
                  <StatCard label="Pedidos"
                    value={String(analytics.daily.reduce((s, d) => s + d.pedidos, 0))} />
                  <StatCard label="Entregados"
                    value={String(analytics.daily.reduce((s, d) => s + d.entregados, 0))} />
                </div>

                {/* ── Top productos ── */}
                {analytics.top_items.length > 0 && (
                  <>
                    <SectionTitle>Top productos ({periodo}d)</SectionTitle>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      {(() => {
                        const maxQty = analytics.top_items[0]?.total_cantidad ?? 1
                        return analytics.top_items.map((item, i) => (
                          <div key={item.nombre}
                            className="relative flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                            {/* Background bar */}
                            <div className="absolute inset-0 opacity-5 rounded-none"
                              style={{ width: `${(item.total_cantidad / maxQty) * 100}%`, backgroundColor: PRIMARY }} />
                            <span className="text-xs font-bold text-gray-300 tabular-nums w-5 shrink-0">{i + 1}</span>
                            <span className="flex-1 text-sm text-gray-800 truncate relative">{item.nombre}</span>
                            <div className="flex items-center gap-3 shrink-0 relative">
                              <span className="text-xs font-semibold text-gray-500">{item.total_cantidad}×</span>
                              <span className="text-xs font-bold text-gray-700 tabular-nums w-20 text-right">
                                {fmt(item.total_revenue)}
                              </span>
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  </>
                )}

                {/* ── Desglose tipo despacho ── */}
                {Object.keys(analytics.by_despacho).length > 0 && (
                  <>
                    <SectionTitle>Por tipo de entrega ({periodo}d)</SectionTitle>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
                      {Object.entries(analytics.by_despacho)
                        .sort((a, b) => b[1].pedidos - a[1].pedidos)
                        .map(([tipo, data]) => (
                          <div key={tipo} className="flex items-center justify-between px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{tipo === 'delivery' ? '🛵' : tipo === 'retiro' ? '🏪' : '❓'}</span>
                              <span className="text-sm text-gray-700 capitalize">{tipo.replace('_', ' ')}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-xs text-gray-400">{data.pedidos} pedidos</span>
                              <span className="text-sm font-bold text-gray-900 tabular-nums">{fmt(data.revenue)}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </>
                )}

                {/* ── Desglose método de pago ── */}
                {Object.keys(analytics.by_pago).length > 0 && (
                  <>
                    <SectionTitle>Por método de pago ({periodo}d)</SectionTitle>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50 mb-6">
                      {Object.entries(analytics.by_pago)
                        .sort((a, b) => b[1].pedidos - a[1].pedidos)
                        .map(([metodo, data]) => {
                          const icons: Record<string, string> = {
                            efectivo: '💵', transferencia: '🏦', tarjeta: '💳',
                            bizum: '📱', online: '🌐', sin_definir: '❓',
                          }
                          return (
                            <div key={metodo} className="flex items-center justify-between px-5 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-base">{icons[metodo] ?? '💰'}</span>
                                <span className="text-sm text-gray-700 capitalize">{metodo.replace('_', ' ')}</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-xs text-gray-400">{data.pedidos} pedidos</span>
                                <span className="text-sm font-bold text-gray-900 tabular-nums">{fmt(data.revenue)}</span>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </>
                )}
              </>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  )
}
