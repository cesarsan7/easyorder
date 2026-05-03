'use client'

import { useEffect } from 'react'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Error boundary para la página del menú.
 * En vez de mostrar el error genérico de Next.js, muestra un mensaje legible
 * y el detalle del error para facilitar el diagnóstico en producción.
 */
export default function MenuError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[MenuError]', error)
  }, [error])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 bg-gray-50">
      <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-red-700">Error al cargar el menú</h1>
        <p className="mb-4 text-sm text-gray-600">
          Ocurrió un error inesperado al intentar mostrar el menú. Intenta recargar la página.
        </p>

        {/* Detalle del error — visible solo en desarrollo o si se quiere depurar */}
        {error.message && (
          <pre className="mb-4 overflow-x-auto rounded-lg bg-red-50 p-3 text-xs text-red-800">
            {error.message}
            {error.digest ? `\n\nDigest: ${error.digest}` : ''}
          </pre>
        )}

        <button
          onClick={reset}
          className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Reintentar
        </button>
      </div>
    </main>
  )
}
