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
  active_orders: {
    count: number
    oldest_created_at: string | null
  }
  last_7_days: {
    pedidos_total: number
    revenue_total: number
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `$${n.toLocaleString('es-CL')}`
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-100">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p
        className="text-2xl font-bold text-gray-900 tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-6 mb-3 px-1">
      {children}
    </h2>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MetricasPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const authFetch = useAuthFetch()

  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMetrics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const res = await authFetch(`${base}/dashboard/${slug}/home/metrics`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: Metrics = await res.json()
      setMetrics(data)
    } catch {
      setError('No se pudieron cargar las métricas.')
    } finally {
      setLoading(false)
    }
  }, [slug, authFetch])

  useEffect(() => { fetchMetrics() }, [fetchMetrics])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/dashboard/${slug}`)}
              className="text-gray-400 hover:text-gray-700 transition-colors text-lg"
              aria-label="Volver"
            >
              ←
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Métricas</h1>
              {metrics && (
                <p className="text-xs text-gray-400">{metrics.fecha} · {metrics.zona_horaria}</p>
              )}
            </div>
          </div>
          <button
            onClick={fetchMetrics}
            className="rounded-xl px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 transition-colors"
          >
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
            <button onClick={fetchMetrics} className="mt-3 text-xs text-red-600 underline">
              Reintentar
            </button>
          </div>
        ) : metrics ? (
          <>
            {/* Pedidos activos ahora */}
            {metrics.active_orders.count > 0 && (
              <div className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center gap-3 mb-2">
                <span className="text-2xl">🔔</span>
                <div>
                  <p className="text-sm font-semibold text-blue-800">
                    {metrics.active_orders.count} pedido{metrics.active_orders.count !== 1 ? 's' : ''} activo{metrics.active_orders.count !== 1 ? 's' : ''} ahora
                  </p>
                  {metrics.active_orders.oldest_created_at && (
                    <p className="text-xs text-blue-600">
                      El más antiguo lleva {Math.floor((Date.now() - new Date(metrics.active_orders.oldest_created_at).getTime()) / 60000)} min esperando
                    </p>
                  )}
                </div>
                <button
                  onClick={() => router.push(`/dashboard/${slug}`)}
                  className="ml-auto text-xs font-semibold text-blue-700 underline whitespace-nowrap"
                >
                  Ver pedidos
                </button>
              </div>
            )}

            {/* Revenue hoy */}
            <SectionTitle>Hoy</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Facturación total"
                value={fmt(metrics.today.revenue_total)}
                sub={`${metrics.today.pedidos_total} pedidos`}
                accent="#E63946"
              />
              <StatCard
                label="Ticket promedio"
                value={metrics.today.ticket_promedio !== null ? fmt(metrics.today.ticket_promedio) : '—'}
                sub={`${metrics.today.pedidos_entregados} entregados`}
              />
              <StatCard
                label="Delivery"
                value={fmt(metrics.today.revenue_delivery)}
                sub={`Envíos: ${fmt(metrics.today.costo_envio_total)}`}
              />
              <StatCard
                label="Retiro en local"
                value={fmt(metrics.today.revenue_retiro)}
              />
            </div>

            {/* Estados hoy */}
            <SectionTitle>Estados del día</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
              {[
                { label: 'Pendiente de pago', value: metrics.today.pedidos_pendiente_pago, color: '#D97706' },
                { label: 'Confirmados',        value: metrics.today.pedidos_confirmados,   color: '#2563EB' },
                { label: 'En preparación',     value: metrics.today.pedidos_en_preparacion, color: '#7C3AED' },
                { label: 'En camino',           value: metrics.today.pedidos_en_camino,     color: '#0284C7' },
                { label: 'Entregados',          value: metrics.today.pedidos_entregados,    color: '#059669' },
                { label: 'Cancelados',          value: metrics.today.pedidos_cancelados,    color: '#DC2626' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm text-gray-700">{label}</span>
                  </div>
                  <span className="text-sm font-bold tabular-nums" style={{ color }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Últimos 7 días */}
            <SectionTitle>Últimos 7 días</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Facturación"
                value={fmt(metrics.last_7_days.revenue_total)}
                sub="solo pedidos entregados"
              />
              <StatCard
                label="Pedidos totales"
                value={String(metrics.last_7_days.pedidos_total)}
              />
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
