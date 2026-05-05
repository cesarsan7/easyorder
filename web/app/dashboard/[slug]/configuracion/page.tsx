'use client'

import { useEffect, useState, useCallback, createContext, useContext } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'
import { useBranding } from '@/lib/context/branding'

// Accent context — propagates theme to sub-components
const AccentCtx = createContext('#6366F1')
const useAccent = () => useContext(AccentCtx)
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { THEME_LIST, type ThemeId } from '@/lib/themes'
import type { ZoneMapZone } from './ZoneMap'

const ZoneMap = dynamic(() => import('./ZoneMap'), { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────

interface DatosBancarios {
  banco?:   string
  titular?: string
  cuenta?:  string
  alias?:   string
}

interface RedSocial { red: string; url: string }

interface Settings {
  nombre:             string
  telefono:           string | null
  direccion:          string | null
  mensaje_bienvenida: string | null
  mensaje_cerrado:    string | null
  datos_bancarios:    DatosBancarios | null
  moneda:             string
  payment_methods:    string[] | null
  // branding
  brand_color:        string | null
  logo_url:           string | null
  eslogan:            string | null
  texto_banner:       string | null
  redes_sociales:     RedSocial[] | null
  theme_id:           string | null
  // geo
  lat:                number | null
  lng:                number | null
  radio_cobertura_km: number | null
}

interface DeliveryZone {
  delivery_zone_id:      number
  zone_name:             string
  postal_code:           string | null
  fee:                   number
  is_active:             boolean
  description:           string | null
  min_order_amount:      number | null
  estimated_minutes_min: number | null
  lat_center:            number | null
  lng_center:            number | null
  radius_km:             number | null
  estimated_minutes_max: number | null
}

interface HorarioLocal {
  id:         number
  dia:        string
  disponible: boolean
  apertura_1: string
  cierre_1:   string
  apertura_2: string
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

const REDES_OPTS: { key: string; label: string; placeholder: string }[] = [
  { key: 'instagram',  label: 'Instagram',  placeholder: 'https://instagram.com/tu_local' },
  { key: 'tiktok',     label: 'TikTok',     placeholder: 'https://tiktok.com/@tu_local' },
  { key: 'facebook',   label: 'Facebook',   placeholder: 'https://facebook.com/tu_local' },
  { key: 'twitter',    label: 'Twitter / X',placeholder: 'https://x.com/tu_local' },
  { key: 'youtube',    label: 'YouTube',    placeholder: 'https://youtube.com/@tu_local' },
  { key: 'whatsapp',   label: 'WhatsApp',   placeholder: 'https://wa.me/56912345678' },
  { key: 'telegram',   label: 'Telegram',   placeholder: 'https://t.me/tu_local' },
  { key: 'linkedin',   label: 'LinkedIn',   placeholder: 'https://linkedin.com/company/tu_local' },
  { key: 'pinterest',  label: 'Pinterest',  placeholder: 'https://pinterest.com/tu_local' },
  { key: 'web',        label: 'Sitio web',  placeholder: 'https://tu-local.com' },
]

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type Tab = 'branding' | 'config' | 'pago'

// ─── Shared components ────────────────────────────────────────────────────────

function SaveButton({ state, onClick, disabled }: { state: SaveState; onClick: () => void; disabled?: boolean }) {
  const accent = useAccent()
  const labels: Record<SaveState, string> = { idle: 'Guardar cambios', saving: 'Guardando…', saved: '✓ Guardado', error: 'Error al guardar' }
  const styles: Record<SaveState, string> = {
    idle:   'text-white',
    saving: 'bg-gray-300 text-gray-500 cursor-not-allowed',
    saved:  'bg-green-500 text-white',
    error:  'bg-red-100 text-red-700 border border-red-300',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled || state === 'saving' || state === 'saved'}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${styles[state]}`}
      style={state === 'idle' ? { backgroundColor: accent } : undefined}
    >
      {labels[state]}
    </button>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-6 mb-3 px-1">{children}</h2>
}

function Field({ label, value, onChange, placeholder, multiline, maxLength, hint }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; multiline?: boolean; maxLength?: number; hint?: string
}) {
  const base = 'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white transition-shadow'
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      {multiline
        ? <textarea className={`${base} resize-none`} rows={3} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} />
        : <input className={base} type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} />
      }
      {maxLength && value.length > maxLength * 0.8 && (
        <p className="text-xs text-gray-400 text-right mt-1">{value.length}/{maxLength}</p>
      )}
    </div>
  )
}

function TimeInput({ value, onChange, disabled, placeholder }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string
}) {
  return (
    <input type="time" value={value} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder}
      className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed w-[110px] tabular-nums" />
  )
}

function HorarioRow({ horario, onChange }: { horario: HorarioLocal; onChange: (u: HorarioLocal) => void }) {
  const accent = useAccent()
  const has2nd = horario.apertura_2 !== '' || horario.cierre_2 !== ''
  const up = (fields: Partial<HorarioLocal>) => onChange({ ...horario, ...fields })
  return (
    <div className={`py-3 px-4 border-b border-gray-50 last:border-0 ${!horario.disponible ? 'bg-gray-50/50' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => up({ disponible: !horario.disponible })} className="flex items-center gap-2.5" type="button">
          <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${horario.disponible ? '' : 'bg-gray-300'}`}
            style={horario.disponible ? { backgroundColor: accent } : undefined}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5 ${horario.disponible ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </span>
          <span className={`text-sm font-semibold ${horario.disponible ? 'text-gray-800' : 'text-gray-400'}`}>{horario.dia}</span>
        </button>
        {!horario.disponible && <span className="text-xs text-gray-400 italic">Cerrado</span>}
      </div>
      {horario.disponible && (
        <div className="pl-11 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 w-14 shrink-0">1° turno</span>
            <TimeInput value={horario.apertura_1} onChange={v => up({ apertura_1: v })} placeholder="09:00" />
            <span className="text-gray-300 text-sm">→</span>
            <TimeInput value={horario.cierre_1} onChange={v => up({ cierre_1: v })} placeholder="15:00" />
            {!has2nd && (
              <button onClick={() => setTimeout(() => onChange({ ...horario, apertura_2: ' ', cierre_2: ' ' }), 0)}
                type="button" className="ml-1 text-xs font-medium" style={{ color: accent }}>+ 2° turno</button>
            )}
          </div>
          {has2nd && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 w-14 shrink-0">2° turno</span>
              <TimeInput value={horario.apertura_2} onChange={v => up({ apertura_2: v })} placeholder="18:00" />
              <span className="text-gray-300 text-sm">→</span>
              <TimeInput value={horario.cierre_2} onChange={v => up({ cierre_2: v })} placeholder="23:00" />
              <button onClick={() => up({ apertura_2: '', cierre_2: '' })} type="button"
                className="ml-1 text-xs text-gray-400 hover:text-red-500">× quitar</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NumberInput({ label, value, onChange, min, placeholder, step }: {
  label: string; value: number | null; onChange: (v: number | null) => void
  min?: number; placeholder?: string; step?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input type="number" min={min ?? 0} step={step ?? '1'} value={value ?? ''} placeholder={placeholder ?? '0'}
        onChange={e => { const v = e.target.value; onChange(v === '' ? null : Number(v)) }}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white" />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const { slug } = useParams<{ slug: string }>()
  const router   = useRouter()
  const authFetch = useAuthFetch()
  const { theme: brandTheme } = useBranding()
  const accent      = brandTheme.accent
  const accentLight = brandTheme.accentLight
  const [tab, setTab] = useState<Tab>('branding')

  const [loading,    setLoading]    = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // ── Branding
  const [logoUrl,      setLogoUrl]      = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError,     setLogoError]     = useState<string | null>(null)
  const [brandColor,   setBrandColor]   = useState('#6366F1')
  const [themeId,      setThemeId]      = useState<ThemeId>('indigo')
  const [eslogan,      setEslogan]      = useState('')
  const [textoBanner,  setTextoBanner]  = useState('')
  const [redes,        setRedes]        = useState<RedSocial[]>([])
  const [brandingState,setBrandingState]= useState<SaveState>('idle')

  // ── Básico
  const [nombre,        setNombre]        = useState('')
  const [telefono,      setTelefono]      = useState('')
  const [direccion,     setDireccion]     = useState('')
  const [msgBienvenida, setMsgBienvenida] = useState('')
  const [msgCerrado,    setMsgCerrado]    = useState('')
  const [basicoState,   setBasicoState]   = useState<SaveState>('idle')

  // ── Pago
  const [paymentMethods, setPaymentMethods] = useState<string[]>([])
  const [pagoState,      setPagoState]      = useState<SaveState>('idle')
  const [banco,          setBanco]          = useState('')
  const [titular,        setTitular]        = useState('')
  const [cuenta,         setCuenta]         = useState('')
  const [alias,          setAlias]          = useState('')
  const [bancosState,    setBancosState]    = useState<SaveState>('idle')

  // ── Horarios / Zonas
  const [horarios,         setHorarios]         = useState<HorarioLocal[]>([])
  const [horariosState,    setHorariosState]    = useState<SaveState>('idle')
  const [zones,            setZones]            = useState<DeliveryZone[]>([])
  const [zoneSaving,       setZoneSaving]       = useState<Record<number, SaveState>>({})
  const [zoneAdding,       setZoneAdding]       = useState(false)
  const [zoneDeleting,     setZoneDeleting]     = useState<Record<number, boolean>>({})
  const [zonasExpanded,    setZonasExpanded]    = useState(true)

  // ── GIS — restaurant location + coverage radius
  const [restLat,    setRestLat]    = useState<number | null>(null)
  const [restLng,    setRestLng]    = useState<number | null>(null)
  const [restRadius, setRestRadius] = useState<number>(5)
  const [geoState,   setGeoState]   = useState<SaveState>('idle')
  const [horariosExpanded, setHorariosExpanded] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true); setFetchError(null)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      const [settingsRes, statusRes, zonesRes] = await Promise.all([
        authFetch(`${base}/dashboard/${slug}/settings`),
        authFetch(`${base}/dashboard/${slug}/restaurant/status`),
        authFetch(`${base}/dashboard/${slug}/delivery-zones`),
      ])
      if (!settingsRes.ok) throw new Error(`settings HTTP ${settingsRes.status}`)
      if (!statusRes.ok)   throw new Error(`status HTTP ${statusRes.status}`)

      const s: Settings = await settingsRes.json()
      const st: { horarios_semana: Array<{ id: number; dia: string; disponible: boolean; apertura_1: string | null; cierre_1: string | null; apertura_2: string | null; cierre_2: string | null }> } = await statusRes.json()

      setNombre(s.nombre ?? '');        setTelefono(s.telefono ?? '')
      setDireccion(s.direccion ?? '');  setMsgBienvenida(s.mensaje_bienvenida ?? '')
      setMsgCerrado(s.mensaje_cerrado ?? '')
      setPaymentMethods(s.payment_methods ?? [])
      setBanco(s.datos_bancarios?.banco   ?? '');  setTitular(s.datos_bancarios?.titular ?? '')
      setCuenta(s.datos_bancarios?.cuenta ?? '');  setAlias(s.datos_bancarios?.alias    ?? '')
      // branding
      setLogoUrl(s.logo_url ?? '')
      setRestLat(s.lat ?? null)
      setRestLng(s.lng ?? null)
      setRestRadius(s.radio_cobertura_km ?? 5)
      setBrandColor(s.brand_color ?? '#6366F1')
      setThemeId((s.theme_id as ThemeId) ?? 'indigo')
      setEslogan(s.eslogan ?? '')
      setTextoBanner(s.texto_banner ?? '')
      setRedes(s.redes_sociales ?? [])

      const sorted = [...(st.horarios_semana ?? [])].sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia))
      setHorarios(sorted.map(h => ({
        id: h.id, dia: h.dia, disponible: h.disponible,
        apertura_1: h.apertura_1?.slice(0, 5) ?? '', cierre_1: h.cierre_1?.slice(0, 5) ?? '',
        apertura_2: h.apertura_2?.slice(0, 5) ?? '', cierre_2: h.cierre_2?.slice(0, 5) ?? '',
      })))
      if (zonesRes.ok) { const zd: { zones: DeliveryZone[] } = await zonesRes.json(); setZones(zd.zones) }
    } catch { setFetchError('No se pudo cargar la configuración.') }
    finally { setLoading(false) }
  }, [slug, authFetch])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function patch(body: Record<string, unknown>, setState: (s: SaveState) => void) {
    setState('saving')
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/settings`, {
        method: 'PATCH', body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setState('saved'); setTimeout(() => setState('idle'), 2000)
    } catch { setState('error'); setTimeout(() => setState('idle'), 3000) }
  }

  function saveBranding() {
    const cleanRedes = redes.filter(r => r.url.trim() !== '')
    patch({
      logo_url:      logoUrl.trim() || null,
      brand_color:   brandColor,
      theme_id:      themeId,
      eslogan:       eslogan.trim(),
      texto_banner:  textoBanner.trim(),
      redes_sociales: cleanRedes.length > 0 ? cleanRedes : null,
    }, setBrandingState)
  }

  function saveBasico() {
    patch({ nombre: nombre.trim(), telefono: telefono.trim(), direccion: direccion.trim(),
            mensaje_bienvenida: msgBienvenida.trim(), mensaje_cerrado: msgCerrado.trim() }, setBasicoState)
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

  function saveGeo() {
    patch({ lat: restLat, lng: restLng, radio_cobertura_km: restRadius }, setGeoState)
  }

  async function saveZone(zone: DeliveryZone) {
    const id = zone.delivery_zone_id
    setZoneSaving(p => ({ ...p, [id]: 'saving' }))
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/delivery-zones/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: zone.zone_name, postal_code: zone.postal_code, delivery_fee: zone.fee,
          min_order_amount: zone.min_order_amount, estimated_minutes_min: zone.estimated_minutes_min,
          estimated_minutes_max: zone.estimated_minutes_max, is_active: zone.is_active,
          lat_center: zone.lat_center, lng_center: zone.lng_center, radius_km: zone.radius_km }),
      })
      if (!res.ok) throw new Error()
      const updated: DeliveryZone = await res.json()
      setZones(p => p.map(z => z.delivery_zone_id === id ? updated : z))
      setZoneSaving(p => ({ ...p, [id]: 'saved' })); setTimeout(() => setZoneSaving(p => ({ ...p, [id]: 'idle' })), 2000)
    } catch { setZoneSaving(p => ({ ...p, [id]: 'error' })); setTimeout(() => setZoneSaving(p => ({ ...p, [id]: 'idle' })), 3000) }
  }

  async function addZone() {
    setZoneAdding(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/delivery-zones`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nueva zona', postal_code: String(Date.now()).slice(-8),
          delivery_fee: 0, min_order_amount: 0, estimated_minutes_min: null, estimated_minutes_max: null, is_active: false }),
      })
      if (!res.ok) throw new Error()
      const z: DeliveryZone = await res.json(); setZones(p => [...p, z])
    } catch { alert('Error al crear la zona.') }
    finally { setZoneAdding(false) }
  }

  async function deleteZone(id: number, name: string) {
    if (!confirm(`¿Eliminar la zona "${name}"?`)) return
    setZoneDeleting(p => ({ ...p, [id]: true }))
    try {
      await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/delivery-zones/${id}`, { method: 'DELETE' })
      setZones(p => p.filter(z => z.delivery_zone_id !== id))
    } catch { alert('Error al eliminar la zona.') }
    finally { setZoneDeleting(p => ({ ...p, [id]: false })) }
  }

  async function saveHorarios() {
    for (const h of horarios) {
      if (h.disponible && (!h.apertura_1 || !h.cierre_1)) { alert(`${h.dia}: falta 1° turno.`); return }
    }
    setHorariosState('saving')
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/horarios`, {
        method: 'PATCH', body: JSON.stringify({ horarios: horarios.map(h => ({
          id: h.id, disponible: h.disponible,
          apertura_1: h.apertura_1 || null, cierre_1: h.cierre_1 || null,
          apertura_2: h.apertura_2 || null, cierre_2: h.cierre_2 || null,
        })) }),
      })
      if (!res.ok) throw new Error()
      setHorariosState('saved'); setTimeout(() => setHorariosState('idle'), 2000)
    } catch { setHorariosState('error'); setTimeout(() => setHorariosState('idle'), 3000) }
  }

  function setRed(red: string, url: string) {
    setRedes(prev => {
      const exists = prev.find(r => r.red === red)
      if (exists) return prev.map(r => r.red === red ? { ...r, url } : r)
      return [...prev, { red, url }]
    })
    setBrandingState('idle')
  }

  function getRedUrl(red: string) {
    return redes.find(r => r.red === red)?.url ?? ''
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'branding', label: '🎨 Branding' },
    { key: 'config',   label: '⚙️ Configuración' },
    { key: 'pago',     label: '💳 Pago' },
  ]

  return (
    <AccentCtx.Provider value={accent}>
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push(`/dashboard/${slug}`)} className="text-gray-400 hover:text-gray-700 transition-colors text-lg">←</button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Configuración</h1>
            <p className="text-xs text-gray-400 capitalize">{slug}</p>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-2xl mx-auto px-4 flex gap-1 pb-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key ? 'border-transparent' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-gray-200 animate-spin" style={{ borderTopColor: accent }} />
          </div>
        ) : fetchError ? (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-5 text-center">
            <p className="text-sm text-red-700">{fetchError}</p>
            <button onClick={fetchAll} className="mt-3 text-xs text-red-600 underline">Reintentar</button>
          </div>
        ) : tab === 'branding' ? (
          <>
            {/* ── Logo ──────────────────────────────────────────────────── */}
            <SectionTitle>Logo del local</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5 space-y-4">
              <div className="flex items-center gap-4">
                {/* Preview */}
                {logoUrl ? (
                  <div className="relative shrink-0 group">
                    <img src={logoUrl} alt="Logo" className="h-16 w-16 rounded-2xl object-cover border border-gray-200" />
                    <button
                      onClick={() => { setLogoUrl(''); setLogoError(null); setBrandingState('idle') }}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-gray-700 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Quitar logo"
                    >×</button>
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded-2xl flex items-center justify-center shrink-0 text-white text-2xl font-bold" style={{ backgroundColor: brandColor }}>
                    {nombre.charAt(0).toUpperCase() || 'E'}
                  </div>
                )}

                {/* Upload area */}
                <div className="flex-1 min-w-0 space-y-2">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Subir imagen</span>
                    <div className="mt-1 flex items-center gap-2">
                      <label
                        className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 hover:border-gray-400 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                        style={logoUploading ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
                      >
                        {logoUploading ? (
                          <>
                            <div className="h-3 w-3 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                            Subiendo…
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                            Seleccionar archivo
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          className="sr-only"
                          disabled={logoUploading}
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            if (file.size > 2 * 1024 * 1024) {
                              setLogoError('El archivo no puede superar 2 MB.')
                              return
                            }
                            setLogoUploading(true)
                            setLogoError(null)
                            try {
                              const ext = file.name.split('.').pop() ?? 'png'
                              const filePath = `${slug}/logo.${ext}`
                              const supabase = createClient()
                              const { error: upErr } = await supabase.storage
                                .from('la_isla')
                                .upload(filePath, file, { upsert: true, contentType: file.type })
                              if (upErr) throw new Error(upErr.message)
                              const { data: { publicUrl } } = supabase.storage
                                .from('la_isla')
                                .getPublicUrl(filePath)
                              // Add cache-bust so the browser reloads the image
                              const bustUrl = publicUrl + '?t=' + Date.now()
                              setLogoUrl(bustUrl)
                              setBrandingState('idle')
                            } catch (err) {
                              setLogoError((err as Error).message ?? 'Error al subir la imagen.')
                            } finally {
                              setLogoUploading(false)
                              // Reset input so same file can be re-uploaded
                              e.target.value = ''
                            }
                          }}
                        />
                      </label>
                      <span className="text-xs text-gray-400">PNG, JPG, WEBP, SVG · máx 2 MB</span>
                    </div>
                  </label>

                  {/* Fallback: paste URL */}
                  <Field label="O pega una URL" value={logoUrl}
                    onChange={v => { setLogoUrl(v); setLogoError(null); setBrandingState('idle') }}
                    placeholder="https://..." hint="" />

                  {logoError && (
                    <p className="text-xs text-red-600">{logoError}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Identidad ─────────────────────────────────────────────── */}
            <SectionTitle>Identidad</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5 space-y-4">
              <Field label="Nombre del local" value={nombre}
                onChange={v => { setNombre(v); setBrandingState('idle') }} placeholder="La Isla Pizzería" maxLength={150} />
              <Field label="Eslogan" value={eslogan}
                onChange={v => { setEslogan(v); setBrandingState('idle') }}
                placeholder="La mejor pizza de la ciudad" maxLength={200}
                hint="Tagline corto que aparece bajo el nombre en el menú público." />
              <Field label="Banner promocional" value={textoBanner}
                onChange={v => { setTextoBanner(v); setBrandingState('idle') }}
                placeholder="🍕 2x1 en pizzas los Martes · Delivery gratis sobre €25" maxLength={500}
                multiline hint="Se muestra como franja destacada en el menú público. Déjalo vacío para ocultarlo." />
            </div>

            {/* ── Paleta de colores ─────────────────────────────────────── */}
            <SectionTitle>Paleta de colores</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5">
              <p className="text-xs text-gray-400 mb-4">Elige el color de acento de tu menú público y dashboard.</p>
              <div className="grid grid-cols-3 gap-3">
                {THEME_LIST.map(theme => (
                  <button key={theme.id} onClick={() => { setThemeId(theme.id); setBrandColor(theme.accent); setBrandingState('idle') }}
                    className={`rounded-2xl border-2 p-3 text-left transition-all ${themeId === theme.id ? 'shadow-sm' : 'border-gray-100 hover:border-gray-300'}`}
                    style={themeId === theme.id ? { borderColor: accent } : undefined}>
                    <div className="flex gap-1.5 mb-2">
                      {theme.swatches.map((sw, i) => (
                        <span key={i} className="h-5 w-5 rounded-full border border-white shadow-sm" style={{ backgroundColor: sw }} />
                      ))}
                    </div>
                    <p className="text-xs font-semibold text-gray-800">{theme.name}</p>
                    <p className="text-xs text-gray-400 leading-tight mt-0.5">{theme.description.split('.')[0]}</p>
                  </button>
                ))}
              </div>
              {/* Custom hex override */}
              <div className="mt-4 flex items-center gap-3">
                <input type="color" value={brandColor} onChange={e => { setBrandColor(e.target.value); setBrandingState('idle') }}
                  className="h-9 w-9 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white" />
                <div>
                  <p className="text-xs font-medium text-gray-700">Color personalizado</p>
                  <p className="text-xs text-gray-400">{brandColor}</p>
                </div>
              </div>
              {/* Preview */}
              <div className="mt-4 rounded-xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: brandColor + '14' }}>
                <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: brandColor }}>
                  {nombre.charAt(0).toUpperCase() || 'E'}
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: brandColor }}>{nombre || 'Nombre del local'}</p>
                  {eslogan && <p className="text-xs text-gray-500">{eslogan}</p>}
                </div>
                <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: brandColor }}>Agregar</span>
              </div>
            </div>

            {/* ── Redes sociales ────────────────────────────────────────── */}
            <SectionTitle>Redes sociales</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5 space-y-3">
              <p className="text-xs text-gray-400">Agrega las redes que quieras mostrar en el menú público.</p>
              {REDES_OPTS.map(opt => (
                <div key={opt.key} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-600 w-24 shrink-0">{opt.label}</span>
                  <input type="url" value={getRedUrl(opt.key)} onChange={e => setRed(opt.key, e.target.value)}
                    placeholder={opt.placeholder}
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white" />
                </div>
              ))}
              <p className="text-xs text-gray-400 pt-1">Deja vacíos los que no uses — no se mostrarán.</p>
            </div>

            <div className="flex justify-end mt-4">
              <SaveButton state={brandingState} onClick={saveBranding} />
            </div>
          </>

        ) : tab === 'config' ? (
          <>
            {/* ── Datos básicos ────────────────────────────────────────── */}
            <SectionTitle>Datos del local</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5 space-y-4">
              <Field label="Teléfono / WhatsApp" value={telefono}
                onChange={v => { setTelefono(v); setBasicoState('idle') }} placeholder="+56912345678" maxLength={30} />
              <Field label="Dirección" value={direccion}
                onChange={v => { setDireccion(v); setBasicoState('idle') }} placeholder="Calle Ejemplo 123, Ciudad" maxLength={300} />
              <Field label="Mensaje de bienvenida (WhatsApp)" value={msgBienvenida}
                onChange={v => { setMsgBienvenida(v); setBasicoState('idle') }}
                placeholder="Bienvenido 👋 ¿En qué te puedo ayudar?" multiline maxLength={500} />
              <Field label="Mensaje de local cerrado (WhatsApp)" value={msgCerrado}
                onChange={v => { setMsgCerrado(v); setBasicoState('idle') }}
                placeholder="Gracias por contactarnos. Estamos cerrados." multiline maxLength={500} />
              <div className="flex justify-end pt-1">
                <SaveButton state={basicoState} onClick={saveBasico} />
              </div>
            </div>

            {/* ── Horarios ─────────────────────────────────────────────── */}
            <button type="button" onClick={() => setHorariosExpanded(v => !v)}
              className="w-full flex items-center justify-between mt-6 mb-3 px-1 py-1 text-left">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {horariosExpanded ? '▼' : '▶'} Horarios de atención
              </h2>
              <span className="text-xs text-gray-400">{horariosExpanded ? 'Colapsar' : 'Expandir'}</span>
            </button>
            {horariosExpanded && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {horarios.length === 0
                  ? <p className="text-sm text-gray-400 text-center py-6">No hay horarios configurados.</p>
                  : horarios.map(h => <HorarioRow key={h.id} horario={h} onChange={u => { setHorarios(p => p.map(x => x.id === u.id ? u : x)); setHorariosState('idle') }} />)
                }
                <div className="flex justify-end px-4 py-3 border-t border-gray-100">
                  <SaveButton state={horariosState} onClick={saveHorarios} disabled={horarios.length === 0} />
                </div>
              </div>
            )}

            {/* ── Mapa de cobertura ────────────────────────────────────── */}
            <SectionTitle>Cobertura de delivery</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5 space-y-4">
              <p className="text-xs text-gray-400">
                Haz clic en el mapa para fijar la ubicación del local. El círculo representa el radio de cobertura general.
                Las zonas con coordenadas se dibujan en verde.
              </p>
              <ZoneMap
                lat={restLat}
                lng={restLng}
                radiusKm={restRadius}
                zones={zones.filter((z): z is ZoneMapZone & typeof z =>
                  z.lat_center != null && z.lng_center != null && z.radius_km != null
                )}
                accent={accent}
                onChange={(lat, lng) => { setRestLat(lat); setRestLng(lng); setGeoState('idle') }}
              />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Latitud</label>
                  <input
                    type="number" step="any"
                    value={restLat ?? ''}
                    onChange={e => { setRestLat(e.target.value ? Number(e.target.value) : null); setGeoState('idle') }}
                    placeholder="28.0997"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Longitud</label>
                  <input
                    type="number" step="any"
                    value={restLng ?? ''}
                    onChange={e => { setRestLng(e.target.value ? Number(e.target.value) : null); setGeoState('idle') }}
                    placeholder="-15.4134"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Radio (km)</label>
                  <input
                    type="number" step="0.5" min="0.5" max="500"
                    value={restRadius}
                    onChange={e => { setRestRadius(Number(e.target.value) || 5); setGeoState('idle') }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <SaveButton state={geoState} onClick={saveGeo} disabled={restLat == null || restLng == null} />
              </div>
            </div>

            {/* ── Zonas de delivery ─────────────────────────────────────── */}
            <div className="flex items-center justify-between mt-6 mb-0 px-1 py-1 border-b border-gray-100">
              <button type="button" onClick={() => setZonasExpanded(v => !v)} className="flex items-center gap-2 text-left">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  {zonasExpanded ? '▼' : '▶'} Zonas de delivery
                </h2>
              </button>
              <button onClick={addZone} disabled={zoneAdding}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white disabled:opacity-60"
                style={{ backgroundColor: accent }}>
                {zoneAdding ? '…' : '+ Nueva zona'}
              </button>
            </div>
            {zonasExpanded && zones.length === 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5 mt-3">
                <p className="text-sm text-gray-400 text-center">No hay zonas configuradas.</p>
              </div>
            )}
            {zonasExpanded && zones.map(zone => {
              const state = zoneSaving[zone.delivery_zone_id] ?? 'idle'
              return (
                <div key={zone.delivery_zone_id} className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 mt-3">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex-1 mr-3">
                      <input type="text" value={zone.zone_name} onChange={e => setZones(p => p.map(z => z.delivery_zone_id === zone.delivery_zone_id ? { ...z, zone_name: e.target.value } : z))}
                        className="text-sm font-bold text-gray-900 border-b border-dashed border-gray-200 focus:border-indigo-400 focus:outline-none bg-transparent w-full pb-0.5" />
                      <p className="text-xs text-gray-400 mt-0.5">
                        CP:&nbsp;
                        <input type="text" value={zone.postal_code ?? ''} onChange={e => setZones(p => p.map(z => z.delivery_zone_id === zone.delivery_zone_id ? { ...z, postal_code: e.target.value || null } : z))}
                          className="border-b border-dashed border-gray-200 focus:border-indigo-400 focus:outline-none bg-transparent text-gray-500 w-20" />
                      </p>
                    </div>
                    <button onClick={() => setZones(p => p.map(z => z.delivery_zone_id === zone.delivery_zone_id ? { ...z, is_active: !z.is_active } : z))}
                      className="flex items-center gap-1.5 shrink-0" type="button">
                      <span className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${zone.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${zone.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </span>
                      <span className={`text-xs font-medium ${zone.is_active ? 'text-green-700' : 'text-gray-400'}`}>{zone.is_active ? 'Activa' : 'Inactiva'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberInput label="Costo de envío" value={zone.fee} onChange={v => setZones(p => p.map(z => z.delivery_zone_id === zone.delivery_zone_id ? { ...z, fee: v ?? 0 } : z))} min={0} step="0.01" placeholder="2500" />
                    <NumberInput label="Monto mínimo" value={zone.min_order_amount} onChange={v => setZones(p => p.map(z => z.delivery_zone_id === zone.delivery_zone_id ? { ...z, min_order_amount: v } : z))} min={0} step="0.01" />
                    <NumberInput label="Tiempo mín. (min)" value={zone.estimated_minutes_min} onChange={v => setZones(p => p.map(z => z.delivery_zone_id === zone.delivery_zone_id ? { ...z, estimated_minutes_min: v } : z))} placeholder="30" />
                    <NumberInput label="Tiempo máx. (min)" value={zone.estimated_minutes_max} onChange={v => setZones(p => p.map(z => z.delivery_zone_id === zone.delivery_zone_id ? { ...z, estimated_minutes_max: v } : z))} placeholder="45" />
                  </div>
                  {/* Geo fields for this zone */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-2">Coordenadas de zona (opcional)</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">Lat centro</label>
                        <input type="number" step="any" placeholder="28.09"
                          value={zone.lat_center ?? ''}
                          onChange={e => setZones(p => p.map(z => z.delivery_zone_id === zone.delivery_zone_id
                            ? { ...z, lat_center: e.target.value ? Number(e.target.value) : null } : z))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-400" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">Lng centro</label>
                        <input type="number" step="any" placeholder="-15.41"
                          value={zone.lng_center ?? ''}
                          onChange={e => setZones(p => p.map(z => z.delivery_zone_id === zone.delivery_zone_id
                            ? { ...z, lng_center: e.target.value ? Number(e.target.value) : null } : z))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-400" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">Radio (km)</label>
                        <input type="number" step="0.5" min="0.1" placeholder="3"
                          value={zone.radius_km ?? ''}
                          onChange={e => setZones(p => p.map(z => z.delivery_zone_id === zone.delivery_zone_id
                            ? { ...z, radius_km: e.target.value ? Number(e.target.value) : null } : z))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-400" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <button onClick={() => deleteZone(zone.delivery_zone_id, zone.zone_name)} disabled={zoneDeleting[zone.delivery_zone_id]}
                      className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50" type="button">
                      {zoneDeleting[zone.delivery_zone_id] ? 'Eliminando…' : '🗑 Eliminar'}
                    </button>
                    <SaveButton state={state} onClick={() => saveZone(zone)} />
                  </div>
                </div>
              )
            })}
          </>

        ) : (
          <>
            {/* ── Métodos de pago ──────────────────────────────────────── */}
            <SectionTitle>Métodos de pago</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
              <p className="text-xs text-gray-400 mb-4">Los métodos activos se mostrarán al cliente en el checkout.</p>
              <div className="space-y-2">
                {ALL_PAYMENT_METHODS.map(({ key, label, icon }) => {
                  const active = paymentMethods.includes(key)
                  return (
                    <button key={key} onClick={() => { setPaymentMethods(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key]); setPagoState('idle') }}
                      className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors text-left ${active ? '' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                      style={active ? { borderColor: accent, backgroundColor: accentLight } : undefined}>
                      <span className="text-xl">{icon}</span>
                      <span className="flex-1 text-sm font-medium text-gray-900">{label}</span>
                      {active && <span className="text-sm font-semibold" style={{ color: accent }}>✓</span>}
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-end pt-3 border-t border-gray-100 mt-3">
                <SaveButton state={pagoState} onClick={savePago} disabled={paymentMethods.length === 0} />
              </div>
            </div>

            {/* ── Datos bancarios ───────────────────────────────────────── */}
            <SectionTitle>Datos bancarios (Transferencia)</SectionTitle>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5 space-y-4">
              <p className="text-xs text-gray-400">Se muestran al cliente cuando elige pago por transferencia.</p>
              <Field label="Banco" value={banco} onChange={v => { setBanco(v); setBancosState('idle') }} placeholder="CaixaBank" maxLength={100} />
              <Field label="Titular" value={titular} onChange={v => { setTitular(v); setBancosState('idle') }} placeholder="La Isla Pizzería S.L." maxLength={200} />
              <Field label="Cuenta / IBAN" value={cuenta} onChange={v => { setCuenta(v); setBancosState('idle') }} placeholder="ES12 3456 7890 1234 5678 9012" maxLength={50} />
              <Field label="Alias (Bizum, etc.)" value={alias} onChange={v => { setAlias(v); setBancosState('idle') }} placeholder="620123456" maxLength={50} />
              <div className="flex justify-end pt-1">
                <SaveButton state={bancosState} onClick={saveBancarios} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
    </AccentCtx.Provider>
  )
}
