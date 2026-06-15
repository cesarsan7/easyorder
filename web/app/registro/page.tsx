'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT  = '#E63946'
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''
const PUBLIC_DOMAIN = typeof window !== 'undefined' ? window.location.origin : 'https://easyorder.ai2nomous.com'

// Timezone → phone prefix (must stay in sync with api/src/routes/onboarding.ts)
const TZ_PHONE_PREFIX: Record<string, string> = {
  'Atlantic/Canary':                '+34',
  'Europe/Madrid':                  '+34',
  'America/Mexico_City':            '+52',
  'America/Bogota':                 '+57',
  'America/Lima':                   '+51',
  'America/Santiago':               '+56',
  'America/Argentina/Buenos_Aires': '+54',
  'America/Caracas':                '+58',
  'America/Guayaquil':              '+593',
  'America/Montevideo':             '+598',
  'America/Asuncion':               '+595',
  'America/La_Paz':                 '+591',
  'America/Santo_Domingo':          '+1',
  'America/Costa_Rica':             '+506',
  'America/Guatemala':              '+502',
  'America/New_York':               '+1',
  'America/Chicago':                '+1',
  'America/Denver':                 '+1',
  'America/Los_Angeles':            '+1',
}

const TIMEZONES = [
  { label: 'España — Canarias',           value: 'Atlantic/Canary' },
  { label: 'España — Península/Baleares', value: 'Europe/Madrid' },
  { label: 'México',                       value: 'America/Mexico_City' },
  { label: 'Colombia',                     value: 'America/Bogota' },
  { label: 'Perú',                         value: 'America/Lima' },
  { label: 'Chile',                        value: 'America/Santiago' },
  { label: 'Argentina',                    value: 'America/Argentina/Buenos_Aires' },
  { label: 'Venezuela',                    value: 'America/Caracas' },
  { label: 'Ecuador',                      value: 'America/Guayaquil' },
  { label: 'Uruguay',                      value: 'America/Montevideo' },
  { label: 'Paraguay',                     value: 'America/Asuncion' },
  { label: 'Bolivia',                      value: 'America/La_Paz' },
  { label: 'Rep. Dominicana',              value: 'America/Santo_Domingo' },
  { label: 'Costa Rica',                   value: 'America/Costa_Rica' },
  { label: 'Guatemala',                    value: 'America/Guatemala' },
  { label: 'EE.UU. — Este (ET)',           value: 'America/New_York' },
  { label: 'EE.UU. — Centro (CT)',         value: 'America/Chicago' },
  { label: 'EE.UU. — Montaña (MT)',        value: 'America/Denver' },
  { label: 'EE.UU. — Pacífico (PT)',       value: 'America/Los_Angeles' },
]

const MONEDAS = [
  { label: 'Euro €',             value: '€' },
  { label: 'Dólar USD $',        value: '$' },
  { label: 'Peso mexicano MXN',  value: 'MXN' },
  { label: 'Peso colombiano COP',value: 'COP' },
  { label: 'Peso chileno CLP',   value: 'CLP' },
  { label: 'Sol peruano PEN',    value: 'PEN' },
  { label: 'Peso argentino ARS', value: 'ARS' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toSlug(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // remove diacritics: á→a, é→e, ñ→n...
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9\s]/g, '')       // remove non-alphanumeric (except spaces)
    .trim()
    .replace(/\s+/g, '-')              // spaces → hyphens
    .replace(/-+/g, '-')               // collapse multiple hyphens
    .slice(0, 60)
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RegistroStep = 'account' | 'restaurant' | 'done'
type SlugStatus   = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepDots({ step }: { step: RegistroStep }) {
  const steps: RegistroStep[] = ['account', 'restaurant', 'done']
  const current = steps.indexOf(step)
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((s, i) => (
        <div
          key={s}
          className="h-2 rounded-full transition-all duration-300"
          style={{
            width: i === current ? '24px' : '8px',
            backgroundColor: i <= current ? ACCENT : '#E5E7EB',
          }}
        />
      ))}
    </div>
  )
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-gray-600 mb-1.5">
      {children}
    </label>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 ' +
        'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition ' +
        (props.className ?? '')
      }
    />
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      className={
        'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 bg-white ' +
        'focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition ' +
        (props.className ?? '')
      }
    >
      {props.children}
    </select>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
      <p className="text-sm text-red-700">{msg}</p>
    </div>
  )
}

