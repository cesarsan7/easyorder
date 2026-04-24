# Rutas y Autenticacion — EasyOrder MVP
**Fecha:** 2026-04-20
**Fuentes:** `docs/design/04_roles_y_permisos.md`, `docs/design/05_tabla_membresias.md`, `docs/design/03_tabla_businesses.md`, `docs/business/objetivo_MVP_EasyOrder.md`
**Alcance:** MVP. Next.js App Router. Multi-tenant por slug. Supabase Auth para panel admin.

---

## Premisas del modelo de rutas

1. El cliente final no se autentica. Accede al menu publico por URL directa o QR.
2. El panel admin es privado. Solo acceden `owner`, `staff` y `platform_admin`.
3. El aislamiento de tenant se enforcea por `business_id` en el JWT (`app_metadata`), no por subdominio en MVP. El subdominio puede venir en post-MVP.
4. El slug del negocio (`businesses.slug`) es el identificador de URL publica. Ejemplo: `/la-isla-pizzeria/menu`.
5. Las rutas del dashboard usan `/dashboard` como prefijo, sin slug — el tenant se infiere del JWT.
6. El `platform_admin` accede a un area separada `/admin` — no comparte ruta con el dashboard de los locales.

---

## Rutas Publicas

Sin autenticacion. Accesibles por cualquier usuario sin sesion.

| Ruta | Tipo | Rol minimo | Notas |
|---|---|---|---|
| `/` | Pagina | Ninguno | Landing de EasyOrder. Descripcion del producto, CTA para locales. |
| `/[slug]` | Pagina | Ninguno | Redirect a `/[slug]/menu`. Punto de entrada del local via QR o link. |
| `/[slug]/menu` | Pagina | Ninguno | Carta digital del local. Categorias, items, precios, fotos. Solo lectura. |
| `/[slug]/menu/[category_id]` | Pagina | Ninguno | Vista de categoria especifica. Filtrado de items por categoria. Post-MVP si el menu es grande. |
| `/[slug]/cart` | Pagina | Ninguno | Carrito del cliente. Resumen de seleccion antes de confirmar. Session storage local. |
| `/[slug]/checkout` | Pagina | Ninguno | Formulario de confirmacion. Nombre, telefono, tipo (retiro/delivery), direccion si aplica. |
| `/[slug]/checkout/confirm` | Pagina | Ninguno | Pantalla de confirmacion post-envio. Muestra resumen y link al WhatsApp del local. |
| `/login` | Pagina | Ninguno | Login del panel admin. Email + password via Supabase Auth. |
| `/register` | Pagina | Ninguno | Registro de nuevo local. Nombre, email, password. Solo para onboarding inicial; en MVP puede ser manual o semi-manual. |

### Notas sobre rutas publicas

- `/[slug]/cart` y `/[slug]/checkout` no requieren login. El estado del carrito vive en `localStorage` o `sessionStorage` del browser del cliente.
- En `/[slug]/checkout`, los datos del cliente (nombre, telefono) se capturan en el formulario. No hay cuenta de cliente.
- El flujo de confirmacion en `/[slug]/checkout/confirm` genera el mensaje estructurado y redirige al WhatsApp del local. No hace POST a n8n directamente desde el browser — pasa por una API route de Next.js que valida y formatea el mensaje.
- Si el slug no existe en `businesses`, retornar 404 con pagina de error clara.
- Si el local tiene `is_active = false`, mostrar pagina de "local no disponible" en lugar de la carta.

---

## Rutas Privadas

Requieren sesion valida de Supabase Auth. Si no hay sesion, redirigir a `/login`.

### Panel del local (owner y staff)

El tenant se infiere del `business_id` en el JWT. No se expone en la URL.

