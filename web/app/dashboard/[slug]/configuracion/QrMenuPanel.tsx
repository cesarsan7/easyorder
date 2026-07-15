'use client'

/**
 * QrMenuPanel
 *
 * Genera y descarga el QR del menú público del restaurante.
 * Usa la librería `qrcode` (canvas) para generar el QR en el browser.
 * Se importa con `dynamic(..., { ssr: false })` para evitar problemas con canvas en SSR.
 */

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

interface Props {
  slug:   string
  accent: string
}

export default function QrMenuPanel({ slug, accent }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Build the public menu URL from current origin
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const menuUrl = `${origin}/${slug}`
    setUrl(menuUrl)

    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, menuUrl, {
      width:            240,
      margin:           2,
      color: {
        dark:  '#111827',
        light: '#FFFFFF',
      },
    }).catch(console.error)
  }, [slug])

  function handleDownload() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link    = document.createElement('a')
    link.download = `qr-menu-${slug}.png`
    link.href     = canvas.toDataURL('image/png')
    link.click()
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select text
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
        {/* Canvas QR */}
        <div className="shrink-0 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
          <canvas ref={canvasRef} />
        </div>

        {/* Info + acciones */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 mb-1">Menú público</p>
          <p className="text-xs text-gray-500 mb-3">
            Comparte este código QR para que tus clientes accedan directamente a la carta.
          </p>

          {/* URL copiable */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 truncate max-w-[220px]">
              {url || `…/${slug}`}
            </span>
            <button
              onClick={handleCopy}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
            >
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>

          {/* Acciones */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleDownload}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              ↓ Descargar PNG
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Ver menú ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
