'use client'

import { useEffect, useState, useCallback, createContext, useContext } from 'react'
import { useParams } from 'next/navigation'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'
import { useBranding } from '@/lib/context/branding'

const AccentCtx      = createContext('#6366F1')
const AccentLightCtx = createContext('#EEF2FF')
const useAccent      = () => useContext(AccentCtx)
const useAccentLight = () => useContext(AccentLightCtx)

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  user_id:    string
  rol:        string
  email:      string | null
  created_at: string
}

interface InviteResult {
  token:      string
  expires_at: string
  rol:        string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROL_LABEL: Record<string, string> = {
  owner:   'Propietario',
  manager: 'Gerente',
  viewer:   'Personal',
}

const ROL_BADGE: Record<string, { bg: string; text: string }> = {
  owner:   { bg: '#FEF3C7', text: '#92400E' },
  manager: { bg: '#DBEAFE', text: '#1E40AF' },
  viewer:   { bg: '#F3F4F6', text: '#374151' },
}

function RolBadge({ rol }: { rol: string }) {
  const style = ROL_BADGE[rol] ?? ROL_BADGE['viewer']
  return (
    <span
      style={{ backgroundColor: style.bg, color: style.text }}
      className="text-xs font-medium px-2 py-0.5 rounded-full"
    >
      {ROL_LABEL[rol] ?? rol}
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    /* fallback ignored */
  })
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EquipoPage() {
  const params    = useParams()
  const slug      = Array.isArray(params.slug) ? params.slug[0] : (params.slug ?? '')
  const authFetch = useAuthFetch()
  const branding  = useBranding()

  const accent      = branding?.theme?.accent      ?? '#6366F1'
  const accentLight = branding?.theme?.accentLight ?? '#EEF2FF'

  return (
    <AccentCtx.Provider value={accent}>
      <AccentLightCtx.Provider value={accentLight}>
        <EquipoInner slug={slug} authFetch={authFetch} />
      </AccentLightCtx.Provider>
    </AccentCtx.Provider>
  )
}

function EquipoInner({
  slug,
  authFetch,
}: {
  slug: string
  authFetch: ReturnType<typeof useAuthFetch>
}) {
  const accent      = useAccent()
  const accentLight = useAccentLight()

  const [members, setMembers]         = useState<Member[]>([])
  const [myRol, setMyRol]             = useState<string | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  // Invite form
  const [inviteRol, setInviteRol]     = useState<'manager' | 'viewer'>('viewer')
  const [inviteState, setInviteState] = useState<SaveState>('idle')
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null)
  const [copied, setCopied]           = useState(false)

  // Role change
  const [changingRol, setChangingRol] = useState<string | null>(null)  // user_id being changed

  // Remove member
  const [removing, setRemoving]       = useState<string | null>(null)

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''