| Ruta | Tipo | Rol minimo | Notas |
|---|---|---|---|
| `/dashboard` | Pagina | `staff` | Inicio del panel. Resumen: pedidos activos, estado del local, alertas. Redirect desde `/` si hay sesion. |
| `/dashboard/orders` | Pagina | `staff` | Lista de pedidos del local. Filtros por estado, fecha. Tiempo real via polling o Supabase Realtime. |
| `/dashboard/orders/[order_id]` | Pagina | `staff` | Detalle de un pedido especifico. Cambio de estado (staff: preparando/listo/entregado; owner: ademas cancelar). |
| `/dashboard/menu` | Pagina | `owner` | Gestion del menu. Lista de categorias e items. |
| `/dashboard/menu/categories` | Pagina | `owner` | CRUD de categorias. Orden, visibilidad. |
| `/dashboard/menu/items` | Pagina | `owner` | CRUD de items. Precio, descripcion, foto, disponibilidad. |
| `/dashboard/menu/items/[item_id]` | Pagina | `owner` | Edicion de un item especifico. Variantes y extras incluidos. |
| `/dashboard/menu/items/new` | Pagina | `owner` | Formulario de creacion de nuevo item. |
| `/dashboard/availability` | Pagina | `staff` | Toggle de disponibilidad de items. Unica accion de menu permitida a staff. |
| `/dashboard/schedule` | Pagina | `owner` | Gestion de horarios del local. Dias y franjas horarias. |
| `/dashboard/delivery` | Pagina | `owner` | Zonas de delivery: nombre, precio, minimo de pedido. |
| `/dashboard/customers` | Pagina | `owner` | Lista de clientes del local. Nombre, telefono, historial de pedidos. |
| `/dashboard/metrics` | Pagina | `owner` | Metricas basicas: pedidos totales, facturacion, items mas pedidos. |
| `/dashboard/settings` | Pagina | `owner` | Configuracion del local: nombre, descripcion, WhatsApp, metodo de pago, moneda, timezone. |
| `/dashboard/settings/business` | Pagina | `owner` | Datos del negocio (subset de `restaurante` + `businesses`). |
| `/dashboard/settings/payments` | Pagina | `owner` | Metodos de pago aceptados. Datos de transferencia si aplica. |
| `/dashboard/settings/notifications` | Pagina | `owner` | Configuracion de alertas (post-MVP). En MVP puede no existir. |
| `/dashboard/profile` | Pagina | `owner` | Datos del usuario autenticado: email, cambio de password via Supabase Auth. |

### Panel de plataforma (solo platform_admin)

Ruta separada del dashboard del local. El `platform_admin` no usa `/dashboard`.

| Ruta | Tipo | Rol minimo | Notas |
|---|---|---|---|
| `/admin` | Pagina | `platform_admin` | Inicio del panel de plataforma. Lista de locales registrados. En MVP puede no construirse — acceso directo a DB y n8n. |
| `/admin/businesses` | Pagina | `platform_admin` | Lista de todos los tenants: nombre, slug, plan, estado. |
| `/admin/businesses/[business_id]` | Pagina | `platform_admin` | Detalle de un tenant. Editar `is_active`, `plan`. Ver pedidos globales. Post-MVP. |
| `/admin/users` | Pagina | `platform_admin` | Usuarios Supabase Auth. Crear owner, desactivar cuenta. Post-MVP. |

> Las rutas `/admin/*` son post-MVP en su forma de UI. En MVP, el `platform_admin` opera via Supabase Dashboard y acceso directo a PostgreSQL.

---

## Reglas de redireccion

| Situacion | Comportamiento |
|---|---|
| Usuario sin sesion accede a `/dashboard/*` | Redirect a `/login?next=/dashboard` |
| Usuario sin sesion accede a `/admin/*` | Redirect a `/login?next=/admin` |
| Usuario `staff` accede a `/dashboard/menu` (ruta de owner) | Redirect a `/dashboard` con mensaje de acceso denegado (403) |
| Usuario `owner` accede a `/admin/*` | Redirect a `/dashboard` (403) |
| Usuario autenticado accede a `/login` | Redirect a `/dashboard` si `role` es `owner` o `staff`, o a `/admin` si es `platform_admin` |
| Slug no existe en `businesses` | 404 con pagina de error publica |
| Local con `is_active = false` accede cualquier cliente | Pagina publica de "local no disponible" en `/[slug]` y `/[slug]/menu` |
| Usuario `owner` intenta ver datos de otro tenant | 403. El filtro por `business_id` del JWT bloquea la query. Ver seccion de aislamiento. |
| Token de sesion expirado en panel | Supabase Auth renueva automaticamente si hay refresh token valido; si no, redirect a `/login` |

---

## Aislamiento de tenant: ¿puede un usuario de un local ver datos de otro?

**No. El aislamiento es obligatorio y se enforcea en dos capas.**

### Capa 1 — Middleware de Next.js

El archivo `middleware.ts` en la raiz del proyecto intercepta toda request a `/dashboard/*` y `/admin/*`:

1. Verifica que haya sesion valida de Supabase Auth.
2. Lee el `app_metadata` del JWT: `role` y `business_id`.
3. Si `role` es `owner` o `staff`, el `business_id` del JWT es el unico tenant al que tiene acceso. Se inyecta en el contexto de la request como header interno (ej: `x-business-id`).
4. Si `role` es `platform_admin`, no hay restriccion de `business_id`.
5. Si el JWT no tiene `business_id` y el rol no es `platform_admin`, se rechaza la request con 403.

