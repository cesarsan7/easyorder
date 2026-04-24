'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DashboardIndexPage() {
  const router = useRouter()

  useEffect(() => {
    const savedSlug = localStorage.getItem('easyorder-last-slug')
    if (savedSlug) {
      router.replace(`/dashboard/${savedSlug}`)
    } else {
      // No saved slug — redirect to login
      router.replace('/login')
    }
  }, [router])

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-red-500 animate-spin" />
    </main>
  )
}
