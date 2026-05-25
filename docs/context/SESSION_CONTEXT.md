# EasyOrder — Contexto de sesión para nuevo chat

> Generado: 2026-05-03. Usar como punto de entrada para continuar el desarrollo.

---

## Estado actual del proyecto

**Branch:** `main`  
**Último commit:** `c427fc1` — `fix(public-menu): accent color from API + sticky nav + emoji placeholders`  
**TSC:** limpio (0 errores)  
**Deploy:** en EasyPanel/Hostinger. API en Node + Hono, frontend Next.js 14 App Router.

---

## Qué se ha construido hasta ahora

### Backend (`api/src/routes/`)

#### `public.ts` — endpoints públicos
- `GET /public/:slug/restaurant` — datos del restaurante (branding, horarios, métodos de pago)
- `GET /public/:slug/menu` — categorías + items + variantes + extras
- `POST /public/:slug/orders` — crear pedido + enviar WhatsApp
- `GET /public/:slug/orders/:code` — estado de pedido para cliente

**Patrón importante:** las columnas nuevas de M-13/M-14 (`eslogan`, `texto_banner`, `redes_sociales`, `theme_id`) se leen en una **query separada con `.catch(() => [])`** para que el sistema no crashee si las migraciones aún no se han aplicado.

#### `dashboard.ts` — endpoints del dashboard (requieren JWT Supabase)
- CRUD pedidos, actualizar estado, métricas, configuración del restaurante, clientes, escalaciones
- PATCH `/dashboard/:slug/settings` — acepta: `nombre`, `descripcion`, `address`, `phone`, `moneda`, `zona_horaria`, `delivery_enabled`, `pickup_enabled`, `delivery_price`, `delivery_min_order`, `estimated_time`, `whatsapp_number`, `payment_methods`, `datos_bancarios`, `is_open_override`, `mensaje_bienvenida`, `mensaje_cerrado`, `eslogan`, `texto_banner`, `brand_color`, `logo_url`, `redes_sociales`, `theme_id`
- **`theme_id`** se guarda con cast: `::public.theme_id_enum`
- **`redes_sociales`** se guarda como `tx.json(redesVal)` (JSONB)

#### Sub-rutas del dashboard (carpeta `api/src/routes/dashboard/`)
- `menu-categories.ts`, `menu-items.ts`, `menu-variants.ts`, `menu-extras.ts` — CRUD completo del menú
- `delivery-zones.ts` — zonas de delivery con polígonos GIS
- `hours.ts` — horarios por día de la semana
- `clientes.ts` — lista de clientes

---

### Frontend (`web/app/`)

#### Público `(public)/[slug]/`
- **`menu/page.tsx`** (Server Component) — fetch del restaurante + menú, pasa props a MenuView
- **`menu/MenuView.tsx`** (Client Component) — UI principal del menú:
  - Barra de marca sticky (logo, nombre, eslogan, brand_color)
  - Promo banner (`texto_banner`) dentro del header sticky
  - Banner "cerrado" dentro del header sticky
  - Tabs de categorías con iconos emoji (`getCatIcon()` por keyword)
  - Cards de productos con emoji placeholder si no hay imagen
  - CartSidebar
  - `SocialFooter` con SVGs inline para 10 redes sociales
- **`menu/producto/[item_id]/page.tsx`** (Client Component) — detalle de producto:
  - Lee `d.brand_color` de la API → estado `accent` (reemplazó hardcode `#E63946`)
  - Barra sticky superior con color del tema
  - Selección de variantes y extras con colores del tema
  - Placeholder emoji + gradiente sutil
- **`checkout/`** — flujo completo: datos del cliente → despacho → pago → confirmar
- **`pedido/estado/`** — seguimiento de pedido por código

#### Dashboard `dashboard/[slug]/`
- **`layout.tsx`** — sidebar con nav, logout, nombre del local
- **`page.tsx`** — pedidos en tiempo real con filtros (estado + fecha + lista/cards)
- **`metricas/page.tsx`** — analytics: ventas, pedidos, top productos, tendencias
- **`menu/page.tsx`** — CRUD completo del menú con categorías, items, variantes, extras
- **`configuracion/page.tsx`** — tabs: Branding | Config | Pago
  - **Tab Branding:** logo URL, eslogan, texto_banner, selector de 6 paletas, color hex personalizado, preview de barra de marca, inputs para 10 redes sociales
  - **Tab Config:** nombre, dirección, teléfono, horarios, delivery, zonas
  - **Tab Pago:** métodos de pago, datos bancarios por método

