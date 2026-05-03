'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT       = '#6366F1'
const ACCENT_LIGHT = '#EEF2FF'
const ACCENT_TEXT  = '#4338CA'
const PAGE_BG      = '#F8FAFC'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Analytics {
  dias: number
  resumen: {
    total_pedidos:    number
    total_ventas:     number
    ticket_promedio:  number
    pedidos_delivery: number
    pedidos_retiro:   number
  }
  por_dia:      { fecha: string; pedidos: number; ventas: number }[]
  top_items:    { nombre: string; cantidad: number; ventas: number }[]
  por_canal:    { canal: string; pedidos: number; ventas: number }[]
  por_pago:     { metodo: string; pedidos: number; ventas: number }[]
  por_estado:   { estado: string; pedidos: number; ventas: number }[]
  por_zona:     { zona: string; pedidos: number; ventas: number }[]
  clientes_top: { nombre: string; telefono: string; pedidos: number; ventas: number }[]
  por_despacho: { tipo: string; pedidos: number; ventas: number }[]
}

type Periodo = 7 | 30 | 90

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return '€' + n.toFixed(2).replace('.', ',')
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase()
}

function estadoBadgeColor(estado: string): { bg: string; color: string } {
  const map: Record<string, { bg: string; color: string }> = {
    confirmado:        { bg: '#D1FAE5', color: '#065F46' },
    entregado:         { bg: '#DBEAFE', color: '#1E40AF' },
    en_preparacion:    { bg: '#FEF3C7', color: '#92400E' },
    en_camino:         { bg: '#EDE9FE', color: '#5B21B6' },
    cancelado:         { bg: '#FEE2E2', color: '#991B1B' },
    pendiente_pago:    { bg: '#FEF9C3', color: '#854D0E' },
    pendiente:         { bg: '#F3F4F6', color: '#374151' },
  }
  return map[estado.toLowerCase()] ?? { bg: '#F3F4F6', color: '#374151' }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div
        className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
        style={{ borderColor: ACCENT, borderTopColor: 'transparent' }}
      />
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mt-4">
      {message}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-100 flex flex-col gap-1">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-900">{value}</p>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest mt-8 mb-3 px-1"
      style={{ color: ACCENT_TEXT }}>
      {children}
    </h2>
  )
}

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr style={{ backgroundColor: ACCENT_LIGHT }}>
        {cols.map(c => (
          <th key={c}
            className="px-3 py-2 text-left text-xs font-semibold"
            style={{ color: ACCENT_TEXT }}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MetricasPage() {
  const params  = useParams()
  const slug    = params?.slug as string
  const authFetch = useAuthFetch()

  const [periodo,   setPeriodo]   = useState<Periodo>(30)
  const [data,      setData]      = useState<Analytics | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const fetchData = useCallback(async (dias: Periodo) => {
    setLoading(true)
    setError(null)
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/analytics?dias=${dias}`
      const res = await authFetch(url)
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`)
      const json: Analytics = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [slug, authFetch])

  useEffect(() => { fetchData(periodo) }, [periodo, fetchData])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen px-4 pb-16" style={{ backgroundColor: PAGE_BG }}>
      {/* ── Header + selector de período ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-6 pb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Métricas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Últimos {periodo} días · {slug}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {([7, 30, 90] as Periodo[]).map(d => {
            const active = d === periodo
            return (
              <button
                key={d}
                onClick={() => setPeriodo(d)}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: active ? ACCENT : '#FFFFFF',
                  color:           active ? '#FFFFFF' : ACCENT_TEXT,
                  border:          `1px solid ${active ? ACCENT : '#E5E7EB'}`,
                }}>
                {d}d
              </button>
            )
          })}
        </div>
      </div>

      {loading && <Spinner />}
      {!loading && error && <ErrorBanner message={error} />}
      {!loading && !error && data && (
        <>
          {/* ── 1. Stat cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
            <StatCard label="Total Pedidos"   value={String(data.resumen.total_pedidos)} />
            <StatCard label="Ventas Totales"  value={fmt(data.resumen.total_ventas)} />
            <StatCard label="Ticket Promedio" value={fmt(data.resumen.ticket_promedio)} />
            <StatCard label="Delivery"        value={String(data.resumen.pedidos_delivery)} />
            <StatCard label="Retiro"          value={String(data.resumen.pedidos_retiro)} />
          </div>

          {/* ── 2. Tendencia diaria ── */}
          <SectionTitle>Tendencia diaria</SectionTitle>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <TableHeader cols={['Fecha', 'Pedidos', 'Ventas']} />
              <tbody>
                {[...data.por_dia]
                  .sort((a, b) => b.fecha.localeCompare(a.fecha))
                  .map((row, i) => (
                    <tr key={row.fecha}
                      className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-500">{row.fecha}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 tabular-nums">{row.pedidos}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 tabular-nums">{fmt(row.ventas)}</td>
                    </tr>
                  ))}
                {data.por_dia.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-gray-400 text-xs">
                      Sin datos para este período
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── 3. Desgloses 2x2 ── */}
          <SectionTitle>Desglose por dimensiones</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Por estado */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b" style={{ backgroundColor: ACCENT_LIGHT }}>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: ACCENT_TEXT }}>
                  Por estado
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs text-gray-400">Estado</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400">Pedidos</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400">Ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_estado.map((row, i) => {
                    const badge = estadoBadgeColor(row.estado)
                    return (
                      <tr key={row.estado} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: badge.bg, color: badge.color }}>
                            {row.estado}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-gray-700">{row.pedidos}</td>
                        <td className="px-3 py-2 tabular-nums text-gray-700">{fmt(row.ventas)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Por zona */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b" style={{ backgroundColor: ACCENT_LIGHT }}>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: ACCENT_TEXT }}>
                  Por zona
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs text-gray-400">Zona</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400">Pedidos</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400">Ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_zona.map((row, i) => (
                    <tr key={row.zona} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-700">{row.zona}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{row.pedidos}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{fmt(row.ventas)}</td>
                    </tr>
                  ))}
                  {data.por_zona.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-center text-xs text-gray-400">Sin datos</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Por método de pago */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b" style={{ backgroundColor: ACCENT_LIGHT }}>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: ACCENT_TEXT }}>
                  Por método de pago
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs text-gray-400">Método</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400">Pedidos</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400">Ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_pago.map((row, i) => (
                    <tr key={row.metodo} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-700 capitalize">{row.metodo}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{row.pedidos}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{fmt(row.ventas)}</td>
                    </tr>
                  ))}
                  {data.por_pago.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-center text-xs text-gray-400">Sin datos</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Por despacho */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b" style={{ backgroundColor: ACCENT_LIGHT }}>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: ACCENT_TEXT }}>
                  Por despacho
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs text-gray-400">Tipo</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400">Pedidos</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400">Ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_despacho.map((row, i) => (
                    <tr key={row.tipo} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-700 capitalize">{row.tipo}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{row.pedidos}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{fmt(row.ventas)}</td>
                    </tr>
                  ))}
                  {data.por_despacho.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-center text-xs text-gray-400">Sin datos</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 4. Best Sellers ── */}
          <SectionTitle>Best Sellers</SectionTitle>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            {data.top_items.slice(0, 10).map((item) => (
              <div key={item.nombre}
                className="flex items-center gap-3 px-4 py-3">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{ backgroundColor: '#E0E7FF', color: ACCENT_TEXT }}>
                  {initials(item.nombre)}
                </div>
                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{item.nombre}</p>
                </div>
                {/* Qty badge */}
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: ACCENT_LIGHT, color: ACCENT_TEXT }}>
                  {item.cantidad} uds
                </span>
                {/* Ventas */}
                <span className="text-sm font-semibold tabular-nums text-gray-700 w-20 text-right">
                  {fmt(item.ventas)}
                </span>
              </div>
            ))}
            {data.top_items.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-gray-400">Sin datos</div>
            )}
          </div>

          {/* ── 5. Loyal Customers ── */}
          <SectionTitle>Loyal Customers</SectionTitle>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            {data.clientes_top.slice(0, 10).map((c) => {
              const waUrl = `https://wa.me/${c.telefono.replace(/\D/g, '')}`
              return (
                <div key={c.telefono}
                  className="flex items-center gap-3 px-4 py-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold bg-gray-100 text-gray-600">
                    {initials(c.nombre)}
                  </div>
                  {/* Name + phone */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.nombre}</p>
                    <p className="text-xs text-gray-400 truncate">{c.telefono}</p>
                  </div>
                  {/* Pedidos badge */}
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: ACCENT_LIGHT, color: ACCENT_TEXT }}>
                    {c.pedidos} pedidos
                  </span>
                  {/* Total */}
                  <span className="text-sm font-semibold tabular-nums text-gray-700 w-20 text-right">
                    {fmt(c.ventas)}
                  </span>
                  {/* WA button */}
                  <a href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-green-50 hover:bg-green-100 transition-colors"
                    title="Abrir WhatsApp">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#25D366">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.523 5.83L.057 23.57a.75.75 0 0 0 .92.92l5.915-1.5A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.373l-.36-.213-3.727.946.99-3.614-.235-.373A9.818 9.818 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                    </svg>
                  </a>
                </div>
              )
            })}
            {data.clientes_top.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-gray-400">Sin datos</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