function PrimaryBtn({
  children,
  loading,
  disabled,
  onClick,
  type = 'submit',
}: {
  children: React.ReactNode
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  type?: 'submit' | 'button'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ backgroundColor: ACCENT }}
    >
      {children}
    </button>
  )
}

// ─── Step 0: Account ─────────────────────────────────────────────────────────

function StepAccount({ onDone }: { onDone: () => void }) {
  const [mode, setMode]         = useState<'login' | 'register'>('register')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()

    if (mode === 'register') {
      const { data, error: authErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/registro` },
      })
      if (authErr) { setError(authErr.message); setLoading(false); return }
      if (data.session) { onDone(); return }
      // Email confirmation required
      setEmailSent(true)
      setLoading(false)
    } else {
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (authErr) {
        const m = authErr.message?.toLowerCase() ?? ''
        setError(
          m.includes('invalid') || m.includes('credentials')
            ? 'Email o contraseña incorrectos.'
            : authErr.message,
        )
        setLoading(false)
        return
      }
      onDone()
    }
  }

  if (emailSent) {
    return (
      <div className="text-center space-y-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl mx-auto bg-green-50">
          ✉️
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">Revisa tu correo</h3>
          <p className="text-sm text-gray-500 mt-1">
            Te enviamos un enlace a <strong>{email}</strong>.
            Ábrelo y vuelve aquí para continuar.
          </p>
        </div>
        <button
          className="text-sm font-medium underline"
          style={{ color: ACCENT }}
          onClick={() => { setEmailSent(false); setMode('login') }}
        >
          Ya confirmé, iniciar sesión
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">
          {mode === 'register' ? 'Crea tu cuenta' : 'Inicia sesión'}
        </h2>
        <p className="text-sm text-gray-500">
          {mode === 'register'
            ? 'Con tu cuenta gestionas todos tus restaurantes.'
            : 'Accede a tu cuenta para continuar.'}
        </p>
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="password">
          Contraseña
          {mode === 'register' && (
            <span className="ml-1 font-normal text-gray-400">(mín. 6 caracteres)</span>
          )}
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          required
          minLength={mode === 'register' ? 6 : undefined}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <ErrorBox msg={error} />}

      <PrimaryBtn loading={loading} disabled={!email || !password}>
        {loading
          ? (mode === 'register' ? 'Creando cuenta…' : 'Iniciando sesión…')
          : (mode === 'register' ? 'Crear cuenta y continuar' : 'Entrar')}
      </PrimaryBtn>

      <p className="text-center text-xs text-gray-500">
        {mode === 'register' ? (
          <>¿Ya tienes cuenta?{' '}
            <button type="button" className="font-medium underline" style={{ color: ACCENT }}
              onClick={() => { setMode('login'); setError(null) }}>
              Inicia sesión
            </button>
          </>
        ) : (
          <>¿No tienes cuenta?{' '}
            <button type="button" className="font-medium underline" style={{ color: ACCENT }}
              onClick={() => { setMode('register'); setError(null) }}>
              Regístrate
            </button>
          </>
        )}
      </p>
    </form>
  )
}

// ─── Step 1: Restaurant form ─────────────────────────────────────────────────

function StepRestaurant({ onDone }: { onDone: (slug: string, nombre: string) => void }) {
  const [nombre,       setNombre]       = useState('')
  const [slug,         setSlug]         = useState('')
  const [slugEdited,   setSlugEdited]   = useState(false)
  const [telefono,     setTelefono]     = useState('')
  const [moneda,       setMoneda]       = useState('€')
  const [zonaHoraria,  setZonaHoraria]  = useState('Europe/Madrid')
  const [slugStatus,   setSlugStatus]   = useState<SlugStatus>('idle')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-generate slug from nombre unless user manually edited it
  useEffect(() => {
    if (slugEdited) return
    setSlug(toSlug(nombre))
  }, [nombre, slugEdited])

  // Debounced slug availability check
  const checkSlug = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value || value.length < 2) { setSlugStatus('idle'); return }

    // Quick local format check
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(value)) {
      setSlugStatus('invalid')
      return
    }

    setSlugStatus('checking')
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/onboarding/check-slug?slug=${encodeURIComponent(value)}`)
        const data: { available?: boolean; reason?: string } = await res.json()
        setSlugStatus(data.available === true ? 'available' : 'taken')
      } catch {
        setSlugStatus('idle')
      }
    }, 350)
  }, [])

  useEffect(() => { checkSlug(slug) }, [slug, checkSlug])

  function handleSlugChange(value: string) {
    const clean = value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60)
    setSlug(clean)
    setSlugEdited(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (slugStatus === 'taken' || slugStatus === 'invalid' || slugStatus === 'checking') return
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // getUser() fuerza validación con Supabase y refresca el token si expiró.
      // Luego getSession() devuelve el token fresco garantizado.
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { setError('Sesión expirada. Por favor recarga la página e inicia sesión.'); setLoading(false); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('No se pudo obtener la sesión. Recarga la página.'); setLoading(false); return }

      const res = await fetch(`${API_URL}/onboarding/complete`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          nombre: nombre.trim(),
          slug,
          // Prepend country prefix if the user didn't type one
          telefono: telefono.trim()
            ? (telefono.trim().startsWith('+')
                ? telefono.trim()
                : `${TZ_PHONE_PREFIX[zonaHoraria] ?? '+1'}${telefono.trim()}`)
            : undefined,
          moneda,
          zona_horaria: zonaHoraria,
        }),
      })

      if (!res.ok) {
        const err: { error?: string; detail?: string } = await res.json().catch(() => ({}))
        if (err.error === 'slug_taken') {
          setError('Esa URL ya está en uso. Elige otra.')
          setSlugStatus('taken')
        } else {
          setError(err.detail ?? err.error ?? `Error ${res.status}`)
        }
        setLoading(false)
        return
      }

      const data: { slug: string; nombre: string } = await res.json()
      onDone(data.slug, data.nombre)
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  const slugHint = () => {
    if (slugStatus === 'checking') return { color: '#6B7280', text: 'Verificando…' }
    if (slugStatus === 'available') return { color: '#16A34A', text: '✓ Disponible' }
    if (slugStatus === 'taken')     return { color: '#DC2626', text: '✗ Ya está en uso' }
    if (slugStatus === 'invalid')   return { color: '#DC2626', text: '✗ Solo letras, números y guiones' }
    return null
  }
  const hint = slugHint()

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Tu restaurante</h2>
        <p className="text-sm text-gray-500">Configura la información básica de tu negocio.</p>
      </div>

      {/* Nombre */}
      <div>
        <Label htmlFor="nombre">Nombre del local</Label>
        <Input
          id="nombre"
          type="text"
          required
          placeholder="Ej: La Buena Mesa"
          maxLength={80}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </div>

      {/* Slug / URL */}
      <div>
        <Label htmlFor="slug">URL de tu menú</Label>
        <div className="flex rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-red-200 focus-within:border-red-300 transition">
          <span className="flex items-center px-3 bg-gray-50 text-xs text-gray-400 border-r border-gray-200 whitespace-nowrap select-none">
            easyorder.ai2nomous.com/
          </span>
          <input
            id="slug"
            type="text"
            required
            placeholder="mi-restaurante"
            maxLength={60}
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            className="flex-1 px-3 py-3 text-sm text-gray-900 bg-white focus:outline-none"
          />
        </div>
        {hint && (
          <p className="mt-1 text-xs" style={{ color: hint.color }}>{hint.text}</p>
        )}
      </div>

      {/* Moneda + Zona horaria — primero para que el prefijo esté definido antes del tel */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="moneda">Moneda</Label>
          <Select id="moneda" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            {MONEDAS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="zona">País / Zona horaria</Label>
          <Select id="zona" value={zonaHoraria} onChange={(e) => setZonaHoraria(e.target.value)}>
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Teléfono — el prefijo se infiere del país seleccionado */}
      <div>
        <Label htmlFor="telefono">Teléfono de contacto <span className="font-normal text-gray-400">(opcional)</span></Label>
        <div className="flex rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2" style={{ '--tw-ring-color': ACCENT } as React.CSSProperties}>
          <span className="flex items-center px-3 text-sm font-medium select-none"
            style={{ backgroundColor: '#F3F4F6', color: '#374151', borderRight: '1px solid #E5E7EB', minWidth: 52 }}>
            {TZ_PHONE_PREFIX[zonaHoraria] ?? '+1'}
          </span>
          <input
            id="telefono"
            type="tel"
            inputMode="numeric"
            placeholder="600 000 000"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="flex-1 px-3 py-2.5 text-sm outline-none bg-white"
            style={{ color: '#111827' }}
          />
        </div>
        <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>
          El código de área se establece automáticamente según el país seleccionado.
        </p>
      </div>

      {error && <ErrorBox msg={error} />}

      <PrimaryBtn
        loading={loading}
        disabled={!nombre || slugStatus === 'taken' || slugStatus === 'invalid' || slugStatus === 'checking'}
      >
        {loading ? 'Creando restaurante…' : 'Crear mi restaurante →'}
      </PrimaryBtn>

      <p className="text-xs text-center text-gray-400">
        Después podrás agregar tu menú, horarios y métodos de pago desde el dashboard.
      </p>
    </form>
  )
}

