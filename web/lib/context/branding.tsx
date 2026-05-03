'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getTheme, type ThemeTokens, DEFAULT_THEME_ID } from '@/lib/themes'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'

interface BrandingData {
  theme: ThemeTokens
  restaurantName: string | null
  eslogan: string | null
  logoUrl: string | null
}

const defaultBranding: BrandingData = {
  theme: getTheme(DEFAULT_THEME_ID),
  restaurantName: null,
  eslogan: null,
  logoUrl: null,
}

const BrandingContext = createContext<BrandingData>(defaultBranding)

export function useBranding() {
  return useContext(BrandingContext)
}

interface Props {
  slug: string
  authFetch: ReturnType<typeof useAuthFetch>
  children: ReactNode
}

export function BrandingProvider({ slug, authFetch, children }: Props) {
  const [branding, setBranding] = useState<BrandingData>(defaultBranding)

  const fetchBranding = useCallback(async () => {
    try {
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/dashboard/${slug}/settings`,
      )
      if (!res.ok) return
      const d = await res.json() as {
        nombre?: string
        eslogan?: string | null
        logo_url?: string | null
        brand_color?: string | null
        theme_id?: string | null
      }
      setBranding({
        theme:          getTheme(d.theme_id ?? d.brand_color),
        restaurantName: d.nombre ?? null,
        eslogan:        d.eslogan ?? null,
        logoUrl:        d.logo_url ?? null,
      })
    } catch {
      // silent — keep default theme
    }
  }, [slug, authFetch])

  useEffect(() => { fetchBranding() }, [fetchBranding])

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  )
}
