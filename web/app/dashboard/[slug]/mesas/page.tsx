'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'
import { useBranding } from '@/lib/context/branding'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Zona {
  zona_id: number
  nombre:  string
  orden:   number
  activa:  boolean
}

interface Mesa {
  mesa_id:     number
  zona_id:     number | null
  zona_nombre: string | null
  numero:      number
  nombre:      string
  capacidad:   number | null
  activa:      boolean
  ocupada:     boolean
  pedido_id:   number | null
  pedido_codigo: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MesasPage() {
  const { slug } = useParams<{ slug: string }>()
  const router   = useRouter()
  const authFetch = useAuthFetch()
  const { theme } = useBranding()
  const accent    = theme.accent
  const base      = process.env.NEXT_PUBLIC_API_URL

  const [zonas,   setZonas]   = useState<Zona[]>([])
  const [mesas,   setMesas]   = useState<Mesa[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // Modal state
  const [showZonaModal, setShowZonaModal] = useState(false)
  const [showMesaModal, setShowMesaModal] = useState(false)
  const [editingZona,   setEditingZona]   = useState<Zona | null>(null)
  const [editingMesa,   setEditingMesa]   = useState<Mesa | null>(null)

  // Form state — zona
  const [zonaForm, setZonaForm] = useState({ nombre: '', orden: 0 })
  // Form state — mesa
  const [mesaForm, setMesaForm] = useState({ nombre: '', numero: '', zona_id: '', capacidad: '' })

  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [zRes, mRes] = await Promise.all([
        authFetch(`${base}/dashboard/${slug}/mesas/zonas`),
        authFetch(`${base}/dashboard/${slug}/mesas`),
      ])
      if (zRes.ok) setZonas(await zRes.json())
      if (mRes.ok) setMesas(await mRes.json())
    } catch {
      setError('Error al cargar mesas')
    } finally {
      setLoading(false)
    }
  }, [slug, base, authFetch])

  useEffect(() => { load() }, [load])

  // ── Zonas CRUD ─────────────────────────────────────────────────────────────

  function openNewZona() {
    setEditingZona(null)
    setZonaForm({ nombre: '', orden: zonas.length })
    setShowZonaModal(true)
  }

  function openEditZona(z: Zona) {
    setEditingZona(z)
    setZonaForm({ nombre: z.nombre, orden: z.orden })
    setShowZonaModal(true)
  }

  async function saveZona() {
    if (!zonaForm.nombre.trim()) return
    setSaving(true)
    try {
      const res = await authFetch(
        editingZona
          ? `${base}/dashboard/${slug}/mesas/zonas/${editingZona.zona_id}`
          : `${base}/dashboard/${slug}/mesas/zonas`,
        { method: editingZona ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(zonaForm) }
      )
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Error al guardar'); return }
      setShowZonaModal(false)
      load()
    } finally { setSaving(false) }
  }

  async function toggleZona(z: Zona) {
    await authFetch(`${base}/dashboard/${slug}/mesas/zonas/${z.zona_id}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activa: !z.activa }) })
    load()
  }

  // ── Mesas CRUD ─────────────────────────────────────────────────────────────

  function openNewMesa() {
    setEditingMesa(null)
    setMesaForm({ nombre: '', numero: String(mesas.length + 1), zona_id: zonas[0]?.zona_id ? String(zonas[0].zona_id) : '', capacidad: '' })
    setShowMesaModal(true)
  }

  function openEditMesa(m: Mesa) {
    setEditingMesa(m)
    setMesaForm({ nombre: m.nombre, numero: String(m.numero), zona_id: m.zona_id ? String(m.zona_id) : '', capacidad: m.capacidad ? String(m.capacidad) : '' })
    setShowMesaModal(true)
  }

  async function saveMesa() {
    if (!mesaForm.nombre.trim() || !mesaForm.numero) return
    setSaving(true)
    try {
      const body = {
        nombre:    mesaForm.nombre.trim(),
        numero:    Number(mesaForm.numero),
        zona_id:   mesaForm.zona_id ? Number(mesaForm.zona_id) : null,
        capacidad: mesaForm.capacidad ? Number(mesaForm.capacidad) : null,
      }
      const res = await authFetch(
        editingMesa
          ? `${base}/dashboard/${slug}/mesas/${editingMesa.mesa_id}`
          : `${base}/dashboard/${slug}/mesas`,
        { method: editingMesa ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      )
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Error al guardar'); return }
      setShowMesaModal(false)
      load()
    } finally { setSaving(false) }
  }

  async function toggleMesa(m: Mesa) {
    await authFetch(`${base}/dashboard/${slug}/mesas/${m.mesa_id}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activa: !m.activa }) })
    load()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const mesasByZona = zonas.map(z => ({
    zona: z,
    mesas: mesas.filter(m => m.zona_id === z.zona_id),
  }))
  const sinZona = mesas.filter(m => m.zona_id === null)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none">←</button>
        <h1 className="text-lg font-bold text-gray-900">Gestión de Mesas</h1>
        <div className="flex-1" />
        <button onClick={openNewZona}
          className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
          style={{ backgroundColor: accent }}>
          + Zona
        </button>
        <button onClick={openNewMesa}
          className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
          style={{ backgroundColor: accent }}>
          + Mesa
        </button>
      </div>

      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error} <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">×</button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: accent, borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <>
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-green-400" /> Libre</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-orange-400" /> Ocupada</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-gray-200" /> Inactiva</span>
            </div>

            {/* Mesas por zona */}
            {mesasByZona.map(({ zona, mesas: zm }) => (
              <section key={zona.zona_id}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold text-gray-700">{zona.nombre}</h2>
                  <span className="text-xs text-gray-400">({zm.length} mesa{zm.length !== 1 ? 's' : ''})</span>
                  <div className="flex-1" />
                  <button onClick={() => openEditZona(zona)}
                    className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded-lg hover:bg-gray-100">
                    Editar zona
                  </button>
                  <button onClick={() => toggleZona(zona)}
                    className="text-xs px-2 py-0.5 rounded-lg"
                    style={{ color: zona.activa ? '#EF4444' : '#22C55E', backgroundColor: zona.activa ? '#FEF2F2' : '#F0FDF4' }}>
                    {zona.activa ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {zm.map(m => (
                    <MesaCard key={m.mesa_id} mesa={m} accent={accent}
                      onEdit={() => openEditMesa(m)}
                      onToggle={() => toggleMesa(m)} />
                  ))}
                  {zm.length === 0 && (
                    <p className="col-span-3 text-xs text-gray-400 py-2">Sin mesas en esta zona</p>
                  )}
                </div>
              </section>
            ))}

            {sinZona.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-gray-700 mb-3">Sin zona asignada</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {sinZona.map(m => (
                    <MesaCard key={m.mesa_id} mesa={m} accent={accent}
                      onEdit={() => openEditMesa(m)}
                      onToggle={() => toggleMesa(m)} />
                  ))}
                </div>
              </section>
            )}

            {mesas.length === 0 && zonas.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">🪑</p>
                <p className="font-medium">Sin mesas configuradas</p>
                <p className="text-sm mt-1">Crea una zona y luego añade mesas</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal — Zona */}
      {showZonaModal && (
        <Modal title={editingZona ? 'Editar zona' : 'Nueva zona'} onClose={() => setShowZonaModal(false)}>
          <div className="space-y-3">
            <Field label="Nombre *">
              <input value={zonaForm.nombre} onChange={e => setZonaForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Interior, Exterior, Sala 1, Terraza…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': accent } as React.CSSProperties} />
            </Field>
            <Field label="Orden de visualización">
              <input type="number" min={0} value={zonaForm.orden}
                onChange={e => setZonaForm(f => ({ ...f, orden: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': accent } as React.CSSProperties} />
            </Field>
            <button onClick={saveZona} disabled={saving || !zonaForm.nombre.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: accent }}>
              {saving ? 'Guardando…' : editingZona ? 'Guardar cambios' : 'Crear zona'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal — Mesa */}
      {showMesaModal && (
        <Modal title={editingMesa ? 'Editar mesa' : 'Nueva mesa'} onClose={() => setShowMesaModal(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número *">
                <input type="number" min={1} value={mesaForm.numero}
                  onChange={e => setMesaForm(f => ({ ...f, numero: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': accent } as React.CSSProperties} />
              </Field>
              <Field label="Capacidad">
                <input type="number" min={1} value={mesaForm.capacidad}
                  placeholder="Opcional"
                  onChange={e => setMesaForm(f => ({ ...f, capacidad: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': accent } as React.CSSProperties} />
              </Field>
            </div>
            <Field label="Nombre *">
              <input value={mesaForm.nombre} onChange={e => setMesaForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Mesa 3, Terraza A, Barra 1…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': accent } as React.CSSProperties} />
            </Field>
            <Field label="Zona">
              <select value={mesaForm.zona_id} onChange={e => setMesaForm(f => ({ ...f, zona_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
                <option value="">Sin zona</option>
                {zonas.filter(z => z.activa).map(z => (
                  <option key={z.zona_id} value={z.zona_id}>{z.nombre}</option>
                ))}
              </select>
            </Field>
            <button onClick={saveMesa} disabled={saving || !mesaForm.nombre.trim() || !mesaForm.numero}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: accent }}>
              {saving ? 'Guardando…' : editingMesa ? 'Guardar cambios' : 'Crear mesa'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MesaCard({ mesa, accent, onEdit, onToggle }: {
  mesa: Mesa; accent: string;
  onEdit: () => void; onToggle: () => void
}) {
  const dot = !mesa.activa ? '#D1D5DB' : mesa.ocupada ? '#FB923C' : '#4ADE80'
  const bg  = !mesa.activa ? '#F9FAFB' : mesa.ocupada ? '#FFF7ED' : '#F0FDF4'
  return (
    <div className="rounded-2xl border p-3 flex flex-col gap-1.5" style={{ backgroundColor: bg, borderColor: dot + '55' }}>
      <div className="flex items-center justify-between">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />
        <span className="font-mono text-xs text-gray-400">#{mesa.numero}</span>
      </div>
      <p className="text-sm font-semibold text-gray-800 leading-tight">{mesa.nombre}</p>
      {mesa.capacidad && <p className="text-xs text-gray-400">{mesa.capacidad} comensales</p>}
      {mesa.ocupada && mesa.pedido_codigo && (
        <p className="text-xs font-medium" style={{ color: accent }}>Pedido {mesa.pedido_codigo}</p>
      )}
      <div className="flex gap-1.5 mt-1">
        <button onClick={onEdit}
          className="flex-1 rounded-lg py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50">
          Editar
        </button>
        <button onClick={onToggle}
          className="flex-1 rounded-lg py-1 text-xs font-medium"
          style={{ color: mesa.activa ? '#EF4444' : '#22C55E', backgroundColor: mesa.activa ? '#FEF2F2' : '#F0FDF4' }}>
          {mesa.activa ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
          {children}
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