### Capa 2 — Backend / API Routes

Toda API route de Next.js que retorne datos del negocio aplica el filtro:

```
WHERE business_id = <business_id_del_JWT>
```

Este filtro se aplica sobre las queries que usan `businesses.id` directamente, o indirectamente via `restaurante_id → restaurante.id → businesses.id`.

No se acepta un `business_id` del cliente (body o query param) para operaciones privadas. El `business_id` siempre viene del JWT verificado en el servidor. Esto elimina el vector de ataque de un owner que intenta queryear datos de otro tenant cambiando un parametro.

### Row Level Security (RLS) — estado y plan

**En MVP: RLS no esta activo en las tablas del sistema actual** (`pedidos`, `usuarios`, `menu_category`, etc.). La razon es que esas tablas usan `restaurante_id` como FK de tenant, y agregar RLS sobre ellas requiere una funcion `auth.uid()` que mapee al `restaurante_id` correcto — lo cual agrega complejidad al esquema actual sin ser estrictamente necesario si el backend filtra correctamente.

**En la tabla `businesses` y `business_members` (nuevas):** se recomienda activar RLS desde el inicio, ya que son tablas nuevas sin queries legacy que pueda romper.

Politica RLS propuesta para `businesses` (post-MVP o en cuanto haya mas de un tenant):

```sql
-- Un owner solo puede ver su propio business
CREATE POLICY "owner_sees_own_business"
ON businesses
FOR SELECT
USING (
  id = (auth.jwt() -> 'app_metadata' ->> 'business_id')::uuid
  OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
);
```

Politica RLS propuesta para `business_members`:

```sql
-- Un usuario solo ve sus propias membresías
CREATE POLICY "member_sees_own_memberships"
ON business_members
FOR SELECT
USING (
  user_id = auth.uid()
  OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
);
```

**Decision de MVP:** activar RLS en `businesses` y `business_members` desde el inicio. No activar RLS en tablas legacy (`pedidos`, `usuarios`, `restaurante`, etc.) — el aislamiento en esas tablas se delega al backend API.

---

## Implementacion en Next.js App Router

### Estructura de carpetas relevante

```
app/
  (public)/
    page.tsx                        -- /  (landing)
    login/page.tsx                  -- /login
    register/page.tsx               -- /register
    [slug]/
      page.tsx                      -- /[slug]  (redirect a menu)
      menu/
        page.tsx                    -- /[slug]/menu
        [category_id]/page.tsx      -- /[slug]/menu/[category_id]
      cart/page.tsx                 -- /[slug]/cart
      checkout/
        page.tsx                    -- /[slug]/checkout
        confirm/page.tsx            -- /[slug]/checkout/confirm
  (dashboard)/
    layout.tsx                      -- layout con verificacion de sesion y rol
    dashboard/
      page.tsx                      -- /dashboard
      orders/
        page.tsx                    -- /dashboard/orders
        [order_id]/page.tsx         -- /dashboard/orders/[order_id]
      menu/
        page.tsx                    -- /dashboard/menu
        categories/page.tsx
        items/
          page.tsx
          new/page.tsx
          [item_id]/page.tsx
      availability/page.tsx
      schedule/page.tsx
      delivery/page.tsx
      customers/page.tsx
      metrics/page.tsx
      settings/
        page.tsx
        business/page.tsx
        payments/page.tsx
      profile/page.tsx
  (admin)/
    layout.tsx                      -- layout con verificacion role = platform_admin
    admin/
      page.tsx
      businesses/
        page.tsx
        [business_id]/page.tsx
      users/page.tsx
middleware.ts                       -- intercepta /dashboard/* y /admin/*
```

### Como funciona el middleware

```typescript
// middleware.ts — logica simplificada
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'

export async function middleware(req) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  const path = req.nextUrl.pathname
  const isDashboard = path.startsWith('/dashboard')
  const isAdmin = path.startsWith('/admin')

  if (!session && (isDashboard || isAdmin)) {
    return NextResponse.redirect(new URL(`/login?next=${path}`, req.url))
  }

  if (session) {
    const role = session.user.app_metadata?.role
    const businessId = session.user.app_metadata?.business_id

    if (isAdmin && role !== 'platform_admin') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    if (isDashboard && role === 'platform_admin') {
      return NextResponse.redirect(new URL('/admin', req.url))
    }

    // Inyectar business_id como header para que las API routes lo lean
    if (businessId) {
      res.headers.set('x-business-id', businessId)
    }
  }

  return res
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/login']
}
```

---

