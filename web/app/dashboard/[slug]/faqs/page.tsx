'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'
import { useBranding } from '@/lib/context/branding'

interface Faq {
  id: number
  pregunta: string
  respuesta: string
  orden: number
}

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

export default function FaqsPage() {
  const { slug } = useParams<{ slug: string }>()
  const authFetch = useAuthFetch()
  const { theme } = useBranding()
  const ACCENT = theme.accent
  const ACCENT_LIGHT = theme.accentLight

  const [faqs, setFaqs]       = useState<Faq[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // form state
  const [editId, setEditId]       = useState<number | null>(null)
  const [pregunta, setPregunta]   = useState('')
  const [respuesta, setRespuesta] = useState('')
  const [orden, setOrden]         = useState(0)
  const [showForm, setShowForm]   = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await authFetch(`${API}/dashboard/${slug}/faqs`)
      if (!res.ok) throw new Error('Error al cargar FAQs')
      setFaqs(await res.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    setEditId(null)
    setPregunta('')
    setRespuesta('')
    setOrden(faqs.length)
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  function openEdit(f: Faq) {
    setEditId(f.id)
    setPregunta(f.pregunta)
    setRespuesta(f.respuesta)
    setOrden(f.orden)
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setPregunta('')
    setRespuesta('')
  }

  async function save() {
    if (!pregunta.trim() || !respuesta.trim()) {
      setError('La pregunta y respuesta son requeridas')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url = editId
        ? `${API}/dashboard/${slug}/faqs/${editId}`
        : `${API}/dashboard/${slug}/faqs`
      const res = await authFetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta: pregunta.trim(), respuesta: respuesta.trim(), orden }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Error al guardar')
      }
      await load()
      cancelForm()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteFaq(id: number) {
    if (!confirm('¿Eliminar esta pregunta?')) return
    try {
      const res = await authFetch(`${API}/dashboard/${slug}/faqs/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      setFaqs(prev => prev.filter(f => f.id !== id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    }
  }

  return (
    <main className="flex-1 p-4 lg:p-8 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Preguntas frecuentes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            El agente usa estas respuestas para atender consultas de clientes
          </p>
        </div>
        {!showForm && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: ACCENT }}
          >
            + Nueva pregunta
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 font-bold">✕</button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div
          ref={formRef}
          className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-gray-700">
            {editId ? 'Editar pregunta' : 'Nueva pregunta'}
          </h2>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pregunta</label>
            <input
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ '--tw-ring-color': ACCENT } as React.CSSProperties}
              placeholder="¿Cuál es el horario de atención?"
              value={pregunta}
              onChange={e => setPregunta(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Respuesta</label>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 resize-none"
              style={{ '--tw-ring-color': ACCENT } as React.CSSProperties}
              placeholder="Atendemos de lunes a viernes de 11am a 11pm..."
              value={respuesta}
              onChange={e => setRespuesta(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Orden</label>
              <input
                type="number"
                className="w-20 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none"
                value={orden}
                onChange={e => setOrden(Number(e.target.value))}
                min={0}
              />
            </div>
            <div className="flex-1" />
            <button
              onClick={cancelForm}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: ACCENT }}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Cargando…</div>
      ) : faqs.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <div className="text-4xl">❓</div>
          <p className="text-sm text-gray-500">Aún no hay preguntas frecuentes.</p>
          {!showForm && (
            <button
              onClick={openNew}
              className="mt-2 text-sm font-semibold"
              style={{ color: ACCENT }}
            >
              Agregar la primera
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {faqs.map((f, idx) => (
            <div
              key={f.id}
              className="rounded-2xl border border-gray-200 bg-white shadow-sm px-5 py-4 flex gap-4 items-start"
            >
              <div
                className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold mt-0.5"
                style={{ backgroundColor: ACCENT_LIGHT, color: ACCENT }}
              >
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 leading-snug">{f.pregunta}</p>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{f.respuesta}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openEdit(f)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Editar
                </button>
                <button
                  onClick={() => deleteFaq(f.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-100 text-red-500 hover:bg-red-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
