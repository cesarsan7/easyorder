import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface CartItemExtra {
  id: number
  name: string
  price: number
}

export interface CartItem {
  itemId: number
  itemName: string
  variantId: number | null
  variantName: string | null
  extras: CartItemExtra[]
  qty: number
  unitPrice: number
}

export type DispatchType = 'delivery' | 'pickup'

interface CartState {
  items: CartItem[]
  customerName: string
  customerPhone: string
  dispatchType: DispatchType | null
  address: string
  deliveryCost: number
  zoneId: number | null
  zoneName: string | null
  estimatedMinutesMin: number | null
  estimatedMinutesMax: number | null
  paymentMethod: string | null
  orderId: string | null
  moneda: string
}

export interface ZoneInfo {
  id: number
  name: string
  estMin: number | null
  estMax: number | null
}

interface CartActions {
  addItem: (item: Omit<CartItem, 'qty'> & { qty?: number }) => void
  removeItem: (itemId: number, variantId: number | null, extras: CartItemExtra[]) => void
  updateQty: (itemId: number, variantId: number | null, extras: CartItemExtra[], qty: number) => void
  clearCart: () => void
  setCustomer: (name: string, phone: string) => void
  setDispatch: (type: DispatchType, address: string, cost: number, zone?: ZoneInfo | null) => void
  setPaymentMethod: (method: string) => void
  setOrderId: (id: string) => void
  setMoneda: (moneda: string) => void
  subtotal: () => number
  total: () => number
  itemCount: () => number
  isCartEmpty: () => boolean
}

type CartStore = CartState & CartActions

const initialState: CartState = {
  items: [],
  customerName: '',
  customerPhone: '',
  dispatchType: null,
  address: '',
  deliveryCost: 0,
  zoneId: null,
  zoneName: null,
  estimatedMinutesMin: null,
  estimatedMinutesMax: null,
  paymentMethod: null,
  orderId: null,
  moneda: 'CLP',
}

function itemKey(itemId: number, variantId: number | null, extras: CartItemExtra[]): string {
  const extraIds = [...extras].sort((a, b) => a.id - b.id).map((e) => e.id).join(',')
  return `${itemId}:${variantId ?? 'none'}:${extraIds}`
}

function isSameItem(
  a: CartItem,
  itemId: number,
  variantId: number | null,
  extras: CartItemExtra[],
): boolean {
  return itemKey(a.itemId, a.variantId, a.extras) === itemKey(itemId, variantId, extras)
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      addItem: (incoming) => {
        const { qty = 1, ...rest } = incoming
        set((state) => {
          const idx = state.items.findIndex((i) =>
            isSameItem(i, rest.itemId, rest.variantId, rest.extras),
          )
          if (idx !== -1) {
            const updated = [...state.items]
            updated[idx] = { ...updated[idx], qty: updated[idx].qty + qty }
            return { items: updated }
          }
          return { items: [...state.items, { ...rest, qty }] }
        })
      },

      removeItem: (itemId, variantId, extras) => {
        set((state) => ({
          items: state.items.filter((i) => !isSameItem(i, itemId, variantId, extras)),
        }))
      },

      updateQty: (itemId, variantId, extras, qty) => {
        if (qty <= 0) {
          get().removeItem(itemId, variantId, extras)
          return
        }
        set((state) => ({
          items: state.items.map((i) =>
            isSameItem(i, itemId, variantId, extras) ? { ...i, qty } : i,
          ),
        }))
      },

      clearCart: () => set(initialState),

      setCustomer: (name, phone) => set({ customerName: name, customerPhone: phone }),

      setDispatch: (type, address, cost, zone) =>
        set({
          dispatchType:        type,
          address,
          deliveryCost:        cost,
          zoneId:              zone?.id              ?? null,
          zoneName:            zone?.name            ?? null,
          estimatedMinutesMin: zone?.estMin          ?? null,
          estimatedMinutesMax: zone?.estMax          ?? null,
        }),

      setPaymentMethod: (method) => set({ paymentMethod: method }),

      setMoneda: (moneda) => set({ moneda }),

      setOrderId: (id) => set({ orderId: id }),

      subtotal: () =>
        get().items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0),

      total: () => get().subtotal() + get().deliveryCost,

      itemCount: () => get().items.reduce((sum, i) => sum + i.qty, 0),

      isCartEmpty: () => get().items.length === 0,
    }),
    {
      name: 'easyorder-cart',
      // Guard SSR: sessionStorage no existe en Node.js.
      // persist lo ignora si el storage devuelve undefined.
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? sessionStorage : undefined as unknown as Storage,
      ),
    },
  ),
)
