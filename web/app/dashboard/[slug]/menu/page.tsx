'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthFetch } from '@/lib/hooks/useAuthFetch'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  menu_category_id: number
  name: string
  sort_order: number | null
  is_active: boolean
}

interface Item {
  menu_item_id: number
  menu_category_id: number
  name: string
  description: string | null
  is_pizza: boolean
  is_active: boolean
  tags: string | null
}

interface Variant {
  menu_variant_id: number
  menu_item_id: number
  variant_name: string
  price: number
  sku: string | null
  is_default: boolean
  is_active: boolean
}

interface Extra {
  extra_id: number
  name: string
  price: number
  allergens: string | null
  is_active: boolean
}

type Tab = 'productos' | 'extras'

const PRIMARY = '#F3274C'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number) {
  return '€' + n.toFixed(2).replace('.', ',')
}

function Badge({ active }: { active: boolean }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
      {active ? 'activo' : 'inactivo'}
    </span>
  )
}

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-red-500' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-6 sm:pb-0" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// ─── Input helpers ────────────────────────────────────────────────────────────

function InputField({ label, value, onChange, placeholder, maxLength, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; maxLength?: number; type?: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
      />
    </div>
  )
}

function TextareaField({ label, value, onChange, placeholder, maxLength }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={2}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white resize-none"
      />
    </div>
  )
}

// ─── Category Form Modal ──────────────────────────────────────────────────────

