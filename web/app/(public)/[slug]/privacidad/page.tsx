import type { Metadata } from 'next'

interface Props {
  params: Promise<{ slug: string }>
}

const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ''

async function getRestaurant(slug: string) {
  try {
    const res = await fetch(`${API_BASE}/public/${slug}/restaurant`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    return res.json() as Promise<{ name: string; address?: string | null; phone?: string | null; brand_color?: string | null }>
  } catch { return null }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const r = await getRestaurant(slug)
  return { title: `Política de privacidad — ${r?.name ?? slug}` }
}

export default async function PrivacidadPage({ params }: Props) {
  const { slug } = await params
  const r = await getRestaurant(slug)
  const accent = r?.brand_color ?? '#6366F1'
  const nombre = r?.name ?? slug
  const hoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <a href={`/${slug}/menu`} className="text-gray-400 hover:text-gray-700 transition-colors text-lg">←</a>
          <h1 className="font-bold text-gray-900 text-sm truncate">Política de privacidad</h1>
          <div className="ml-auto">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: accent }}>
              {nombre}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <article className="max-w-2xl mx-auto px-5 py-8 space-y-6 text-sm text-gray-700 leading-relaxed">

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 space-y-1">
          <p className="text-xs text-gray-400">Última actualización</p>
          <p className="font-semibold text-gray-900">{hoy}</p>
        </div>

        <Section title="1. Responsable del tratamiento">
          <p>
            El responsable del tratamiento de los datos personales recogidos a través de este sitio
            web es <strong>{nombre}</strong>
            {r?.address ? `, con domicilio en ${r.address}` : ''}.
            {r?.phone ? ` Contacto: ${r.phone}.` : ''}
          </p>
        </Section>

        <Section title="2. Datos que recogemos">
          <p>Al realizar un pedido, recogemos los siguientes datos personales:</p>
          <ul className="list-disc list-inside space-y-1 mt-2 text-gray-600">
            <li><strong>Nombre</strong> — para identificar el pedido.</li>
            <li><strong>Número de teléfono</strong> — para comunicarnos contigo sobre tu pedido.</li>
            <li><strong>Dirección de entrega</strong> — únicamente cuando solicitas delivery.</li>
          </ul>
          <p className="mt-2">
            No recogemos datos de pago (tarjetas, cuentas bancarias) ni datos sensibles.
          </p>
        </Section>

        <Section title="3. Finalidad del tratamiento">
          <p>Tus datos se utilizan exclusivamente para:</p>
          <ul className="list-disc list-inside space-y-1 mt-2 text-gray-600">
            <li>Gestionar y preparar tu pedido.</li>
            <li>Comunicarnos contigo en caso de incidencia.</li>
            <li>Enviarte confirmación del pedido por WhatsApp si así lo solicitas.</li>
          </ul>
          <p className="mt-2">
            No usamos tus datos con fines publicitarios ni los cedemos a terceros
            salvo que sea estrictamente necesario para prestar el servicio (ej. plataforma de mensajería).
          </p>
        </Section>

        <Section title="4. Base legal">
          <p>
            El tratamiento se basa en la ejecución de una relación contractual
            (art. 6.1.b RGPD): la gestión de tu pedido. La recogida de datos es
            voluntaria pero necesaria para procesar la solicitud.
          </p>
        </Section>

        <Section title="5. Conservación de los datos">
          <p>
            Los datos asociados a pedidos se conservan durante el tiempo necesario para
            atender el pedido y cumplir con obligaciones legales, contables o fiscales.
            Tras ese período se procede a su anonimización o eliminación.
          </p>
        </Section>

        <Section title="6. Tus derechos">
          <p>Puedes ejercer en cualquier momento los siguientes derechos:</p>
          <ul className="list-disc list-inside space-y-1 mt-2 text-gray-600">
            <li><strong>Acceso</strong> — conocer qué datos tenemos sobre ti.</li>
            <li><strong>Rectificación</strong> — corregir datos inexactos.</li>
            <li><strong>Supresión</strong> — solicitar la eliminación de tus datos.</li>
            <li><strong>Limitación y oposición</strong> — restringir u oponerte al tratamiento.</li>
            <li><strong>Portabilidad</strong> — recibir tus datos en formato legible.</li>
          </ul>
          {r?.phone && (
            <p className="mt-2">
              Para ejercer estos derechos, contáctanos por teléfono al{' '}
              <a href={`tel:${r.phone}`} className="font-medium underline" style={{ color: accent }}>{r.phone}</a>.
            </p>
          )}
          <p className="mt-2">
            Si consideras que el tratamiento no es conforme a la normativa, puedes
            presentar una reclamación ante la Agencia Española de Protección de Datos
            (AEPD) en{' '}
            <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer"
              className="underline" style={{ color: accent }}>www.aepd.es</a>.
          </p>
        </Section>

        <Section title="7. Seguridad">
          <p>
            Aplicamos medidas técnicas y organizativas adecuadas para proteger tus datos
            frente a accesos no autorizados, pérdida o alteración, de acuerdo con el RGPD
            y la LOPDGDD.
          </p>
        </Section>

        <Section title="8. Cambios en esta política">
          <p>
            Podemos actualizar esta política ocasionalmente. La fecha de última actualización
            aparece al inicio del documento. Te recomendamos revisarla periódicamente.
          </p>
        </Section>

        <div className="pt-4 border-t border-gray-100 text-center">
          <a
            href={`/${slug}/menu`}
            className="inline-flex items-center gap-2 text-xs font-semibold px-5 py-2.5 rounded-xl text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            ← Volver al menú
          </a>
        </div>

      </article>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 space-y-2">
      <h2 className="font-bold text-gray-900 text-sm">{title}</h2>
      <div className="text-gray-600 space-y-2">{children}</div>
    </section>
  )
}
