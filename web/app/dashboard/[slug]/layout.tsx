'use client'

import { useParams, usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'

// ─── Design tokens ────────────────────────────────────────────────────────────
// Paleta profesional dark-sidebar
// Sidebar:   #111827 (gray-900) bg | #1F2937 (gray-800) hover/active bg
// Accent:    #F43F5E (rose-500) — moderno y cálido, reemplaza el rojo puro
// Surface:   #F9FAFB (gray-50) page bg | #FFFFFF cards
// Border:    #E5E7EB (gray-200)
// Text:      #111827 primary | #6B7280 secondary | #9CA3AF muted

const ACCENT   = '#F43F5E'
const SIDEBAR_BG      = '#111827'
const SIDEBAR_HOVER   = '#1F2937'
const SIDEBAR_ACTIVE  = '#1F2937'
const SIDEBAR_TEXT    = '#9CA3AF'
const SIDEBAR_TEXT_ON = '#F9FAFB'

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV = [
  { path: '',               icon: '◈',  label: 'Pedidos'     },
  { path: '/metricas',      icon: '▦',  label: 'Métricas'    },
  { path: '/menu',          icon: '≡',  label: 'Menú'        },
  { path: '/clientes',      icon: '⊙',  label: 'Clientes'    },
  { path: '/configuracion', icon: '⚙',  label: 'Configuración' },
  { path: '/escalaciones',  icon: '⚑',  label: 'Derivados'   },
]

// ─── Notification hook ────────────────────────────────────────────────────────

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

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function DashboardSidebar({ slug, notifBadge }: { slug: string; notifBadge: number }) {
  const router   = useRouter()
  const pathname = usePathname()

  // Detect active path segment (e.g. /dashboard/islap/metricas → /metricas)
  function activePath() {
    const base = `/dashboard/${slug}`
    if (pathname === base) return ''
    return pathname.replace(base, '')
  }
  const active = activePath()

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 h-screen sticky top-0 overflow-y-auto"
      style={{ width: 220, backgroundColor: SIDEBAR_BG }}
    >
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid #1F2937' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center font-black text-sm text-white"
            style={{ backgroundColor: ACCENT }}
          >
            E
          </div>
          <div>
            <p className="text-sm font-bold leading-none" style={{ color: SIDEBAR_TEXT_ON }}>EasyOrder</p>
            <p className="text-xs mt-0.5 capitalize truncate" style={{ color: SIDEBAR_TEXT, maxWidth: 120 }}>{slug}</p>
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
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left group"
              style={{
                backgroundColor: isActive ? SIDEBAR_ACTIVE : 'transparent',
                color: isActive ? SIDEBAR_TEXT_ON : SIDEBAR_TEXT,
                borderLeft: isActive ? `2px solid ${ACCENT}` : '2px solid transparent',
              }}
              onMouseEnter={e => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = SIDEBAR_HOVER
              }}
              onMouseLeave={e => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
              }}
            >
              <span className="text-base w-5 text-center leading-none select-none">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
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

      {/* Footer */}
      <div className="px-4 pb-5 pt-3" style={{ borderTop: '1px solid #1F2937' }}>
        <p className="text-xs" style={{ color: '#4B5563' }}>EasyOrder SaaS</p>
        <p className="text-xs mt-0.5" style={{ color: '#374151' }}>MVP v0.1</p>
      </div>
    </aside>
  )
}

// ─── Mobile top bar ───────────────────────────────────────────────────────────

function MobileTopBar({ slug, notifBadge }: { slug: string; notifBadge: number }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const active = pathname.replace(`/dashboard/${slug}`, '') || ''

  const currentNav = NAV.find(n => n.path === active || (n.path !== '' && active.startsWith(n.path))) ?? NAV[0]

  return (
    <div
      className="lg:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3"
      style={{ backgroundColor: SIDEBAR_BG, borderBottom: '1px solid #1F2937' }}
    >
      <div className="flex items-center gap-3">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center text-white font-black text-xs"
          style={{ backgroundColor: ACCENT }}>E</div>
        <span className="text-sm font-semibold" style={{ color: SIDEBAR_TEXT_ON }}>{currentNav.label}</span>
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
          style={{ backgroundColor: SIDEBAR_HOVER, color: SIDEBAR_TEXT_ON }}
        >
          ☰
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setOpen(false)} />
          <div className="fixed top-0 left-0 bottom-0 z-40 w-64 flex flex-col py-4"
            style={{ backgroundColor: SIDEBAR_BG }}>
            <div className="px-5 pb-4 mb-2" style={{ borderBottom: '1px solid #1F2937' }}>
              <p className="text-sm font-bold" style={{ color: SIDEBAR_TEXT_ON }}>EasyOrder</p>
              <p className="text-xs capitalize" style={{ color: SIDEBAR_TEXT }}>{slug}</p>
            </div>
            <nav className="flex-1 px-3 space-y-0.5">
              {NAV.map(item => {
                const isActive = active === item.path || (item.path !== '' && active.startsWith(item.path))
                return (
                  <button key={item.path}
                    onClick={() => { router.push(`/dashboard/${slug}${item.path}`); setOpen(false) }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left"
                    style={{
                      backgroundColor: isActive ? SIDEBAR_ACTIVE : 'transparent',
                      color: isActive ? SIDEBAR_TEXT_ON : SIDEBAR_TEXT,
                      borderLeft: isActive ? `2px solid ${ACCENT}` : '2px solid transparent',
                    }}>
                    <span className="text-base w-5 text-center">{item.icon}</span>
                    <span>{item.label}</span>
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
          </div>
        </>
      )}
    </div>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function DashboardSlugLayout({ children }: { children: React.ReactNode }) {
  const params    = useParams<{ slug: string }>()
  const slug      = params.slug
  const authFetch = useAuthFetch()
  const notifData = useLayoutNotifs(slug, authFetch)

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#F9FAFB' }}>
      <DashboardSidebar slug={slug} notifBadge={notifData.badge} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopBar slug={slug} notifBadge={notifData.badge} />
        {children}
      </div>
    </div>
  )
}
