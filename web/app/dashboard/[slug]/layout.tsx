'use client'

import { useParams, usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'
import { BrandingProvider, useBranding } from '@/lib/context/branding'

const SIDEBAR_BG   = '#FFFFFF'
const SIDEBAR_BDR  = '#E5E7EB'
const SIDEBAR_TEXT = '#6B7280'
const SIDEBAR_HOVER = '#F9FAFB'

const NAV = [
  { path: '',               icon: '◈', label: 'Pedidos'        },
  { path: '/metricas',      icon: '▦', label: 'Métricas'       },
  { path: '/menu',          icon: '≡', label: 'Menú'           },
  { path: '/clientes',      icon: '⊙', label: 'Clientes'       },
  { path: '/configuracion', icon: '⚙', label: 'Configuración'  },
  { path: '/escalaciones',  icon: '⚑', label: 'Derivados'      },
]

interface NotifData {
  badge: number
  pedidos_expirados_24h: number
}

function useLayoutNotifs(slug: string, authFetch: ReturnType<typeof useAuthFetch>) {
  const [data, setData] = useState<NotifData>({ badge: 0, pedidos_expirados_24h: 0 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetch_ = useCallback(async () => {
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/notifications`)
      if (res.ok) {
        const d = await res.json()
        setData({ badge: d.badge ?? 0, pedidos_expirados_24h: d.pedidos_expirados_24h ?? 0 })
      }
    } catch { /* silent */ }
  }, [slug, authFetch])

  useEffect(() => {
    fetch_()
    timerRef.current = setTimeout(function poll() {
      fetch_(); timerRef.current = setTimeout(poll, 30_000)
    }, 30_000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [fetch_])

  return data
}

// ─── Sidebar (desktop) ────────────────────────────────────────────────────────
function DashboardSidebar({ slug, notifBadge }: { slug: string; notifBadge: number }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { theme, restaurantName, eslogan, logoUrl } = useBranding()

  const ACCENT       = theme.accent
  const ACCENT_LIGHT = theme.accentLight
  const ACCENT_TEXT  = theme.accentText

  function activePath() {
    const base = `/dashboard/${slug}`
    if (pathname === base) return ''
    return pathname.replace(base, '')
  }
  const active = activePath()

  const displayName = restaurantName ?? slug

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 h-screen sticky top-0 overflow-y-auto"
      style={{ width: 220, backgroundColor: SIDEBAR_BG, borderRight: `1px solid ${SIDEBAR_BDR}` }}
    >
      {/* Logo / Brand */}
      <div className="px-5 py-5" style={{ borderBottom: `1px solid ${SIDEBAR_BDR}` }}>
        <div className="flex items-center gap-2.5">
          {logoUrl ? (
            <div className="h-9 w-9 rounded-xl overflow-hidden shrink-0 border border-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={displayName} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center font-black text-sm text-white shadow-sm shrink-0"
              style={{ backgroundColor: ACCENT }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold leading-none truncate" style={{ color: '#111827' }}>
              {displayName}
            </p>
            {eslogan ? (
              <p className="text-xs mt-0.5 truncate" style={{ color: SIDEBAR_TEXT, maxWidth: 130 }}>
                {eslogan}
              </p>
            ) : (
              <p className="text-xs mt-0.5 capitalize truncate" style={{ color: SIDEBAR_TEXT, maxWidth: 130 }}>
                {slug}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(item => {
          const isActive = active === item.path ||
            (item.path !== '' && active.startsWith(item.path))
          return (
            <button
              key={item.path}
              onClick={() => router.push(`/dashboard/${slug}${item.path}`)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
              style={{
                backgroundColor: isActive ? ACCENT_LIGHT : 'transparent',
                color: isActive ? ACCENT_TEXT : SIDEBAR_TEXT,
                borderLeft: isActive ? `3px solid ${ACCENT}` : '3px solid transparent',
              }}
              onMouseEnter={e => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = SIDEBAR_HOVER
              }}
              onMouseLeave={e => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
              }}
            >
              <span className="text-base w-5 text-center leading-none select-none">{item.icon}</span>
              <span className="flex-1 text-sm">{item.label}</span>
              {item.path === '/escalaciones' && notifBadge > 0 && (
                <span
                  className="rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-white font-bold"
                  style={{ fontSize: 10, backgroundColor: ACCENT }}
                >
                  {notifBadge > 9 ? '9+' : notifBadge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer — botón "Ver menú" + versión */}
      <div className="px-4 pb-5 pt-3 space-y-2" style={{ borderTop: `1px solid ${SIDEBAR_BDR}` }}>
        <a
          href={`/${slug}/menu`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 w-full rounded-xl px-3 py-2 text-xs font-medium transition-colors"
          style={{ color: ACCENT, backgroundColor: ACCENT_LIGHT }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
            <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
          </svg>
          Ver menú público
        </a>
        <div>
          <p className="text-xs font-medium" style={{ color: '#9CA3AF' }}>EasyOrder SaaS</p>
          <p className="text-xs mt-0.5" style={{ color: '#CBD5E1' }}>MVP v0.1</p>
        </div>
      </div>
    </aside>
  )
}

// ─── Mobile top bar ───────────────────────────────────────────────────────────
function MobileTopBar({ slug, notifBadge }: { slug: string; notifBadge: number }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { theme, restaurantName } = useBranding()
  const ACCENT       = theme.accent
  const ACCENT_LIGHT = theme.accentLight
  const ACCENT_TEXT  = theme.accentText

  const [open, setOpen] = useState(false)
  const active = pathname.replace(`/dashboard/${slug}`, '') || ''
  const displayName = restaurantName ?? slug

  const currentNav = NAV.find(n => n.path === active || (n.path !== '' && active.startsWith(n.path))) ?? NAV[0]

  return (
    <div
      className="lg:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3"
      style={{ backgroundColor: SIDEBAR_BG, borderBottom: `1px solid ${SIDEBAR_BDR}` }}
    >
      <div className="flex items-center gap-3">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center text-white font-black text-xs"
          style={{ backgroundColor: ACCENT }}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-semibold" style={{ color: '#111827' }}>{currentNav.label}</span>
      </div>
      <div className="flex items-center gap-2">
        {notifBadge > 0 && (
          <button
            onClick={() => router.push(`/dashboard/${slug}/escalaciones`)}
            className="rounded-full min-w-[22px] h-[22px] px-1 flex items-center justify-center text-white font-bold text-xs"
            style={{ backgroundColor: ACCENT }}
          >
            {notifBadge}
          </button>
        )}
        <button
          onClick={() => setOpen(v => !v)}
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: '#F3F4F6', color: '#374151' }}
        >
          {String.fromCharCode(9776)}
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setOpen(false)} />
          <div className="fixed top-0 left-0 bottom-0 z-40 w-64 flex flex-col py-4"
            style={{ backgroundColor: SIDEBAR_BG, borderRight: `1px solid ${SIDEBAR_BDR}` }}>
            <div className="px-5 pb-4 mb-2" style={{ borderBottom: `1px solid ${SIDEBAR_BDR}` }}>
              <p className="text-sm font-bold" style={{ color: '#111827' }}>{displayName}</p>
              <p className="text-xs capitalize" style={{ color: SIDEBAR_TEXT }}>{slug}</p>
            </div>
            <nav className="flex-1 px-3 space-y-0.5">
              {NAV.map(item => {
                const isActive = active === item.path || (item.path !== '' && active.startsWith(item.path))
                return (
                  <button key={item.path}
                    onClick={() => { router.push(`/dashboard/${slug}${item.path}`); setOpen(false) }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left"
                    style={{
                      backgroundColor: isActive ? ACCENT_LIGHT : 'transparent',
                      color: isActive ? ACCENT_TEXT : SIDEBAR_TEXT,
                      borderLeft: isActive ? `3px solid ${ACCENT}` : '3px solid transparent',
                    }}>
                    <span className="text-base w-5 text-center">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.path === '/escalaciones' && notifBadge > 0 && (
                      <span className="ml-auto rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-white font-bold"
                        style={{ fontSize: 10, backgroundColor: ACCENT }}>
                        {notifBadge > 9 ? '9+' : notifBadge}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>
            <div className="px-4 pt-3" style={{ borderTop: `1px solid ${SIDEBAR_BDR}` }}>
              <a
                href={`/${slug}/menu`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 w-full rounded-xl px-3 py-2 text-xs font-medium"
                style={{ color: ACCENT, backgroundColor: ACCENT_LIGHT }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
                  <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
                </svg>
                Ver menu publico
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Root layout
export default function DashboardSlugLayout({ children }: { children: React.ReactNode }) {
  const params    = useParams<{ slug: string }>()
  const slug      = params.slug
  const authFetch = useAuthFetch()
  const notifData = useLayoutNotifs(slug, authFetch)

  return (
    <BrandingProvider slug={slug} authFetch={authFetch}>
      <div className="flex min-h-screen" style={{ backgroundColor: '#F8FAFC' }}>
        <DashboardSidebar slug={slug} notifBadge={notifData.badge} />
        <div className="flex-1 flex flex-col min-w-0">
          <MobileTopBar slug={slug} notifBadge={notifData.badge} />
          {children}
        </div>
      </div>
    </BrandingProvider>
  )
}