  // ── Fetch members ──────────────────────────────────────────────────────────

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await authFetch(`${apiBase}/dashboard/${slug}/members`)
      if (!res.ok) { setError('No se pudo cargar el equipo.'); return }
      const data = await res.json()
      const list: Member[] = data.members ?? []
      setMembers(list)
    } catch {
      setError('Error de conexión.')
    } finally {
      setLoading(false)
    }
  }, [slug, authFetch, apiBase])

  // ── Fetch my role ──────────────────────────────────────────────────────────

  const fetchMyRol = useCallback(async () => {
    try {
      const res = await authFetch(`${apiBase}/dashboard/me`)
      if (!res.ok) return
      const data = await res.json()
      const restaurant = (data.restaurants as { slug: string; rol: string }[] | undefined)
        ?.find(r => r.slug === slug)
      if (restaurant) setMyRol(restaurant.rol)
    } catch { /* silent */ }
  }, [slug, authFetch, apiBase])

  useEffect(() => {
    fetchMembers()
    fetchMyRol()
  }, [fetchMembers, fetchMyRol])

  // ── Generate invite link ───────────────────────────────────────────────────

  async function generateInvite() {
    setInviteState('saving')
    setInviteResult(null)
    setCopied(false)
    try {
      const res = await authFetch(`${apiBase}/dashboard/${slug}/members/invite`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rol: inviteRol }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = (err as { error?: string }).error ?? 'error'
        setInviteState('error')
        setError(msg === 'forbidden' ? 'No tienes permisos para invitar.' : 'Error al generar invitación.')
        return
      }
      const data: InviteResult = await res.json()
      setInviteResult(data)
      setInviteState('saved')
    } catch {
      setInviteState('error')
      setError('Error de conexión.')
    }
  }

  function getInviteUrl(token: string) {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/dashboard/join?token=${token}`
  }

  function handleCopy(token: string) {
    copyToClipboard(getInviteUrl(token))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Change role ────────────────────────────────────────────────────────────

  async function changeRol(target_user_id: string, newRol: string) {
    setChangingRol(target_user_id)
    try {
      const res = await authFetch(`${apiBase}/dashboard/${slug}/members/${target_user_id}/rol`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rol: newRol }),
      })
      if (res.ok) {
        setMembers(prev => prev.map(m =>
          m.user_id === target_user_id ? { ...m, rol: newRol } : m,
        ))
      }
    } catch { /* silent */ }
    finally { setChangingRol(null) }
  }

  // ── Remove member ──────────────────────────────────────────────────────────

  async function removeMember(target_user_id: string) {
    if (!confirm('¿Eliminar este miembro del equipo?')) return
    setRemoving(target_user_id)
    try {
      const res = await authFetch(`${apiBase}/dashboard/${slug}/members/${target_user_id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setMembers(prev => prev.filter(m => m.user_id !== target_user_id))
      }
    } catch { /* silent */ }
    finally { setRemoving(null) }
  }

  const canInvite  = myRol === 'owner' || myRol === 'manager'
  const canManage  = myRol === 'owner'

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Equipo</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gestiona los miembros del equipo y sus permisos.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Invite section */}
      {canInvite && (
        <div
          className="rounded-xl border p-5 space-y-4"
          style={{ borderColor: accentLight, backgroundColor: accentLight + '55' }}
        >
          <h2 className="text-base font-semibold text-gray-800">Invitar miembro</h2>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-gray-600 font-medium">Rol:</label>
            <select
              value={inviteRol}
              onChange={e => setInviteRol(e.target.value as 'manager' | 'viewer')}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
            >
              {myRol === 'owner' && (
                <option value="manager">Gerente</option>
              )}
              <option value="viewer">Personal</option>
            </select>

            <button
              onClick={generateInvite}
              disabled={inviteState === 'saving'}
              className="text-sm font-medium px-4 py-1.5 rounded-lg text-white transition-opacity"
              style={{ backgroundColor: accent, opacity: inviteState === 'saving' ? 0.6 : 1 }}
            >
              {inviteState === 'saving' ? 'Generando…' : 'Generar enlace'}
            </button>
          </div>

          {inviteResult && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
              <p className="text-xs text-gray-500">
                Enlace válido hasta {fmtDate(inviteResult.expires_at)}.
                Compártelo con quien quieras añadir como{' '}
                <strong>{ROL_LABEL[inviteResult.rol] ?? inviteResult.rol}</strong>.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 truncate">
                  {getInviteUrl(inviteResult.token)}
                </code>
                <button
                  onClick={() => handleCopy(inviteResult.token)}
                  className="text-xs font-medium px-3 py-1 rounded-lg border transition-colors"
                  style={{
                    borderColor:     copied ? '#16A34A' : accent,
                    color:           copied ? '#16A34A' : accent,
                    backgroundColor: 'white',
                  }}
                >
                  {copied ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Members list */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">
          Miembros del equipo
          {members.length > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-400">({members.length})</span>
          )}
        </h2>

        {loading ? (
          <div className="text-sm text-gray-400 py-8 text-center">Cargando…</div>
        ) : members.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">No hay miembros aún.</div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden bg-white">
            {members.map(m => (
              <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                {/* Avatar placeholder */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: accentLight, color: accent }}
                >
                  {(m.email ?? m.user_id).slice(0, 1).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {m.email ?? <span className="text-gray-400 font-mono text-xs">{m.user_id.slice(0, 8)}…</span>}
                  </p>
                  <p className="text-xs text-gray-400">Desde {fmtDate(m.created_at)}</p>
                </div>

                {/* Role badge / selector */}
                {canManage && m.rol !== 'owner' ? (
                  <select
                    value={m.rol}
                    disabled={changingRol === m.user_id}
                    onChange={e => changeRol(m.user_id, e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
                  >
                    <option value="manager">Gerente</option>
                    <option value="viewer">Personal</option>
                  </select>
                ) : (
                  <RolBadge rol={m.rol} />
                )}

                {/* Remove button */}
                {canManage && m.rol !== 'owner' && (
                  <button
                    onClick={() => removeMember(m.user_id)}
                    disabled={removing === m.user_id}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors px-1"
                    title="Eliminar miembro"
                  >
                    {removing === m.user_id ? '…' : '✕'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
   
    </div>
  )
}