// ─── Step 2: Done ─────────────────────────────────────────────────────────────

function StepDone({ slug, nombre }: { slug: string; nombre: string }) {
  const publicUrl    = `${PUBLIC_DOMAIN}/${slug}`
  const dashboardUrl = `/dashboard/${slug}`

  return (
    <div className="text-center space-y-5">
      {/* Success icon */}
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-2xl mx-auto"
        style={{ backgroundColor: '#DCFCE7' }}
      >
        ✅
      </div>

      <div>
        <h2 className="text-lg font-bold text-gray-900">¡Listo! Tu menú ya está en línea</h2>
        <p className="text-sm text-gray-500 mt-1">
          <strong>{nombre}</strong> está configurado y listo para recibir pedidos.
        </p>
      </div>

      {/* Public URL */}
      <div className="bg-gray-50 rounded-xl px-4 py-3 text-left">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
          Tu link público de pedidos
        </p>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium break-all"
          style={{ color: ACCENT }}
        >
          {publicUrl}
        </a>
      </div>

      {/* CTA: go to dashboard */}
      <a
        href={dashboardUrl}
        className="block w-full rounded-xl py-3 text-sm font-semibold text-white text-center transition-opacity hover:opacity-90"
        style={{ backgroundColor: ACCENT }}
      >
        Ir al dashboard →
      </a>

      <div className="text-xs text-gray-400 space-y-1">
        <p>Próximos pasos desde el dashboard:</p>
        <p>· Agrega tu menú (categorías, productos, variantes)</p>
        <p>· Configura horarios y zonas de delivery</p>
        <p>· Comparte el link con tus clientes</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegistroPage() {
  const [step,         setStep]         = useState<RegistroStep>('account')
  const [resultSlug,   setResultSlug]   = useState('')
  const [resultNombre, setResultNombre] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)

  // On mount: check if user is already authenticated — skip account step.
  // getUser() valida con el servidor y maneja el canje PKCE (?code=xxx) si viene
  // de un link de confirmación de email redirigido por /auth/callback.
  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setStep('restaurant')
      setCheckingAuth(false)
    }
    check()
  }, [])

  function handleAccountDone() {
    setStep('restaurant')
  }

  function handleRestaurantDone(slug: string, nombre: string) {
    setResultSlug(slug)
    setResultNombre(nombre)
    setStep('done')
  }

  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Cargando…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center justify-center h-12 w-12 rounded-2xl text-white text-xl font-bold mb-3"
            style={{ backgroundColor: ACCENT }}
          >
            E
          </div>
          <h1 className="text-2xl font-bold text-gray-900">EasyOrder</h1>
          <p className="text-sm text-gray-500 mt-0.5">Menú digital para tu negocio</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-7">
          {step !== 'done' && <StepDots step={step} />}

          {step === 'account' && (
            <StepAccount onDone={handleAccountDone} />
          )}

          {step === 'restaurant' && (
            <StepRestaurant onDone={handleRestaurantDone} />
          )}

          {step === 'done' && (
            <StepDone slug={resultSlug} nombre={resultNombre} />
          )}
        </div>

        {/* Back to login */}
        {step === 'account' && (
          <p className="text-center text-xs text-gray-400 mt-4">
            ¿Ya tienes un restaurante?{' '}
            <a href="/login" className="font-medium underline" style={{ color: ACCENT }}>
              Inicia sesión
            </a>
          </p>
        )}

      </div>
    </main>
  )
}