function CategoryModal({
  initial, onSave, onClose,
}: {
  initial?: Category
  onSave: (data: { name: string; sort_order: number | null; is_active: boolean }) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [sortOrder, setSortOrder] = useState(initial?.sort_order?.toString() ?? '')
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!name.trim()) { setErr('El nombre es obligatorio'); return }
    setSaving(true); setErr('')
    try {
      await onSave({
        name: name.trim(),
        sort_order: sortOrder !== '' ? parseInt(sortOrder, 10) : null,
        is_active: isActive,
      })
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={initial ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <InputField label="Nombre" value={name} onChange={setName} maxLength={100} required />
        <InputField label="Orden (opcional)" value={sortOrder} onChange={setSortOrder} type="number" placeholder="0, 1, 2…" />
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Activa</span>
          <ToggleSwitch value={isActive} onChange={setIsActive} />
        </div>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 rounded-xl py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: PRIMARY }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Item Form Modal ──────────────────────────────────────────────────────────

function ItemModal({
  initial, categories, onSave, onClose,
}: {
  initial?: Item
  categories: Category[]
  onSave: (data: Partial<Item>) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [categoryId, setCategoryId] = useState<number>(initial?.menu_category_id ?? (categories[0]?.menu_category_id ?? 0))
  const [isPizza, setIsPizza] = useState(initial?.is_pizza ?? false)
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [tags, setTags] = useState(initial?.tags ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!name.trim()) { setErr('El nombre es obligatorio'); return }
    if (!categoryId) { setErr('Selecciona una categoría'); return }
    setSaving(true); setErr('')
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        menu_category_id: categoryId,
        is_pizza: isPizza,
        is_active: isActive,
        tags: tags.trim() || null,
      })
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={initial ? 'Editar producto' : 'Nuevo producto'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <InputField label="Nombre" value={name} onChange={setName} maxLength={150} required />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Categoría<span className="text-red-500 ml-0.5">*</span></label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(Number(e.target.value))}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
          >
            <option value={0} disabled>Seleccionar…</option>
            {categories.filter(c => c.is_active).map(c => (
              <option key={c.menu_category_id} value={c.menu_category_id}>{c.name}</option>
            ))}
          </select>
        </div>
        <TextareaField label="Descripción" value={description} onChange={setDescription} maxLength={500} />
        <InputField label="Tags (separados por coma)" value={tags} onChange={setTags} placeholder="pizza, sin gluten, picante" maxLength={300} />
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Es pizza</span>
          <ToggleSwitch value={isPizza} onChange={setIsPizza} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Activo</span>
          <ToggleSwitch value={isActive} onChange={setIsActive} />
        </div>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 rounded-xl py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: PRIMARY }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Variant Form Modal ───────────────────────────────────────────────────────

function VariantModal({
  initial, onSave, onClose,
}: {
  initial?: Variant
  onSave: (data: Partial<Variant>) => Promise<void>
  onClose: () => void
}) {
  const [variantName, setVariantName] = useState(initial?.variant_name ?? '')
  const [price, setPrice] = useState(initial?.price?.toString() ?? '0')
  const [sku, setSku] = useState(initial?.sku ?? '')
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false)
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!variantName.trim()) { setErr('El nombre es obligatorio'); return }
    const p = parseFloat(price)
    if (isNaN(p) || p < 0) { setErr('El precio debe ser ≥ 0'); return }
    setSaving(true); setErr('')
    try {
      await onSave({ variant_name: variantName.trim(), price: p, sku: sku.trim() || null, is_default: isDefault, is_active: isActive })
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={initial ? 'Editar variante' : 'Nueva variante'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <InputField label="Nombre de variante" value={variantName} onChange={setVariantName} placeholder="Pequeña, Mediana, Familiar…" maxLength={80} required />
        <InputField label="Precio (€)" value={price} onChange={setPrice} type="number" placeholder="0.00" />
        <InputField label="SKU (opcional)" value={sku} onChange={setSku} maxLength={50} />
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Por defecto</span>
          <ToggleSwitch value={isDefault} onChange={setIsDefault} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Activa</span>
          <ToggleSwitch value={isActive} onChange={setIsActive} />
        </div>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 rounded-xl py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: PRIMARY }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Extra Form Modal ─────────────────────────────────────────────────────────

function ExtraModal({
  initial, onSave, onClose,
}: {
  initial?: Extra
  onSave: (data: Partial<Extra>) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [price, setPrice] = useState(initial?.price?.toString() ?? '0')
  const [allergens, setAllergens] = useState(initial?.allergens ?? '')
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!name.trim()) { setErr('El nombre es obligatorio'); return }
    const p = parseFloat(price)
    if (isNaN(p) || p < 0) { setErr('El precio debe ser ≥ 0'); return }
    setSaving(true); setErr('')
    try {
      await onSave({ name: name.trim(), price: p, allergens: allergens.trim() || null, is_active: isActive })
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={initial ? 'Editar extra' : 'Nuevo extra'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <InputField label="Nombre" value={name} onChange={setName} maxLength={120} required />
        <InputField label="Precio (€)" value={price} onChange={setPrice} type="number" placeholder="0.00" />
        <InputField label="Alérgenos (opcional)" value={allergens} onChange={setAllergens} maxLength={200} />
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Activo</span>
          <ToggleSwitch value={isActive} onChange={setIsActive} />
        </div>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 rounded-xl py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: PRIMARY }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Variants Sub-panel ───────────────────────────────────────────────────────

function VariantsPanel({ item, slug, authFetch }: { item: Item; slug: string; authFetch: ReturnType<typeof useAuthFetch> }) {
  const [variants, setVariants] = useState<Variant[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'new' | Variant | null>(null)
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${apiBase}/dashboard/${slug}/menu/items/${item.menu_item_id}/variants`)
      if (res.ok) {
        const data = await res.json() as { variants: Variant[] }
        setVariants(data.variants)
      }
    } finally {
      setLoading(false)
    }
  }, [item.menu_item_id, slug, apiBase, authFetch])

  useEffect(() => { load() }, [load])

  async function handleSave(data: Partial<Variant>) {
    const isEdit = modal !== null && modal !== 'new'
    const url = isEdit
      ? `${apiBase}/dashboard/${slug}/menu/items/${item.menu_item_id}/variants/${(modal as Variant).menu_variant_id}`
      : `${apiBase}/dashboard/${slug}/menu/items/${item.menu_item_id}/variants`
    const res = await authFetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (!res.ok) throw new Error('Error al guardar variante')
    await load()
  }

  async function handleDelete(v: Variant) {
    if (!confirm(`¿Eliminar variante "${v.variant_name}"?`)) return
    await authFetch(`${apiBase}/dashboard/${slug}/menu/items/${item.menu_item_id}/variants/${v.menu_variant_id}`, { method: 'DELETE' })
    await load()
  }

  if (loading) return <div className="py-3 text-center text-xs text-gray-400">Cargando variantes…</div>

  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Variantes</span>
        <button onClick={() => setModal('new')}
          className="text-xs font-semibold px-2 py-1 rounded-lg text-white"
          style={{ backgroundColor: PRIMARY }}>+ variante</button>
      </div>
      {variants.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Sin variantes — este producto tiene precio único</p>
      ) : (
        <div className="flex flex-col gap-1">
          {variants.map(v => (
            <div key={v.menu_variant_id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-800">{v.variant_name}</span>
                {v.is_default && <span className="text-[10px] font-semibold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">default</span>}
                <Badge active={v.is_active} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">{fmtPrice(v.price)}</span>
                <button onClick={() => setModal(v)} className="text-xs text-gray-400 hover:text-gray-700">✏</button>
                <button onClick={() => handleDelete(v)} className="text-xs text-gray-400 hover:text-red-500">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {modal !== null && (
        <VariantModal
          initial={modal === 'new' ? undefined : modal as Variant}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item, categories, slug, authFetch, onUpdate,
}: {
  item: Item; categories: Category[]; slug: string
  authFetch: ReturnType<typeof useAuthFetch>; onUpdate: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [modal, setModal] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''

  async function handleSave(data: Partial<Item>) {
    const res = await authFetch(`${apiBase}/dashboard/${slug}/menu/items/${item.menu_item_id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Error al guardar')
    onUpdate()
  }

  async function toggleActive() {
    setTogglingActive(true)
    try {
      await authFetch(`${apiBase}/dashboard/${slug}/menu/items/${item.menu_item_id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !item.is_active }),
      })
      onUpdate()
    } finally {
      setTogglingActive(false)
    }
  }

  return (
    <div className={`rounded-xl border transition-colors ${item.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setExpanded(e => !e)} className="text-gray-400 text-xs w-4 shrink-0">
          {expanded ? '▾' : '▸'}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${item.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{item.name}</span>
            {item.is_pizza && <span className="text-[10px] bg-orange-100 text-orange-600 font-semibold px-1.5 py-0.5 rounded-full">🍕 pizza</span>}
            <Badge active={item.is_active} />
          </div>
          {item.description && <p className="text-xs text-gray-400 truncate mt-0.5">{item.description}</p>}
          {item.tags && <p className="text-[10px] text-gray-300 mt-0.5">{item.tags}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ToggleSwitch value={item.is_active} onChange={toggleActive} />
          <button onClick={() => setModal(true)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-xs">✏</button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-3">
          <VariantsPanel item={item} slug={slug} authFetch={authFetch} />
        </div>
      )}
      {modal && (
        <ItemModal
          initial={item} categories={categories}
          onSave={handleSave} onClose={() => setModal(false)}
        />
      )}
    </div>
  )
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({
  category, items, categories, slug, authFetch, onUpdateCategory, onUpdateItems,
}: {
  category: Category; items: Item[]; categories: Category[]; slug: string
  authFetch: ReturnType<typeof useAuthFetch>
  onUpdateCategory: () => void; onUpdateItems: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [addItemModal, setAddItemModal] = useState(false)
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''

  async function handleCategorySave(data: { name: string; sort_order: number | null; is_active: boolean }) {
    const res = await authFetch(`${apiBase}/dashboard/${slug}/menu/categories/${category.menu_category_id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Error al guardar categoría')
    onUpdateCategory()
  }

  async function handleAddItem(data: Partial<Item>) {
    const res = await authFetch(`${apiBase}/dashboard/${slug}/menu/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try { const b = await res.json(); detail = b?.detail ?? b?.error ?? detail } catch {}
      throw new Error(detail)
    }
    onUpdateItems()
  }

  const catItems = items.filter(i => i.menu_category_id === category.menu_category_id)

  return (
    <div className={`rounded-2xl border ${category.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
      {/* Category header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-t-2xl">
        <button onClick={() => setCollapsed(c => !c)} className="text-gray-500 text-sm w-4 shrink-0">
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="flex-1 text-sm font-semibold text-gray-800">{category.name}</span>
        <span className="text-xs text-gray-400">{catItems.length} producto{catItems.length !== 1 ? 's' : ''}</span>
        <Badge active={category.is_active} />
        <button onClick={() => setEditModal(true)} className="text-xs text-gray-400 hover:text-gray-700 px-1">✏</button>
      </div>

      {/* Items */}
      {!collapsed && (
        <div className="p-3 flex flex-col gap-2">
          {catItems.length === 0 && (
            <p className="text-xs text-gray-400 italic text-center py-2">Sin productos en esta categoría</p>
          )}
          {catItems.map(item => (
            <ItemRow key={item.menu_item_id} item={item} categories={categories}
              slug={slug} authFetch={authFetch} onUpdate={onUpdateItems} />
          ))}
          <button
            onClick={() => setAddItemModal(true)}
            className="mt-1 w-full rounded-xl border border-dashed border-gray-300 py-2 text-xs text-gray-400 hover:border-red-300 hover:text-red-500 transition-colors"
          >
            + Agregar producto
          </button>
        </div>
      )}

      {editModal && (
        <CategoryModal initial={category} onSave={handleCategorySave} onClose={() => setEditModal(false)} />
      )}
      {addItemModal && (
        <ItemModal
          categories={categories}
          onSave={data => handleAddItem({ ...data, menu_category_id: category.menu_category_id })}
          onClose={() => setAddItemModal(false)}
        />
      )}
    </div>
  )
}

// ─── Extras Panel ─────────────────────────────────────────────────────────────

function ExtrasPanel({ slug, authFetch }: { slug: string; authFetch: ReturnType<typeof useAuthFetch> }) {
  const [extras, setExtras] = useState<Extra[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'new' | Extra | null>(null)
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${apiBase}/dashboard/${slug}/menu/extras`)
      if (res.ok) {
        const data = await res.json() as { extras: Extra[] }
        setExtras(data.extras)
      }
    } finally {
      setLoading(false)
    }
  }, [slug, apiBase, authFetch])

  useEffect(() => { load() }, [load])

  async function handleSave(data: Partial<Extra>) {
    const isEdit = modal !== null && modal !== 'new'
    const url = isEdit
      ? `${apiBase}/dashboard/${slug}/menu/extras/${(modal as Extra).extra_id}`
      : `${apiBase}/dashboard/${slug}/menu/extras`
    const res = await authFetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (!res.ok) throw new Error('Error al guardar extra')
    await load()
  }

  async function toggleActive(extra: Extra) {
    await authFetch(`${apiBase}/dashboard/${slug}/menu/extras/${extra.extra_id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !extra.is_active }),
    })
    await load()
  }

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Cargando extras…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-500">Ingredientes o complementos opcionales que se pueden añadir a cualquier producto.</p>
        <button onClick={() => setModal('new')}
          className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold text-white"
          style={{ backgroundColor: PRIMARY }}>+ Extra</button>
      </div>

      {extras.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">No hay extras configurados</div>
      ) : (
        <div className="flex flex-col gap-2">
          {extras.map(extra => (
            <div key={extra.extra_id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${extra.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{extra.name}</span>
                  <Badge active={extra.is_active} />
                </div>
                {extra.allergens && <p className="text-xs text-gray-400 mt-0.5">Alérgenos: {extra.allergens}</p>}
              </div>
              <span className="text-sm font-semibold text-gray-700 shrink-0">{fmtPrice(extra.price)}</span>
              <ToggleSwitch value={extra.is_active} onChange={() => toggleActive(extra)} />
              <button onClick={() => setModal(extra)} className="text-xs text-gray-400 hover:text-gray-700">✏</button>
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <ExtraModal
          initial={modal === 'new' ? undefined : modal as Extra}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MenuPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const authFetch = useAuthFetch()
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''

  const [tab, setTab] = useState<Tab>('productos')
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [loadingItems, setLoadingItems] = useState(true)
  const [addCatModal, setAddCatModal] = useState(false)

  const loadCategories = useCallback(async () => {
    setLoadingCats(true)
    try {
      const res = await authFetch(`${apiBase}/dashboard/${slug}/menu/categories`)
      if (res.ok) {
        const data = await res.json() as { categories: Category[] }
        setCategories(data.categories)
      }
    } finally {
      setLoadingCats(false)
    }
  }, [slug, apiBase, authFetch])

  const loadItems = useCallback(async () => {
    setLoadingItems(true)
    try {
      const res = await authFetch(`${apiBase}/dashboard/${slug}/menu/items`)
      if (res.ok) {
        const data = await res.json() as { items: Item[] }
        setItems(data.items)
      }
    } finally {
      setLoadingItems(false)
    }
  }, [slug, apiBase, authFetch])

  useEffect(() => {
    loadCategories()
    loadItems()
  }, [loadCategories, loadItems])

  async function handleAddCategory(data: { name: string; sort_order: number | null; is_active: boolean }) {
    const res = await authFetch(`${apiBase}/dashboard/${slug}/menu/categories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Error al crear categoría')
    await loadCategories()
  }

  const loading = loadingCats || loadingItems

  // Sort categories by sort_order then name
  const sortedCategories = [...categories].sort((a, b) => {
    const so = (a.sort_order ?? 999) - (b.sort_order ?? 999)
    return so !== 0 ? so : a.name.localeCompare(b.name)
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <div
          className="h-8 w-8 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ backgroundColor: PRIMARY }}
        >
          E
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-bold text-gray-900 leading-none">Menú</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <button onClick={() => router.push(`/dashboard/${slug}`)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors">
              ← pedidos
            </button>
            <span className="text-gray-200">|</span>
            <span className="text-xs text-gray-400 capitalize">{slug}</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-100 px-4 flex gap-1">
        {(['productos', 'extras'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors capitalize ${
              tab === t ? 'border-red-500 text-red-500' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* ── Productos tab ── */}
        {tab === 'productos' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-500">
                {loading ? 'Cargando…' : `${categories.length} categorías · ${items.length} productos`}
              </p>
              <button
                onClick={() => setAddCatModal(true)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-white"
                style={{ backgroundColor: PRIMARY }}
              >
                + Categoría
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : sortedCategories.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">🍽</p>
                <p className="text-sm font-semibold text-gray-700">Sin categorías todavía</p>
                <p className="text-xs text-gray-400 mt-1">Crea una categoría para empezar a agregar productos</p>
                <button
                  onClick={() => setAddCatModal(true)}
                  className="mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  + Nueva categoría
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sortedCategories.map(cat => (
                  <CategorySection
                    key={cat.menu_category_id}
                    category={cat}
                    items={items}
                    categories={categories}
                    slug={slug}
                    authFetch={authFetch}
                    onUpdateCategory={loadCategories}
                    onUpdateItems={loadItems}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Extras tab ── */}
        {tab === 'extras' && (
          <ExtrasPanel slug={slug} authFetch={authFetch} />
        )}
      </div>

      {addCatModal && (
        <CategoryModal onSave={handleAddCategory} onClose={() => setAddCatModal(false)} />
      )}
    </div>
  )
}
