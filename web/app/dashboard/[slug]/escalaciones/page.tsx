'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'
import { useBranding } from '@/lib/context/branding'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Escalacion {
  id: number
  telefono: string
  problema: string | null
  contexto: {
    contexto_actual?: string
    respuesta_agente?: string
  } | null
  conversation_id: string | null
  account_id: string | null
  contact_id: string | null
  tipo_escalacion: string | null
  estado: 'pendiente' | 'resuelto'
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return `hace ${diff}s`
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Atlantic/Canary' })
}

const TIPO_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  derivacion_cliente:     { label: 'Cliente',       bg: '#DBEAFE', color: '#1E40AF' },
  error_sistema:          { label: 'Error sistema',  bg: '#FEE2E2', color: '#991B1B' },
  ventana_expirada:       { label: 'Ventana exp.',   bg: '#FEF3C7', color: '#92400E' },
  pedido_en_preparacion:  { label: 'En preparación', bg: '#E0E7FF', color: '#3730A3' },
  carrito_expirado:       { label: 'Carrito exp.',   bg: '#F3F4F6', color: '#374151' },
}

function TipoBadge({ tipo }: { tipo: string | null }) {
  const key = tipo ?? 'derivacion_cliente'
  const cfg = TIPO_LABELS[key] ?? { label: key, bg: '#F3F4F6', color: '#374151' }
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

function openChatwoot(
  baseUrl: string | null,
  accountId: string | null,
  conversationId: string | null,
  telefono: string,
) {
  if (baseUrl && accountId && conversationId) {
    window.open(`${baseUrl}/app/accounts/${accountId}/conversations/${conversationId}`, '_blank')
  } else if (baseUrl && accountId) {
    // No conversation_id — open contact search
    const phone = telefono.replace(/\D/g, '')
    window.open(`${baseUrl}/app/accounts/${accountId}/contacts?q=${encodeURIComponent(phone)}`, '_blank')
  } else {
    // Fallback: WhatsApp
    window.open(`https://wa.me/${telefono.replace(/\D/g, '')}`, '_blank')
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EscalacionesPage() {
  const { slug }  = useParams<{ slug: string }>()
  const router    = useRouter()
  const authFetch = useAuthFetch()
  const { theme, chatwootBaseUrl } = useBranding()
  const accent    = theme.accent

  const [escalaciones, setEscalaciones] = useState<Escalacion[]>([])
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [filter,       setFilter]       = useState<'pendiente' | 'resuelto' | ''>('pendiente')
  const [resolvingId,  setResolvingId]  = useState<number | null>(null)
  const [expanded,     setExpanded]     = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const base    = process.env.NEXT_PUBLIC_API_URL
      const params  = filter ? `?estado=${filter}` : ''
      const res     = await authFetch(`${base}/dashboard/${slug}/escalaciones${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { escalaciones: Escalacion[]; total: number } = await res.json()
      setEscalaciones(data.escalaciones)
      setTotal(data.total)
    } catch {
      setError('No se pudieron cargar las escalaciones.')
    } finally {
      setLoading(false)
    }
  }, [slug, filter, authFetch])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleResolve(id: number) {
    setResolvingId(id)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const res  = await authFetch(`${base}/dashboard/${slug}/escalaciones/${id}`, {
        method: 'PATCH',
      })
      if (!res.ok) throw new Error()
      setEscalaciones((prev) =>
        prev.map((e) => e.id === id ? { ...e, estado: 'resuelto' as const } : e)
          .filter((e) => filter !== 'pendiente' || e.estado === 'pendiente')
      )
    } catch {
      // Silent — refetch en próxima interacción
    } finally {
      setResolvingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/dashboard/${slug}`)}
              className="text-gray-400 hover:text-gray-700 transition-colors text-lg"
            >
              ←
            </button>
            <div>
              <h1 className="text-base font-bold text-gray-900">Derivar humano</h1>
              <p className="text-xs text-gray-400">Conversaciones escaladas por el agente</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="rounded-xl px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            ↻ Actualizar
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-3xl mx-auto px-4 pb-0 flex gap-1">
          {(['pendiente', 'resuelto', ''] as const).map((key) => {
            const label = key === 'pendiente' ? 'Pendientes' : key === 'resuelto' ? 'Resueltos' : 'Todos'
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
                  filter === key
                    ? 'border-transparent'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                style={filter === key ? { borderColor: accent, color: accent } : undefined}
              >
                {label}
              </button>
            )
          })}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-gray-200 animate-spin" style={{ borderTopColor: accent }} />
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-5 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={fetchData} className="mt-3 text-xs text-red-600 underline">Reintentar</button>
          </div>
        ) : escalaciones.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="text-5xl">🙌</span>
            <p className="text-sm text-gray-500">
              {filter === 'pendiente' ? 'No hay conversaciones pendientes' : 'No hay conversaciones en este estado'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-4">{total} conversacion{total !== 1 ? 'es' : ''}</p>
            <div className="space-y-3">
              {escalaciones.map((e) => (
                <div
                  key={e.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                >
                  {/* Card header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{e.telefono}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={
                          e.estado === 'pendiente'
                            ? { color: '#92400E', backgroundColor: '#FEF3C7' }
                            : { color: '#065F46', backgroundColor: '#D1FAE5' }
                        }
                      >
                        {e.estado === 'pendiente' ? '⚠ Pendiente' : '✓ Resuelto'}
                      </span>
                      <TipoBadge tipo={e.tipo_escalacion} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{timeAgo(e.created_at)}</span>
                      <span className="text-gray-300">{expanded === e.id ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Problema visible siempre */}
                  {e.problema && (
                    <div className="px-4 pb-3">
                      <p className="text-sm text-gray-700 line-clamp-2">{e.problema}</p>
                    </div>
                  )}

                  {/* Expandido: contexto completo */}
                  {expanded === e.id && (
                    <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                      {e.contexto?.contexto_actual && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                            Contexto del agente
                          </p>
                          <pre className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 whitespace-pre-wrap overflow-auto max-h-48">
                            {e.contexto.contexto_actual}
                          </pre>
                        </div>
                      )}
                      {e.contexto?.respuesta_agente && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                            Respuesta del agente
                          </p>
                          <p className="text-sm text-gray-700 bg-blue-50 rounded-xl p-3">
                            {e.contexto.respuesta_agente}
                          </p>
                        </div>
                      )}
                      {e.resolved_by && (
                        <p className="text-xs text-gray-400">
                          Resuelto por {e.resolved_by} · {e.resolved_at ? timeAgo(e.resolved_at) : ''}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 px-4 pb-3">
                    <button
                      onClick={() => openChatwoot(chatwootBaseUrl, e.account_id, e.conversation_id, e.telefono)}
                      className="rounded-xl px-3 py-2 text-xs font-medium transition-colors"
                      style={{ backgroundColor: '#DBEAFE', color: '#1E40AF' }}
                    >
                      💬 {e.conversation_id ? 'Ver en Chatwoot' : 'Buscar en Chatwoot'}
                    </button>

                    {e.estado === 'pendiente' && (
                      <button
                        onClick={() => handleResolve(e.id)}
                        disabled={resolvingId === e.id}
                        className="flex-1 rounded-xl py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: accent }}
                      >
                        {resolvingId === e.id ? '…' : '✓ Marcar como resuelto'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
