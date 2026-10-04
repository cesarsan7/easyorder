'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'

interface Extra {
  extra_id:  number
  name:      string
  price:     number
  allergens: string | null
}

interface Variant {
  menu_variant_id: number
  variant_name:    string
  price:           number
}

interface MenuItem {
  menu_item_id: number
  name:         string
  variants:     Variant[]
  extras?:      Extra[]
}

interface Category {
  menu_category_id: number
  name:             string
  items:            MenuItem[]
}

interface Mesa {
  mesa_id: number
  zona_id: number | null
  zona_nombre: string | null
  numero: number
  nombre: string
  ocupada: boolean
  activa: boolean
}

interface Mesero {
  mesero_id: number
  nombre:    string
  activo:    boolean
}

interface DeliveryZone {
  delivery_zone_id: number
  zone_name:        string
  fee:              number
  min_order_amount: number | null
}

interface CartLine {
  menu_variant_id: number
  menu_item_id:    number
  item_name:       string
  variant_name:    string
  quantity:        number
  unit_price:      number
  availableExtras: Extra[]
  selectedExtras:  Extra[]
}

interface InitialCartItem {
  menu_variant_id: number
  menu_item_id:    number
  item_name:       string
  variant_name:    string
  quantity:        number
  unit_price:      number
  extras:          { extra_id: number; name: string; price: number }[]
}

interface LastOrderData {
  nombre:        string | null
  tipo_despacho: string | null
  metodo_pago:   string | null
  direccion:     string | null
  zona_id:       number | null
  items:         InitialCartItem[]
}

interface Props {
  slug:        string
  accent:      string
  moneda:      string
  onClose:     () => void
  onCreated:   (pedidoCodigo: string) => void
  initialCart?: InitialCartItem[]
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  bizum:         'Bizum',
  online:        'Online',
}

