// ─── Entidades base ──────────────────────────────────────────────────────────

export interface Business {
  id: number
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  brand_color: string | null
  address: string | null
  whatsapp_number: string
  is_open: boolean
  next_opening: string | null
  opening_hours: OpeningHours
  delivery_enabled: boolean
  pickup_enabled: boolean
  delivery_price: number
  delivery_min_order: number
  delivery_zones: DeliveryZone[]
  payment_methods: PaymentMethod[]
  estimated_time: number | null
}

export interface OpeningHours {
  [day: string]: { open: string; close: string } | null
}

export interface DeliveryZone {
  id: number
  name: string
  polygon?: GeoPolygon
}

export interface GeoPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'bizum' | 'online'

// ─── Menú ────────────────────────────────────────────────────────────────────

export interface MenuCategory {
  id: number
  name: string
  sort_order: number
  items: MenuItem[]
}

export interface MenuItem {
  id: number
  category_id: number
  name: string
  description: string | null
  base_price: number
  image_url: string | null
  is_active: boolean
  requires_variant: boolean
  variants: MenuVariant[]
  extras: Extra[]
}

export interface MenuVariant {
  id: number
  item_id: number
  name: string
  price: number
}

export interface Extra {
  id: number
  name: string
  price: number
}

// ─── Respuestas de endpoints públicos ────────────────────────────────────────

export interface RestaurantPublicResponse {
  business: Business
}

export interface MenuPublicResponse {
  business: Pick<Business, 'id' | 'slug' | 'name' | 'logo_url' | 'brand_color' | 'is_open' | 'next_opening' | 'delivery_min_order'>
  categories: MenuCategory[]
}

export interface MenuItemDetailResponse {
  item: MenuItem
}

// ─── Carrito (estado local — no viene del API) ────────────────────────────────

export interface CartItem {
  id: string
  menu_item_id: number
  name: string
  image_url: string | null
  variant: MenuVariant | null
  extras: Extra[]
  quantity: number
  unit_price: number
  total_price: number
}

export interface CartState {
  items: CartItem[]
  slug: string | null
}

// ─── Checkout ────────────────────────────────────────────────────────────────

export type DispatchType = 'delivery' | 'retiro'

export interface CheckoutCustomer {
  name: string
  phone: string
}

export interface CheckoutDispatch {
  type: DispatchType
  address: string | null
  zone_valid: boolean | null
  delivery_cost: number
}

export interface CheckoutPayment {
  method: PaymentMethod
}

export interface CheckoutState {
  customer: CheckoutCustomer | null
  dispatch: CheckoutDispatch | null
  payment: CheckoutPayment | null
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pendiente_pago'
  | 'confirmado'
  | 'en_preparacion'
  | 'listo_retiro'
  | 'en_camino'
  | 'entregado'
  | 'cancelado'

export interface OrderItem {
  id: number
  menu_item_id: number
  name: string
  variant_name: string | null
  extras: string[]
  quantity: number
  unit_price: number
  total_price: number
}

export interface Order {
  id: number
  order_code: string
  status: OrderStatus
  dispatch_type: DispatchType
  address: string | null
  payment_method: PaymentMethod
  subtotal: number
  delivery_cost: number
  total: number
  items: OrderItem[]
  created_at: string
  estimated_time: number | null
}

export interface CreateOrderPayload {
  customer_name: string
  customer_phone: string
  dispatch_type: DispatchType
  address: string | null
  payment_method: PaymentMethod
  items: {
    menu_item_id: number
    variant_id: number | null
    extra_ids: number[]
    quantity: number
  }[]
}

export interface CreateOrderResponse {
  order_code: string
  order_id: number
  status: OrderStatus
  whatsapp_url: string
}

export interface OrderStatusResponse {
  order: Order
  business: Pick<Business, 'name' | 'logo_url' | 'estimated_time' | 'whatsapp_number'>
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardOrdersResponse {
  orders: Order[]
  total: number
  page: number
  per_page: number
}

export interface UpdateOrderStatusPayload {
  status: OrderStatus
}

// ─── Errores API ─────────────────────────────────────────────────────────────

export interface ApiError {
  error: string
  code?: string
  details?: unknown
}
