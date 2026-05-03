'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DatosBancarios {
  banco?:   string
  titular?: string
  cuenta?:  string
  alias?:   string
}

interface Settings {
  nombre:             string
  telefono:           string | null
  direccion:          string | null
  mensaje_bienvenida: string | null
  mensaje_cerrado:    string | null
  datos_bancarios:    DatosBancarios | null
  moneda:             string
  payment_methods:    string[] | null
}

interface DeliveryZone {
  delivery_zone_id:      number
  zone_name:             string
  postal_code:           string
  fee:                   number
  is_active:             boolean
  description:           string | null
  min_order_amount:      number | null
  estimated_minutes_min: number | null
  estimated_minutes_max: number | null
}

interface HorarioLocal {
  id:         number
  dia:        string
  disponible: boolean
  apertura_1: string   // 'HH:MM' or ''
  cierre_1:   string
  apertura_2: string   // '' means no 2nd shift
  cierre_2:   string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_PAYMENT_METHODS = [
  { key: 'efectivo',      label: 'Efectivo',      icon: '💵' },
  { key: 'transferencia', label: 'Transferencia', icon: '🏦' },
  { key: 'tarjeta',       label: 'Tarjeta',       icon: '💳' },
  { key: 'bizum',         label: 'Bizum',         icon: '📱' },
  { key: 'online',        label: 'Online',        icon: '🌐' },
]

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function SaveButton({ state, onClick, disabled }: { state: SaveState; onClick: () => void; disabled?: boolean }) {
  const labels: Record<SaveState, string> = {
    idle:   'Guardar cambios',
    saving: 'Guardando…',
    saved:  '✓ Guardado',
    error:  'Error al guardar',
  }
  const styles: Record<SaveState, string> = {
    idle:   'bg-red-500 hover:bg-red-600 text-white',
    saving: 'bg-gray-300 text-gray-500 cursor-not-allowed',
    saved:  'bg-green-500 text-white',
    error:  'bg-red-100 text-red-700 border border-red-300',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled || state === 'saving' || state === 'saved'}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${styles[state]}`}
    >
      {labels[state]}
    </button>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-6 mb-3 px-1">
      {children}
    </h2>
  )
}

function Field({
  label, value, onChange, placeholder, multiline, maxLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  maxLength?: number
}) {
  const base = 'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent bg-white transition-shadow'
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {multiline ? (
        <textarea className={`${base} resize-none`} rows={3} value={value}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} />
      ) : (
        <input className={base} type="text" value={value}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} />
      )}
      {maxLength && value.length > maxLength * 0.85 && (
        <p className="text-xs text-gray-400 text-right mt-1">{value.length}/{maxLength}</p>
      )}
    </div>
  )
}

// ─── Horario row component ─────────────────────────────────────────────────

function TimeInput({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed w-[110px] tabular-nums"
    />
  )
}

function HorarioRow({
  horario,
  onChange,
}: {
  horario: HorarioLocal
  onChange: (updated: HorarioLocal) => void
}) {
  const has2ndShift = horario.apertura_2 !== '' || horario.cierre_2 !== ''

  function update(fields: Partial<HorarioLocal>) {
    onChange({ ...horario, ...fields })
  }

  function toggle2ndShift() {
    if (has2ndShift) {
      update({ apertura_2: '', cierre_2: '' })
    } else {
      update({ apertura_2: '', cierre_2: '' }) // will show the inputs empty
      // trigger a small state flip to show the inputs
      setTimeout(() => onChange({ ...horario, apertura_2: ' ', cierre_2: ' ' }), 0)
    }
  }

  return (
    <div className={`py-3 px-4 border-b border-gray-50 last:border-0 ${!horario.disponible ? 'bg-gray-50/50' : ''}`}>
      {/* Day toggle */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => update({ disponible: !horario.disponible })}
          className="flex items-center gap-2.5 group"
          type="button"
        >
          {/* Toggle pill */}
          <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${horario.disponible ? 'bg-red-500' : 'bg-gray-300'}`}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5 ${horario.disponible ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </span>
          <span className={`text-sm font-semibold ${horario.disponible ? 'text-gray-800' : 'text-gray-400'}`}>
            {horario.dia}
          </span>
        </button>
        {!horario.disponible && (
          <span className="text-xs text-gray-400 italic">Cerrado</span>
        )}
      </div>

      {/* Shift inputs — only visible when disponible */}
      {horario.disponible && (
        <div className="pl-11 space-y-2">
          {/* Shift 1 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 w-14 shrink-0">1° turno</span>
            <TimeInput
              value={horario.apertura_1}
              onChange={(v) => update({ apertura_1: v })}
              placeholder="09:00"
            />
            <span className="text-gray-300 text-sm">→</span>
            <TimeInput
              value={horario.cierre_1}
              onChange={(v) => update({ cierre_1: v })}
              placeholder="15:00"
            />
            {!has2ndShift && (
              <button
                onClick={toggle2ndShift}
                type="button"
                className="ml-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
              >
                + 2° turno
              </button>
            )}
          </div>

          {/* Shift 2 */}
          {has2ndShift && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 w-14 shrink-0">2° turno</span>
              <TimeInput
                value={horario.apertura_2}
                onChange={(v) => update({ apertura_2: v })}
                placeholder="18:00"
              />
              <span className="text-gray-300 text-sm">→</span>
              <TimeInput
                value={horario.cierre_2}
                onChange={(v) => update({ cierre_2: v })}
                placeholder="23:00"
              />
              <button
                onClick={() => update({ apertura_2: '', cierre_2: '' })}
                type="button"
                className="ml-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                title="Quitar 2° turno"
              >
                × quitar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Zone card ────────────────────────────────────────────────────────────────

function NumberInput({
  label, value, onChange, min, placeholder, step,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  min?: number
  placeholder?: string
  step?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="number"
        min={min ?? 0}
        step={step ?? '1'}
        value={value ?? ''}
        placeholder={placeholder ?? '0'}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? null : Number(v))
        }}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent bg-white"
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const authFetch = useAuthFetch()

  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // ── Sección: Básico
  const [nombre,        setNombre]        = useState('')
  const [telefono,      setTelefono]      = useState('')
  const [direccion,     setDireccion]     = useState('')
  const [msgBienvenida, setMsgBienvenida] = useState('')
  const [msgCerrado,    setMsgCerrado]    = useState('')
  const [basicoState,   setBasicoState]   = useState<SaveState>('idle')

  // ── Sección: Métodos de pago
  const [paymentMethods, setPaymentMethods] = useState<string[]>([])
  const [pagoState,      setPagoState]      = useState<SaveState>('idle')

  // ── Sección: Datos bancarios
  const [banco,      setBanco]      = useState('')
  const [titular,    setTitular]    = useState('')
  const [cuenta,     setCuenta]     = useState('')
  const [alias,      setAlias]      = useState('')
  const [bancosState, setBancosState] = useState<SaveState>('idle')

  // ── Sección: Horarios
  const [horarios,      setHorarios]      = useState<HorarioLocal[]>([])
  const [horariosState, setHorariosState] = useState<SaveState>('idle')

  // ── Sección: Delivery zones
  const [zones,         setZones]         = useState<DeliveryZone[]>([])
  const [zoneSaving,    setZoneSaving]    = useState<Record<number, SaveState>>({})
  const [zoneAdding,    setZoneAdding]    = useState(false)
  const [zoneDeleting,  setZoneDeleting]  = useState<Record<number, boolean>>({})

  // ── Load settings + horarios in parallel
  const fetchAll = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const [settingsRes, statusRes, zonesRes] = await Promise.all([
        authFetch(`${base}/dashboard/${slug}/settings`),
        authFetch(`${base}/dashboard/${slug}/restaurant/status`),
        authFetch(`${base}/dashboard/${slug}/delivery-zones`),
      ])
      if (!settingsRes.ok) throw new Error(`settings HTTP ${settingsRes.status}`)
      if (!statusRes.ok)   throw new Error(`status HTTP ${statusRes.status}`)

      const settings: Settings = await settingsRes.json()
      const status: { horarios_semana: Array<{
        id: number; dia: string; disponible: boolean;
        apertura_1: string | null; cierre_1: string | null;
        apertura_2: string | null; cierre_2: string | null;
      }> } = await statusRes.json()

      // Populate básico
      setNombre(settings.nombre ?? '')
      setTelefono(settings.telefono ?? '')
      setDireccion(settings.direccion ?? '')
      setMsgBienvenida(settings.mensaje_bienvenida ?? '')
      setMsgCerrado(settings.mensaje_cerrado ?? '')

      // Populate pago
      setPaymentMethods(settings.payment_methods ?? [])

      // Populate bancarios
      setBanco(settings.datos_bancarios?.banco   ?? '')
      setTitular(settings.datos_bancarios?.titular ?? '')
      setCuenta(settings.datos_bancarios?.cuenta  ?? '')
      setAlias(settings.datos_bancarios?.alias    ?? '')

      // Populate horarios — ensure all 7 days ordered correctly
      const sorted = [...(status.horarios_semana ?? [])].sort(
        (a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia)
      )
      if (zonesRes.ok) {
        const zd: { zones: DeliveryZone[] } = await zonesRes.json()
        setZones(zd.zones)
      }

      setHorarios(sorted.map((h) => ({
        id:         h.id,
        dia:        h.dia,
        disponible: h.disponible,
        apertura_1: h.apertura_1?.slice(0, 5) ?? '',
        cierre_1:   h.cierre_1?.slice(0, 5)   ?? '',
        apertura_2: h.apertura_2?.slice(0, 5) ?? '',
        cierre_2:   h.cierre_2?.slice(0, 5)   ?? '',
      })))

    } catch {
      setFetchError('No se pudo cargar la configuración.')
    } finally {
      setLoading(false)
    }
  }, [slug, authFetch])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Generic PATCH helper
  async function patch(body: Record<string, unknown>, setState: (s: SaveState) => void) {
    setState('saving')
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const res = await authFetch(`${base}/dashboard/${slug}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setState('saved')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  function saveBasico() {
    patch({
      nombre:             nombre.trim(),
      telefono:           telefono.trim(),
      direccion:          direccion.trim(),
      mensaje_bienvenida: msgBienvenida.trim(),
      mensaje_cerrado:    msgCerrado.trim(),
    }, setBasicoState)
  }

  function savePago() {
    if (paymentMethods.length === 0) return
    patch({ payment_methods: paymentMethods }, setPagoState)
  }

  function saveBancarios() {
    const db: DatosBancarios = {}
    if (banco.trim())   db.banco   = banco.trim()
    if (titular.trim()) db.titular = titular.trim()
    if (cuenta.trim())  db.cuenta  = cuenta.trim()
    if (alias.trim())   db.alias   = alias.trim()
    patch({ datos_bancarios: Object.keys(db).length > 0 ? db : null }, setBancosState)
  }

  async function saveZone(zone: DeliveryZone) {
    const id = zone.delivery_zone_id
    setZoneSaving((prev) => ({ ...prev, [id]: 'saving' }))
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const res = await authFetch(`${base}/dashboard/${slug}/delivery-zones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:                  zone.zone_name,
          postal_code:           zone.postal_code,
          delivery_fee:          zone.fee,
          min_order_amount:      zone.min_order_amount,
          estimated_minutes_min: zone.estimated_minutes_min,
          estimated_minutes_max: zone.estimated_minutes_max,
          is_active:             zone.is_active,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const updated: DeliveryZone = await res.json()
      setZones((prev) => prev.map((z) => z.delivery_zone_id === id ? updated : z))
      setZoneSaving((prev) => ({ ...prev, [id]: 'saved' }))
      setTimeout(() => setZoneSaving((prev) => ({ ...prev, [id]: 'idle' })), 2000)
    } catch {
      setZoneSaving((prev) => ({ ...prev, [id]: 'error' }))
      setTimeout(() => setZoneSaving((prev) => ({ ...prev, [id]: 'idle' })), 3000)
    }
  }