export default function ManualOrderModal({ slug, accent, moneda, onClose, onCreated, initialCart }: Props) {
  const authFetch = useAuthFetch()
  const apiBase   = process.env.NEXT_PUBLIC_API_URL ?? ''

  // Customer
  const [nombre,      setNombre]      = useState('')
  const [telefono,    setTelefono]    = useState('')
  const [nombrePedido, setNombrePedido] = useState('')
  const [phonePrefix, setPhonePrefix] = useState('+34')

  // Dispatch
  const [tipoDespacho, setTipoDespacho] = useState<'retiro' | 'delivery' | 'mesa'>('retiro')
  const [direccion,    setDireccion]    = useState('')
  const [zonaId,       setZonaId]       = useState<number | null>(null)
  const [zones,        setZones]        = useState<DeliveryZone[]>([])
  const [mesas,        setMesas]        = useState<Mesa[]>([])
  const [mesaId,       setMesaId]       = useState<number | null>(null)
  const [servicioMesa, setServicioMesa] = useState(false)
  const [meseros,      setMeseros]      = useState<Mesero[]>([])
  const [meseroId,     setMeseroId]     = useState<number | null>(null)

  // Payment
  const [metodoPago,     setMetodoPago]     = useState('')
  const [paymentMethods, setPaymentMethods] = useState<string[]>([])

  // Menu
  const [categories, setCategories] = useState<Category[]>([])
  const [search,     setSearch]     = useState('')
  const [cart,       setCart]       = useState<CartLine[]>([])

  // UI
  const [notas,       setNotas]       = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [loadingMenu, setLoadingMenu] = useState(true)

  // Phone lookup — last order
  const [lastOrder,      setLastOrder]      = useState<LastOrderData | null>(null)
  const [lookupLoading,  setLookupLoading]  = useState(false)
  const [lookupApplied,  setLookupApplied]  = useState(false)
  const [lookupPhoneRef, setLookupPhoneRef] = useState('')

  // ── Load menu + zones + payment methods ──────────────────────────────────
  const loadData = useCallback(async () => {
    setLoadingMenu(true)
    try {
      const [menuRes, restRes, zonesRes, mesasRes, moserosRes] = await Promise.all([
        fetch(`${apiBase}/public/${slug}/menu`),
        fetch(`${apiBase}/public/${slug}/restaurant`),
        authFetch(`${apiBase}/dashboard/${slug}/delivery-zones`),
        authFetch(`${apiBase}/dashboard/${slug}/mesas`),
        authFetch(`${apiBase}/dashboard/${slug}/meseros`),
      ])
      if (menuRes.ok) {
        const d: { categories: Category[] } = await menuRes.json()
        setCategories(d.categories ?? [])
      }
      if (restRes.ok) {
        const d: { payment_methods?: string[]; phone_prefix?: string; servicio_mesa?: boolean } = await restRes.json()
        const methods = d.payment_methods ?? []
        setPaymentMethods(methods)
        if (methods.length > 0) setMetodoPago(methods[0])
        if (d.phone_prefix) setPhonePrefix(d.phone_prefix)
        if (d.servicio_mesa) setServicioMesa(true)
      }
      if (zonesRes.ok) {
        const d: { zones: DeliveryZone[] } = await zonesRes.json()
        const activeZones = (d.zones ?? []).filter((z: DeliveryZone & { is_active?: boolean }) => z.is_active !== false)
        setZones(activeZones)
        if (activeZones.length > 0) setZonaId(activeZones[0].delivery_zone_id)
      }
      if (mesasRes.ok) {
        const d: Mesa[] = await mesasRes.json()
        setMesas(d.filter(m => m.activa !== false))
      }
      if (moserosRes.ok) {
        const d: Mesero[] = await moserosRes.json()
        setMeseros(d.filter(m => m.activo !== false))
      }
    } finally {
      setLoadingMenu(false)
    }
  }, [slug, apiBase, authFetch])

  useEffect(() => { loadData() }, [loadData])

  // ── Helper: build CartLine[] from raw items ──────────────────────────────
  function buildCartFromItems(rawItems: InitialCartItem[]): CartLine[] {
    return rawItems.map(ic => {
      let availableExtras: Extra[] = []
      for (const cat of categories) {
        const item = cat.items.find(i => i.menu_item_id === ic.menu_item_id)
        if (item) { availableExtras = item.extras ?? []; break }
      }
      const selectedExtras = availableExtras.filter(e =>
        (ic.extras ?? []).some(ie => ie.extra_id === e.extra_id)
      )
      return {
        menu_variant_id: ic.menu_variant_id,
        menu_item_id:    ic.menu_item_id,
        item_name:       ic.item_name,
        variant_name:    ic.variant_name,
        quantity:        ic.quantity,
        unit_price:      ic.unit_price,
        availableExtras,
        selectedExtras,
      }
    })
  }

  // ── Populate cart from initialCart after menu loads ───────────────────────
  const initialCartApplied = useRef(false)
  useEffect(() => {
    if (!initialCart || initialCart.length === 0) return
    if (loadingMenu) return
    if (initialCartApplied.current) return
    initialCartApplied.current = true
    setCart(buildCartFromItems(initialCart))
  }, [loadingMenu, categories, initialCart])

  // ── Phone lookup — debounced, fires when ≥9 digits ───────────────────────
  useEffect(() => {
    const digits = telefono.replace(/\D/g, '')
    if (digits.length < 9) {
      setLastOrder(null)
      setLookupApplied(false)
      setLookupPhoneRef('')
      return
    }
    const fullPhone = telefono.trim().startsWith('+')
      ? telefono.trim()
      : `${phonePrefix}${digits}`

    if (fullPhone === lookupPhoneRef) return

    const timer = setTimeout(async () => {
      setLookupLoading(true)
      setLastOrder(null)
      try {
        const url = `${apiBase}/dashboard/${slug}/clientes/${encodeURIComponent(fullPhone)}`
        console.log('[lookup] GET', url)
        const res = await authFetch(url)
        console.log('[lookup] status:', res.status)
        if (res.ok) {
          const data = await res.json() as {
            cliente?: { nombre?: string | null }
            pedidos?: Array<{
              tipo_despacho: string | null
              metodo_pago:   string | null
              direccion:     string | null
              zona_id:       number | null
              items:         InitialCartItem[]
            }>
          }
          console.log('[lookup] pedidos:', data.pedidos?.length, '| items[0]:', data.pedidos?.[0]?.items?.length)
          const pedido = data.pedidos?.[0]
          if (pedido) {
            const items = Array.isArray(pedido.items) ? pedido.items : []
            setLastOrder({
              nombre:        data.cliente?.nombre ?? null,
              tipo_despacho: pedido.tipo_despacho,
              metodo_pago:   pedido.metodo_pago,
              direccion:     pedido.direccion,
              zona_id:       pedido.zona_id,
              items,
            })
            if (!nombre.trim() && data.cliente?.nombre) {
              setNombre(data.cliente.nombre)
            }
          } else {
            console.log('[lookup] no pedidos found for this customer')
          }
          setLookupPhoneRef(fullPhone)
        } else {
          const body = await res.text().catch(() => '')
          console.warn('[lookup] non-ok:', res.status, body)
        }
      } catch (err) {
        console.error('[lookup] fetch error:', err)
      } finally {
        setLookupLoading(false)
      }
    }, 700)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telefono, phonePrefix])

  // ── Apply last order ──────────────────────────────────────────────────────
  function applyLastOrder() {
    if (!lastOrder) return
    const td = lastOrder.tipo_despacho
    if (td === 'retiro' || td === 'delivery' || td === 'mesa') setTipoDespacho(td)
    if (lastOrder.direccion) setDireccion(lastOrder.direccion)
    if (lastOrder.zona_id)   setZonaId(lastOrder.zona_id)
    if (lastOrder.metodo_pago && paymentMethods.includes(lastOrder.metodo_pago)) {
      setMetodoPago(lastOrder.metodo_pago)
    }
    setCart(buildCartFromItems(lastOrder.items))
    setLookupApplied(true)
  }

  // ── Cart helpers ──────────────────────────────────────────────────────────
  function addToCart(item: MenuItem, variant: Variant) {
    setCart(prev => {
      const existing = prev.find(l => l.menu_variant_id === variant.menu_variant_id)
      if (existing) {
        return prev.map(l => l.menu_variant_id === variant.menu_variant_id
          ? { ...l, quantity: l.quantity + 1 } : l)
      }
      return [...prev, {
        menu_variant_id: variant.menu_variant_id,
        menu_item_id:    item.menu_item_id,
        item_name:       item.name,
        variant_name:    variant.variant_name,
        quantity:        1,
        unit_price:      Number(variant.price),
        availableExtras: item.extras ?? [],
        selectedExtras:  [],
      }]
    })
  }

  function updateQty(variantId: number, delta: number) {
    setCart(prev => prev
      .map(l => l.menu_variant_id === variantId ? { ...l, quantity: l.quantity + delta } : l)
      .filter(l => l.quantity > 0)
    )
  }

  function toggleExtra(variantId: number, extra: Extra) {
    setCart(prev => prev.map(l => {
      if (l.menu_variant_id !== variantId) return l
      const already = l.selectedExtras.some(e => e.extra_id === extra.extra_id)
      return {
        ...l,
        selectedExtras: already
          ? l.selectedExtras.filter(e => e.extra_id !== extra.extra_id)
          : [...l.selectedExtras, extra],
      }
    }))
  }

  const lineTotal  = (l: CartLine) => (l.unit_price + l.selectedExtras.reduce((s, e) => s + e.price, 0)) * l.quantity
  const subtotal   = cart.reduce((s, l) => s + lineTotal(l), 0)
  const selectedZone = zones.find(z => z.delivery_zone_id === zonaId)
  const costoEnvio   = tipoDespacho === 'delivery' ? (selectedZone?.fee ?? 0) : 0
  const total = subtotal + costoEnvio

  const fmt = (n: number) => `${moneda === 'EUR' ? '€' : moneda} ${n.toFixed(2)}`

  // ── Filtered menu ─────────────────────────────────────────────────────────
  const filteredCats = categories
    .map(cat => ({
      ...cat,
      items: cat.items.filter(i =>
        !search || i.name.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter(cat => cat.items.length > 0)

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleCreate() {
    setError('')
    if (tipoDespacho !== 'mesa' && !nombre.trim()) { setError('Ingresa el nombre del cliente.'); return }
    if (tipoDespacho !== 'mesa' && !telefono.trim()) { setError('Ingresa el teléfono del cliente.'); return }
    if (cart.length === 0) { setError('Agrega al menos un producto.'); return }
    if (!metodoPago) { setError('Selecciona un método de pago.'); return }
    if (tipoDespacho === 'delivery' && !direccion.trim()) { setError('Ingresa la dirección.'); return }
    if (tipoDespacho === 'mesa' && !mesaId) { setError('Selecciona una mesa.'); return }
    if (tipoDespacho === 'delivery' && !zonaId) { setError('Selecciona una zona de delivery.'); return }

    setSaving(true)
    try {
      const res = await authFetch(`${apiBase}/dashboard/${slug}/orders/manual`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:        nombre.trim(),
          nombre_pedido: nombrePedido.trim() || undefined,
          telefono:      telefono.trim().startsWith('+') ? telefono.trim() : `${phonePrefix}${telefono.trim().replace(/\D/g, '')}`,
          tipo_despacho: tipoDespacho,
          mesa_id:       tipoDespacho === 'mesa' ? mesaId : undefined,
          mesero_id:     tipoDespacho === 'mesa' && meseroId ? meseroId : undefined,
          metodo_pago:   metodoPago,
          direccion:     tipoDespacho === 'delivery' ? direccion.trim() : undefined,
          zona_id:       tipoDespacho === 'delivery' ? zonaId : undefined,
          notas:         notas.trim() || undefined,
          items:         cart.map(l => ({
            menu_variant_id: l.menu_variant_id,
            menu_item_id:    l.menu_item_id,
            item_name:       l.item_name,
            variant_name:    l.variant_name,
            quantity:        l.quantity,
            unit_price:      l.unit_price,
            extras:          l.selectedExtras.map(e => ({
              name:       e.name,
              unit_price: e.price,
              quantity:   1,
            })),
          })),
        }),
      })
      const data: { pedido_codigo?: string; error?: string } = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? `Error HTTP ${res.status}`)
        return
      }
      onCreated(data.pedido_codigo ?? '?')
    } catch {
      setError('Error de conexión.')
    } finally {
      setSaving(false)
    }
  }

  const sym = moneda === 'EUR' ? '€' : moneda

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">🧾 Tomar pedido interno</h2>
            <p className="text-xs text-gray-400 mt-0.5">Crea un pedido manual para un cliente</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700 flex items-start gap-2">
              <span className="shrink-0">⚠</span> {error}
            </div>
          )}

          {/* Cliente */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Cliente</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nombre {tipoDespacho !== 'mesa' ? '*' : <span className="text-gray-400">(opcional)</span>}</label>
                <input value={nombre} onChange={e => setNombre(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': accent } as React.CSSProperties} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Teléfono {tipoDespacho !== 'mesa' ? '*' : <span className="text-gray-400">(opcional)</span>}</label>
                <div className="flex gap-1">
                  <span className="inline-flex items-center rounded-xl border border-gray-200 bg-gray-50 px-2.5 text-xs text-gray-500 shrink-0 select-none">
                    {phonePrefix}
                  </span>
                  <input value={telefono} onChange={e => setTelefono(e.target.value)}
                    placeholder="600 000 000" type="tel"
                    className="min-w-0 flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': accent } as React.CSSProperties} />
                </div>
              </div>
            </div>
            {/* ── Phone lookup banner ────────────────────────────────── */}
            {lookupLoading && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-400 px-1">
                <div className="w-3 h-3 border-2 border-gray-200 rounded-full animate-spin shrink-0"
                  style={{ borderTopColor: accent }} />
                Buscando historial del cliente…
              </div>
            )}
            {!lookupLoading && lastOrder && !lookupApplied && (
              <div className="mt-2 rounded-xl border-2 p-3"
                style={{ borderColor: `${accent}50`, backgroundColor: `${accent}08` }}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold mb-0.5" style={{ color: accent }}>
                      🔁 {lastOrder.nombre ? `${lastOrder.nombre} — último pedido` : 'Último pedido encontrado'}
                    </p>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {lastOrder.items.length > 0
                        ? lastOrder.items.slice(0, 3).map(i => `${i.quantity}× ${i.item_name}`).join(', ')
                            + (lastOrder.items.length > 3 ? ` +${lastOrder.items.length - 3} más` : '')
                        : 'Sin ítems registrados'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {lastOrder.tipo_despacho ?? '—'}
                      {lastOrder.metodo_pago ? ` · ${lastOrder.metodo_pago}` : ''}
                      {lastOrder.direccion ? ` · ${lastOrder.direccion}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={applyLastOrder}
                      className="text-xs font-bold px-3 py-1.5 rounded-xl text-white transition-opacity"
                      style={{ backgroundColor: accent }}
                    >
                      ✓ Usar pedido
                    </button>
                    <button
                      onClick={() => setLastOrder(null)}
                      className="text-xs px-3 py-1.5 rounded-xl text-gray-500 border border-gray-200 hover:bg-gray-50"
                    >
                      Ignorar
                    </button>
                  </div>
                </div>
              </div>
            )}
            {!lookupLoading && lookupApplied && (
              <div className="mt-2 flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-xl px-3 py-2 border border-green-200">
                <span>✓ Pedido anterior cargado</span>
                <button
                  onClick={() => { setLookupApplied(false); setCart([]) }}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  deshacer
                </button>
              </div>
            )}
            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">Pedido a nombre de <span className="text-gray-400">(opcional)</span></label>
              <input value={nombrePedido} onChange={e => setNombrePedido(e.target.value)}
                placeholder="Si el pedido es para otra persona"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': accent } as React.CSSProperties} />
            </div>
          </section>

          {/* Despacho */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Despacho</h3>
            <div className="flex gap-2 mb-3">
              {(['retiro', 'delivery', ...(servicioMesa ? ['mesa' as const] : [])] as const).map(t => (
                <button key={t} onClick={() => setTipoDespacho(t)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all"
                  style={{
                    borderColor:     tipoDespacho === t ? accent : '#E5E7EB',
                    color:           tipoDespacho === t ? accent : '#6B7280',
                    backgroundColor: tipoDespacho === t ? `${accent}10` : 'white',
                  }}>
                  {t === 'retiro' ? '🏪 Retiro' : t === 'delivery' ? '🛵 Delivery' : '🪑 Mesa'}
                </button>
              ))}
            </div>
            {tipoDespacho === 'mesa' && (
              <div className="space-y-2">
                <select value={mesaId ?? ''} onChange={e => setMesaId(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
                  <option value="">Seleccionar mesa…</option>
                  {mesas.filter(m => !m.ocupada).map(m => (
                    <option key={m.mesa_id} value={m.mesa_id}>
                      {m.zona_nombre ? `[${m.zona_nombre}] ` : ''}{m.nombre} (#{m.numero})
                    </option>
                  ))}
                </select>
                {mesas.filter(m => m.ocupada).length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {mesas.filter(m => m.ocupada).length} mesa(s) ocupada(s) no mostradas
                  </p>
                )}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Mesero <span className="text-gray-400">(opcional)</span></label>
                  <select value={meseroId ?? ''} onChange={e => setMeseroId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
                    <option value="">{meseros.length === 0 ? 'Sin meseros configurados' : '— Sin asignar —'}</option>
                    {meseros.map(m => (
                      <option key={m.mesero_id} value={m.mesero_id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {tipoDespacho === 'delivery' && (
              <div className="space-y-2">
                <input value={direccion} onChange={e => setDireccion(e.target.value)}
                  placeholder="Dirección de entrega *"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': accent } as React.CSSProperties} />
                {zones.length > 0 && (
                  <select value={zonaId ?? ''} onChange={e => setZonaId(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
                    {zones.map(z => (
                      <option key={z.delivery_zone_id} value={z.delivery_zone_id}>
                        {z.zone_name} — envío {sym}{Number(z.fee ?? 0).toFixed(2)}
                        {z.min_order_amount ? ` · mín ${sym}${Number(z.min_order_amount).toFixed(2)}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </section>

          {/* Método de pago */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Método de pago</h3>
            <div className="flex gap-2 flex-wrap">
              {paymentMethods.map(m => (
                <button key={m} onClick={() => setMetodoPago(m)}
                  className="px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all"
                  style={{
                    borderColor:     metodoPago === m ? accent : '#E5E7EB',
                    color:           metodoPago === m ? accent : '#6B7280',
                    backgroundColor: metodoPago === m ? `${accent}10` : 'white',
                  }}>
                  {PAYMENT_LABELS[m] ?? m}
                </button>
              ))}
            </div>
          </section>

          {/* Productos */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Productos</h3>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': accent } as React.CSSProperties} />

            {loadingMenu ? (
              <p className="text-sm text-gray-400 text-center py-4">Cargando menú…</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {filteredCats.map(cat => (
                  <div key={cat.menu_category_id}>
                    <p className="text-xs font-semibold text-gray-500 mb-1">{cat.name}</p>
                    <div className="space-y-1">
                      {cat.items.map(item =>
                        item.variants.map(v => {
                          const inCart = cart.find(l => l.menu_variant_id === v.menu_variant_id)
                          return (
                            <div key={v.menu_variant_id} className="bg-gray-50 rounded-xl overflow-hidden">
                              {/* Fila producto */}
                              <div className="flex items-center gap-2 px-3 py-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                                  {item.variants.length > 1 && (
                                    <p className="text-xs text-gray-400">{v.variant_name}</p>
                                  )}
                                </div>
                                <span className="text-xs font-semibold text-gray-600 shrink-0">
                                  {sym}{Number(v.price).toFixed(2)}
                                </span>
                                {inCart ? (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => updateQty(v.menu_variant_id, -1)}
                                      className="w-6 h-6 rounded-full border border-gray-300 text-sm flex items-center justify-center hover:bg-gray-200">−</button>
                                    <span className="text-sm font-bold w-4 text-center" style={{ color: accent }}>{inCart.quantity}</span>
                                    <button onClick={() => updateQty(v.menu_variant_id, 1)}
                                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm"
                                      style={{ backgroundColor: accent }}>+</button>
                                  </div>
                                ) : (
                                  <button onClick={() => addToCart(item, v)}
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm shrink-0"
                                    style={{ backgroundColor: accent }}>+</button>
                                )}
                              </div>
                              {/* Extras inline — solo si el item está en carrito y tiene extras */}
                              {inCart && inCart.availableExtras.length > 0 && (
                                <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                                  {inCart.availableExtras.map(e => {
                                    const selected = inCart.selectedExtras.some(s => s.extra_id === e.extra_id)
                                    return (
                                      <button
                                        key={e.extra_id}
                                        onClick={() => toggleExtra(v.menu_variant_id, e)}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all"
                                        style={{
                                          borderColor:     selected ? accent : '#D1D5DB',
                                          color:           selected ? accent : '#6B7280',
                                          backgroundColor: selected ? `${accent}15` : 'white',
                                          fontWeight:      selected ? 600 : 400,
                                        }}
                                      >
                                        {selected ? '✓ ' : '+ '}{e.name}
                                        {e.price > 0 && ` +${sym}${e.price.toFixed(2)}`}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                ))}
                {filteredCats.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No se encontraron productos.</p>
                )}
              </div>
            )}
          </section>

          {/* Notas */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Notas (opcional)</h3>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Sin cebolla, alergia al gluten…"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
              style={{ '--tw-ring-color': accent } as React.CSSProperties} />
          </section>

          {/* Resumen carrito */}
          {cart.length > 0 && (
            <section className="bg-gray-50 rounded-2xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Resumen</p>
              {cart.map(l => (
                <div key={l.menu_variant_id}>
                  <div className="flex justify-between text-sm text-gray-700">
                    <span className="truncate flex-1">
                      {l.quantity}× {l.item_name}{l.variant_name !== l.item_name ? ` (${l.variant_name})` : ''}
                    </span>
                    <span className="font-medium ml-2 shrink-0">{sym}{lineTotal(l).toFixed(2)}</span>
                  </div>
                  {l.selectedExtras.length > 0 && (
                    <p className="text-xs text-gray-400 ml-4 mt-0.5">
                      + {l.selectedExtras.map(e => e.name).join(', ')}
                    </p>
                  )}
                </div>
              ))}
              <div className="border-t border-gray-200 pt-1.5 mt-1.5 space-y-0.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Subtotal</span><span>{fmt(subtotal)}</span>
                </div>
                {tipoDespacho === 'delivery' && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Envío</span><span>{fmt(costoEnvio)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-gray-900">
                  <span>Total</span><span style={{ color: accent }}>{fmt(total)}</span>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={handleCreate}
            disabled={saving || cart.length === 0}
            className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {saving ? 'Creando pedido…' : `Crear pedido · ${fmt(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
