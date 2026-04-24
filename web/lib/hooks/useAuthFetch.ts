'use client'

import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

/**
 * Returns a fetch wrapper that automatically injects the Supabase JWT
 * as Authorization: Bearer <token> on every request.
 *
 * If the session has expired or is missing, redirects to /login.
 */
export function useAuthFetch() {
  const router = useRouter()

  const authFetch = useCallback(
    async (input: string, init: RequestInit = {}): Promise<Response> => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.replace('/login')
        // Return a fake 401 so callers can handle gracefully
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
      }

      return fetch(input, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...init.headers,
          Authorization: `Bearer ${session.access_token}`,
        },
      })
    },
    [router],
  )

  return authFetch
}