## Verificacion de rol por ruta (tabla de guards)

| Ruta | Guard aplicado |
|---|---|
| `/dashboard/*` | Sesion valida + `role` in (`owner`, `staff`) |
| `/dashboard/menu/*` | Sesion valida + `role = owner` |
| `/dashboard/schedule` | Sesion valida + `role = owner` |
| `/dashboard/delivery` | Sesion valida + `role = owner` |
| `/dashboard/customers` | Sesion valida + `role = owner` |
| `/dashboard/metrics` | Sesion valida + `role = owner` |
| `/dashboard/settings/*` | Sesion valida + `role = owner` |
| `/dashboard/orders/*` | Sesion valida + `role` in (`owner`, `staff`) |
| `/dashboard/availability` | Sesion valida + `role` in (`owner`, `staff`) |
| `/admin/*` | Sesion valida + `role = platform_admin` |
| Todas las rutas `/[slug]/*` | Sin guard. Acceso libre. |

---

## Decisiones de diseno

1. **Sin subdominio en MVP.** El slug vive en el path (`/[slug]/menu`), no en el subdominio (`la-isla.easyorder.app`). Los subdominios requieren wildcard DNS y certificados SSL por tenant, lo que agrega complejidad de infraestructura innecesaria para el primer lanzamiento.

2. **El carrito es stateless en el servidor.** El estado del carrito vive en el browser (`localStorage`). No hay tabla `cart` en la base de datos en MVP. Esto elimina una superficie de datos sin aportar valor operativo real — el negocio no necesita ver carritos abandonados en MVP.

3. **El checkout genera un mensaje para WhatsApp, no un pedido en n8n.** El flujo web es: formulario de checkout → API route Next.js valida datos → genera mensaje estructurado → redirige al cliente a `https://wa.me/<numero>?text=<mensaje_encoded>`. El pedido se registra en PostgreSQL cuando n8n procesa el mensaje entrante. No hay doble insercion.

4. **`/login` redirige segun rol.** Un `owner` que ya tiene sesion no debe ver el form de login — se redirige a `/dashboard`. Un `platform_admin` va a `/admin`.

5. **Las rutas `/admin/*` son post-MVP en UI pero existen en el contrato de rutas.** El middleware ya las protege. Si alguien intenta acceder sin ser `platform_admin`, rebota. La UI puede ser una pagina en blanco o un 404 hasta que se construya.

6. **`?next=` para redirect post-login.** Si el usuario intenta acceder a `/dashboard/orders` sin sesion, el login lo redirige de vuelta a `/dashboard/orders` al autenticarse. Esto reduce friccion operativa (el staff puede bookmarkear su URL de pedidos).

---

## Riesgos

| Riesgo | Probabilidad | Mitigacion |
|---|---|---|
| Una API route del dashboard olvida filtrar por `business_id` y expone datos de otro tenant | Media | Code review obligatorio en toda query del panel; agregar RLS en tablas nuevas como segunda linea de defensa |
| El `business_id` en `app_metadata` se desincroniza si el negocio cambia de `businesses.id` | Baja | El `businesses.id` es un UUID inmutable post-creacion; no hay razon operativa para cambiarlo |
| El carrito en `localStorage` se pierde si el usuario cambia de dispositivo o borra cookies | Media | Es un trade-off aceptado en MVP; el cliente final puede reconstruir el carrito facilmente desde el menu |
| El flujo de WhatsApp desde el checkout no garantiza que el pedido llegue | Media | La confirmacion del pedido ocurre cuando n8n procesa el mensaje. La pantalla de confirm debe dejar claro que el pedido se confirma por WhatsApp, no en el momento del click |
| Subdominios custom en post-MVP requieren cambios de infraestructura no triviales | Alta | Documentar la decision de path-based routing como temporal; planificar la migracion a subdominios antes del tercer tenant |

---

## Lo que queda fuera del MVP

- Subdominios por tenant (`la-isla.easyorder.app`).
- Dominio propio del local (`menu.laisla.com`).
- Autenticacion del cliente final (cuenta de cliente, historial de pedidos web).
- Panel `/admin/*` con UI real para `platform_admin`.
- Carrito persistido en servidor (tabla `cart` en PostgreSQL).
- Invitacion de staff desde el panel del owner.
- Sesiones multiples por tenant (cuando `business_members` este activa).
- Notificaciones push al staff cuando llega un pedido nuevo.

---

## Siguiente paso

Definir el DDL SQL de `businesses` y `business_members` como una migracion ejecutable, incluyendo las politicas RLS para esas dos tablas. Propuesto en `07_ddl_businesses_y_members.md`.