---

### Tipos compartidos

#### `web/types/api.ts`
```typescript
export interface RestaurantPublicResponse {
  id, slug, name, description, logo_url, brand_color,
  eslogan: string | null,
  texto_banner: string | null,
  redes_sociales: RedSocial[] | null,
  theme_id: string | null,
  address, phone, moneda, zona_horaria,
  delivery_enabled, pickup_enabled, delivery_min_order,
  payment_methods, datos_bancarios,
  is_open, is_open_override, next_opening,
  mensaje_bienvenida, mensaje_cerrado, horario_hoy
}

export interface RedSocial {
  red: string  // instagram | tiktok | facebook | twitter | youtube | whatsapp | telegram | linkedin | pinterest | web
  url: string
}
```

#### `web/lib/themes.ts` (NUEVO)
6 paletas de color para multi-tenant:
- `indigo` (#6366F1) — default
- `emerald` (#10B981)
- `rose` (#F43F5E)
- `amber` (#F59E0B)
- `violet` (#8B5CF6)
- `sky` (#0EA5E9)

Exports: `ThemeId`, `ThemeTokens`, `THEMES`, `THEME_LIST`, `DEFAULT_THEME_ID`, `getTheme()`

---

### Migraciones DB (`docs/db/migrations/`)

| Archivo | Estado | Descripción |
|---------|--------|-------------|
| `001_fase1_recibido.sql` | ✅ aplicada | estado `recibido` en enum pedido_estado |
| `002_estado_pago.sql` | ✅ aplicada | estado `pendiente_pago` |
| `003_fix_estados_reutilizables.sql` | ✅ aplicada | fix estados reutilizables |
| `M-10_estado_log_config.sql` | ✅ aplicada | tabla `pedido_estado_log`, config keys |
| `M-11_notas_jsonb.sql` | ✅ aplicada | notas como JSONB |
| `M-12_fn_menu_extras_json.sql` | ✅ aplicada | extras con extra_id en funciones de menú |
| `M-6` a `M-9` | ✅ aplicadas | delivery zones, horarios, memberships, sequences |
| **`M-13_theme_id_restaurante.sql`** | ⚠️ **PENDIENTE** | ENUM `theme_id_enum` + columna `theme_id` |
| **`M-14_branding_restaurante.sql`** | ⚠️ **PENDIENTE** | columnas `eslogan`, `texto_banner`, `redes_sociales` |

**Las migraciones M-13 y M-14 DEBEN aplicarse en producción.** El sistema ya está preparado para no crashear sin ellas (queries con `.catch()`), pero hasta que se apliquen, la configuración de branding no persistirá.

Para aplicarlas:
```bash
psql -h <host> -U <user> -d <db> -f docs/db/migrations/M-13_theme_id_restaurante.sql
psql -h <host> -U <user> -d <db> -f docs/db/migrations/M-14_branding_restaurante.sql
```

---

## Tareas pendientes (ordenadas por prioridad)

### 🔴 Alta prioridad

#### 1. Aplicar M-13 y M-14 en producción
- Sin esto, el branding (eslogan, banner, redes, theme) no se guarda.
- No requiere código — solo ejecutar los SQL en la base de datos.

#### 2. Imágenes de productos en el menú público
- Actualmente: los items sin `image_url` muestran emoji placeholder.
- El problema real: la tabla `menu_item` ya tiene `image_url`, pero no hay UI para subir imágenes desde el dashboard.
- **Propuesta técnica pendiente de definir:** ¿Supabase Storage? ¿Upload directo al VPS? ¿URL externa por item?
- Cuando se defina, requiere:
  - Endpoint API: `POST /dashboard/:slug/menu/items/:id/image` (multipart o URL)
  - UI en el CRUD del menú para asociar imagen a cada item

#### 3. Verificar que `configuracion/page.tsx` carga branding correctamente post-M-13/M-14
- La página ya tiene el código completo para mostrar y guardar branding.
- Cuando las migraciones estén aplicadas, hay que probar que el GET /settings devuelve los campos y el PATCH los persiste.

---

### 🟡 Media prioridad

#### 4. Multi-tenant onboarding ("Opción B" pendiente del usuario)
- Flujo para que un nuevo restaurante se registre en EasyOrder.
- Requiere: página de registro, creación de fila en `restaurante`, asignación de slug único, invitación de usuario Supabase.
- Pendiente de diseñar.

#### 5. Subida de logo desde el dashboard
- Actualmente: el campo `logo_url` es solo texto (URL externa).
- Mejorar: input de archivo con upload real a storage.

#### 6. Vista previa del menú desde el dashboard
- Botón "Ver menú" en el sidebar del dashboard que abra `/:slug/menu` en una nueva pestaña.
- Trivial de implementar.

#### 7. Zona de delivery en checkout — validación de polígono GIS
- El checkout web actualmente acepta cualquier dirección para delivery.
- Validar contra `delivery_zones` (polígonos JSONB en la DB) antes de confirmar.

---

### 🟢 Baja prioridad / Post-MVP

#### 8. Mejoras UX al checkout
- Autocompletar dirección con Google Maps / Mapbox.
- Mostrar costo de envío dinámico según zona.

#### 9. Notificaciones push para el dashboard
- El dashboard ya hace polling. Reemplazar con WebSocket o SSE para tiempo real.

#### 10. App móvil / PWA
- El menú público ya es responsive. Agregar manifest + service worker para PWA.

#### 11. Panel de administración multi-tenant (`dashboard/admin/`)
- Ya existe la página vacía `web/app/dashboard/admin/page.tsx`.
- Pendiente de implementar: lista de todos los restaurantes, métricas globales, gestión de usuarios.

---

## Arquitectura de referencia rápida

```
VPS Hostinger / EasyPanel
├── API (Node + Hono + TypeScript)          puerto 3001
│   ├── /public/:slug/*                     sin auth
│   └── /dashboard/:slug/*                  JWT Supabase
├── Web (Next.js 14 App Router)             puerto 3000
│   ├── /(public)/[slug]/menu               menú digital por local
│   └── /dashboard/[slug]/*                 dashboard del negocio
├── PostgreSQL                              base principal
├── Redis                                   buffer de mensajes n8n
├── n8n                                     agente WhatsApp (en pruebas)
├── Chatwoot                                entrada WhatsApp
└── Supabase                                Auth (JWT)
```

**URL del menú público:** `https://ai2nomous.com/{slug}/menu`  
**URL del dashboard:** `https://ai2nomous.com/dashboard/{slug}`

---

## Reglas de trabajo obligatorias (del CLAUDE.md)

1. Antes de proponer cambios, indicar: qué componente toca, qué reutiliza, qué tablas toca, qué riesgo introduce, si es MVP o post-MVP.
2. No inventar endpoints ni tablas sin proponerlos explícitamente.
3. Las queries a columnas nuevas deben usar `.catch(() => [])` hasta confirmar que la migración está aplicada en prod.
4. No romper el flujo operativo actual de La Isla Pizzería.
5. Cambios incrementales, compatibles y reversibles.

---

## Patrones de código importantes

### Query tolerante a columna inexistente (backend)
```typescript
const brandingRows = await sql<{ eslogan: string|null; texto_banner: string|null }[]>`
  SELECT eslogan, texto_banner FROM restaurante WHERE id = ${id} LIMIT 1
`.catch(() => [] as { eslogan: null; texto_banner: null }[])
const eslogan = brandingRows[0]?.eslogan ?? null
```

### Leer brand_color en página de producto (frontend)
```typescript
const [accent, setAccent] = useState('#6366F1')
// En el .then() del fetch:
setAccent(d.brand_color ?? '#6366F1')
```

### cast de ENUM en PostgreSQL (backend)
```typescript
await tx`UPDATE restaurante SET theme_id = ${themeIdVal}::public.theme_id_enum WHERE id = ${id}`
```

---

## Archivos clave para revisar al arrancar

- `api/src/routes/public.ts` — endpoint público del menú y restaurante
- `api/src/routes/dashboard.ts` — configuración y pedidos del dashboard
- `web/app/(public)/[slug]/menu/MenuView.tsx` — UI principal del menú
- `web/app/(public)/[slug]/menu/producto/[item_id]/page.tsx` — detalle de producto
- `web/app/dashboard/[slug]/configuracion/page.tsx` — configuración de branding
- `web/lib/themes.ts` — paletas de color
- `web/types/api.ts` — tipos TypeScript compartidos