  function updateZone(id: number, fields: Partial<DeliveryZone>) {
    setZones((prev) => prev.map((z) => z.delivery_zone_id === id ? { ...z, ...fields } : z))
  }

  async function addZone() {
    setZoneAdding(true)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const res = await authFetch(`${base}/dashboard/${slug}/delivery-zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:                  'Nueva zona',
          postal_code:           String(Date.now()).slice(-8),
          delivery_fee:          0,
          min_order_amount:      0,
          estimated_minutes_min: null,
          estimated_minutes_max: null,
          is_active:             false,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const newZone: DeliveryZone = await res.json()
      setZones((prev) => [...prev, newZone])
    } catch {
      alert('Error al crear la zona. Revisa que todos los campos estén completos.')
    } finally {
      setZoneAdding(false)
    }
  }

  async function deleteZone(id: number, zoneName: string) {
    if (!confirm(`¿Eliminar la zona "${zoneName}"? Esta acción no se puede deshacer.`)) return
    setZoneDeleting((prev) => ({ ...prev, [id]: true }))
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      await authFetch(`${base}/dashboard/${slug}/delivery-zones/${id}`, { method: 'DELETE' })
      setZones((prev) => prev.filter((z) => z.delivery_zone_id !== id))
    } catch {
      alert('Error al eliminar la zona.')
    } finally {
      setZoneDeleting((prev) => ({ ...prev, [id]: false }))
    }
  }

  async function saveHorarios() {
    // Validate: available days need shift 1 times
    for (const h of horarios) {
      if (h.disponible && (!h.apertura_1 || !h.cierre_1)) {
        alert(`${h.dia}: faltan los horarios del 1° turno.`)
        return
      }
    }

    setHorariosState('saving')
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const res = await authFetch(`${base}/dashboard/${slug}/horarios`, {
        method: 'PATCH',
        body: JSON.stringify({
          horarios: horarios.map((h) => ({
            id:         h.id,
            disponible: h.disponible,
            apertura_1: h.apertura_1 || null,
            cierre_1:   h.cierre_1   || null,
            apertura_2: h.apertura_2 || null,
            cierre_2:   h.cierre_2   || null,
          })),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setHorariosState('saved')
      setTimeout(() => setHorariosState('idle'), 2000)
    } catch {
      setHorariosState('error')
      setTimeout(() => setHorariosState('idle'), 3000)
    }
  }

  function togglePayment(key: string) {
    setPaymentMethods((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
    setPagoState('idle')
  }

  function updateHorario(updated: HorarioLocal) {
    setHorarios((prev) => prev.map((h) => h.id === updated.id ? updated : h))
    setHorariosState('idle')
  }

  // ── Render
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.push(`/dashboard/${slug}`)}
            className="text-gray-400 hover:text-gray-700 transition-colors text-lg"
            aria-label="Volver"
          >
            ←
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Configuración</h1>
            <p className="text-xs text-gray-400 capitalize">{slug}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-red-500 animate-spin" />
          </div>
        ) : fetchError ? (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-5 text-center">
            <p className="text-sm text-red-700">{fetchError}</p>
            <button onClick={fetchAll} className="mt-3 text-xs text-red-600 underline">
              Reintentar
            </button>
          </div>
        ) : (
          <>
            {/* ── Datos básicos ───────────────────────────────────────── */}
            <SectionTitle>Datos del local</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5 space-y-4">
              <Field label="Nombre del local" value={nombre}
                onChange={(v) => { setNombre(v); setBasicoState('idle') }}
                placeholder="La Isla Pizzería" maxLength={150} />
              <Field label="Teléfono / WhatsApp" value={telefono}
                onChange={(v) => { setTelefono(v); setBasicoState('idle') }}
                placeholder="+56912345678" maxLength={30} />
              <Field label="Dirección" value={direccion}
                onChange={(v) => { setDireccion(v); setBasicoState('idle') }}
                placeholder="Calle Ejemplo 123, Ciudad" maxLength={300} />
              <Field label="Mensaje de bienvenida (WhatsApp)" value={msgBienvenida}
                onChange={(v) => { setMsgBienvenida(v); setBasicoState('idle') }}
                placeholder="Bienvenido 👋 ¿En qué te puedo ayudar?" multiline maxLength={500} />
              <Field label="Mensaje de local cerrado (WhatsApp)" value={msgCerrado}
                onChange={(v) => { setMsgCerrado(v); setBasicoState('idle') }}
                placeholder="Gracias por contactarnos. Estamos cerrados." multiline maxLength={500} />
              <div className="flex justify-end pt-1">
                <SaveButton state={basicoState} onClick={saveBasico} />
              </div>
            </div>

            {/* ── Horarios de atención ────────────────────────────────── */}
            <SectionTitle>Horarios de atención</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {horarios.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No hay horarios configurados.
                </p>
              ) : (
                horarios.map((h) => (
                  <HorarioRow key={h.id} horario={h} onChange={updateHorario} />
                ))
              )}
              <div className="flex justify-end px-4 py-3 border-t border-gray-100">
                <SaveButton
                  state={horariosState}
                  onClick={saveHorarios}
                  disabled={horarios.length === 0}
                />
              </div>
            </div>

            {/* ── Zonas de delivery ───────────────────────────────────── */}
            <div className="flex items-center justify-between mt-6 mb-3 px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Zonas de delivery</h2>
              <button
                onClick={addZone}
                disabled={zoneAdding}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white disabled:opacity-60"
                style={{ backgroundColor: '#F3274C' }}
              >
                {zoneAdding ? '…' : '+ Nueva zona'}
              </button>
            </div>
            {zones.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5">
                <p className="text-sm text-gray-400 text-center">No hay zonas configuradas.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {zones.map((zone) => {
                  const state = zoneSaving[zone.delivery_zone_id] ?? 'idle'
                  return (
                    <div key={zone.delivery_zone_id}
                      className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
                      {/* Header: name + active toggle */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex-1 mr-3">
                          <input
                            type="text"
                            value={zone.zone_name}
                            onChange={(e) => updateZone(zone.delivery_zone_id, { zone_name: e.target.value })}
                            className="text-sm font-bold text-gray-900 border-b border-dashed border-gray-200 focus:border-red-400 focus:outline-none bg-transparent w-full pb-0.5"
                          />
                          <p className="text-xs text-gray-400 mt-0.5">
                            Código postal:&nbsp;
                            <input
                              type="text"
                              value={zone.postal_code}
                              onChange={(e) => updateZone(zone.delivery_zone_id, { postal_code: e.target.value })}
                              className="border-b border-dashed border-gray-200 focus:border-red-400 focus:outline-none bg-transparent text-gray-500 w-20"
                            />
                          </p>
                        </div>
                        {/* Active toggle */}
                        <button
                          onClick={() => updateZone(zone.delivery_zone_id, { is_active: !zone.is_active })}
                          className="flex items-center gap-1.5 shrink-0"
                          type="button"
                        >
                          <span className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${zone.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${zone.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </span>
                          <span className={`text-xs font-medium ${zone.is_active ? 'text-green-700' : 'text-gray-400'}`}>
                            {zone.is_active ? 'Activa' : 'Inactiva'}
                          </span>
                        </button>
                      </div>

                      {/* Fields grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <NumberInput
                          label="Costo de envío"
                          value={zone.fee}
                          onChange={(v) => updateZone(zone.delivery_zone_id, { fee: v ?? 0 })}
                          min={0}
                          step="0.01"
                          placeholder="2500"
                        />
                        <NumberInput
                          label="Monto mínimo"
                          value={zone.min_order_amount}
                          onChange={(v) => updateZone(zone.delivery_zone_id, { min_order_amount: v })}
                          min={0}
                          step="0.01"
                          placeholder="Sin mínimo"
                        />
                        <NumberInput
                          label="Tiempo mín. (min)"
                          value={zone.estimated_minutes_min}
                          onChange={(v) => updateZone(zone.delivery_zone_id, { estimated_minutes_min: v })}
                          min={0}
                          placeholder="30"
                        />
                        <NumberInput
                          label="Tiempo máx. (min)"
                          value={zone.estimated_minutes_max}
                          onChange={(v) => updateZone(zone.delivery_zone_id, { estimated_minutes_max: v })}
                          min={0}
                          placeholder="45"
                        />
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <button
                          onClick={() => deleteZone(zone.delivery_zone_id, zone.zone_name)}
                          disabled={zoneDeleting[zone.delivery_zone_id]}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          type="button"
                        >
                          {zoneDeleting[zone.delivery_zone_id] ? 'Eliminando…' : '🗑 Eliminar zona'}
                        </button>
                        <SaveButton
                          state={state}
                          onClick={() => saveZone(zone)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Métodos de pago ─────────────────────────────────────── */}
            <SectionTitle>Métodos de pago</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
              <p className="text-xs text-gray-400 mb-4">
                Los métodos activos se mostrarán al cliente en el checkout.
              </p>
              <div className="space-y-2">
                {ALL_PAYMENT_METHODS.map(({ key, label, icon }) => {
                  const active = paymentMethods.includes(key)
                  return (
                    <button key={key} onClick={() => togglePayment(key)}
                      className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors text-left ${
                        active ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-xl">{icon}</span>
                      <span className="flex-1 text-sm font-medium text-gray-900">{label}</span>
                      {active && (
                        <span className="text-red-500 text-sm font-semibold">✓</span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-end pt-3 border-t border-gray-100 mt-3">
                <SaveButton
                  state={pagoState}
                  onClick={savePago}
                  disabled={paymentMethods.length === 0}
                />
              </div>
            </div>

            {/* ── Datos bancarios ─────────────────────────────────────── */}
            <SectionTitle>Datos bancarios (Transferencia)</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5 space-y-4">
              <p className="text-xs text-gray-400">
                Se muestran al cliente cuando elige pago por transferencia.
              </p>
              <Field label="Banco" value={banco}
                onChange={(v) => { setBanco(v); setBancosState('idle') }}
                placeholder="CaixaBank" maxLength={100} />
              <Field label="Titular" value={titular}
                onChange={(v) => { setTitular(v); setBancosState('idle') }}
                placeholder="La Isla Pizzería S.L." maxLength={200} />
              <Field label="Cuenta / IBAN" value={cuenta}
                onChange={(v) => { setCuenta(v); setBancosState('idle') }}
                placeholder="ES12 3456 7890 1234 5678 9012" maxLength={50} />
              <Field label="Alias (Bizum, etc.)" value={alias}
                onChange={(v) => { setAlias(v); setBancosState('idle') }}
                placeholder="620123456" maxLength={50} />
              <div className="flex justify-end pt-1">
                <SaveButton state={bancosState} onClick={saveBancarios} />
              </div>
            </div>

          </>
        )}
      </main>
    </div>
  )
}
