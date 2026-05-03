# Inventario de Endpoints — EasyOrder MVP
**Fecha:** 2026-04-21
**Fuentes:** `10_contratos_datos_publico.md`, `13_contratos_datos_dashboard.md`

---

## Notas de lectura

- Los endpoints marcados con ⚠️ dependen de columnas que aún no existen en el DDL actual (ver `10_contratos_datos_publico.md` sección "gaps").
- El filtro por `restaurante_id` es obligatorio en todos los endpoints que lo indican — sin él hay riesgo de fuga de datos entre tenants.
- La decisión de si cada endpoint va a n8n, a una API directa sobre Supabase o a un backend intermedio se define en el documento siguiente.

---

## Grupo 1 — Datos públicos del local

---

- **Endpoint:** `GET /public/:slug/restaurant`
- **Qué hace:** Retorna nombre, descripción, logo, brand_color, dirección, tarifa de envío, delivery_enabled, pickup_enabled, delivery_min_order, payment_methods, datos_bancarios y zona_horaria del local identificado por slug.
- **Lo llama:** Frontend público
- **Requiere auth:** No
- **Requiere filtro por restaurant_id:** Sí — slug resuelve el restaurante_id internamente

---

- **Endpoint:** `GET /public/:slug/hours`
- **Qué hace:** Retorna todos los registros de horarios del local (lun–dom, franjas de apertura) para que el cliente derive `is_open` y próxima apertura.
- **Lo llama:** Frontend público
- **Requiere auth:** No
- **Requiere filtro por restaurant_id:** Sí

---

## Grupo 2 — Catálogo del menú (público)

---

- **Endpoint:** `GET /public/:slug/menu`
- **Qué hace:** Retorna el catálogo completo: categorías activas + ítems activos con sus variantes activas (precio, nombre, is_default) y extras asociados. Incluye image_url ⚠️ y tags de cada ítem.
- **Lo llama:** Frontend público
- **Requiere auth:** No
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `GET /public/:slug/menu/item/:item_id`
- **Qué hace:** Retorna el detalle de un ítem: descripción, variantes, extras y sus precios. Alternativa cuando el catálogo completo no está pre-cargado en cliente.
- **Lo llama:** Frontend público
- **Requiere auth:** No
- **Requiere filtro por restaurant_id:** Sí

---

## Grupo 3 — Carrito y validación

---

- **Endpoint:** `POST /public/:slug/cart/validate`
- **Qué hace:** Recibe un array de `{menu_variant_id, price}` y retorna los precios actuales de cada variante. Permite detectar si algún precio cambió desde que el cliente lo agregó al carrito.
- **Lo llama:** Frontend público
- **Requiere auth:** No
- **Requiere filtro por restaurant_id:** Sí — verificar que las variantes pertenecen al tenant

---

## Grupo 4 — Checkout: cliente y pedido

---

- **Endpoint:** `GET /public/:slug/customer/lookup?telefono=:tel`
- **Qué hace:** Busca un cliente por teléfono dentro del tenant. Si existe, retorna nombre y dirección_frecuente para pre-cargar el formulario de checkout.
- **Lo llama:** Frontend público
- **Requiere auth:** No
- **Requiere filtro por restaurant_id:** Sí — el unique de `usuarios.telefono` es un bug multi-tenant; el lookup debe incluir restaurante_id

---

- **Endpoint:** `POST /public/:slug/orders`
- **Qué hace:** Crea un nuevo pedido con ítems (JSONB), cliente, tipo_despacho, dirección, método_pago, subtotal, costo_envio y total. Retorna `id`, `pedido_codigo` y `estado`.
- **Lo llama:** Frontend público
- **Requiere auth:** No
- **Requiere filtro por restaurant_id:** Sí — se inserta con restaurante_id del slug

---

- **Endpoint:** `GET /public/:slug/orders/:pedido_codigo`
- **Qué hace:** Retorna el estado actual del pedido, resumen de ítems, tipo_despacho, totales, metodo_pago, tiempo_espera_minutos y mensaje_tiempo_espera. El pedido_codigo actúa como token de acceso implícito.
- **Lo llama:** Frontend público
- **Requiere auth:** No
- **Requiere filtro por restaurant_id:** Sí

---

## Grupo 5 — Dashboard: resumen operativo

---

- **Endpoint:** `GET /dashboard/:slug/home/metrics`
- **Qué hace:** Retorna métricas del día: pedidos activos, pedidos hoy, ingresos del día y los últimos 5 pedidos recientes.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `GET /dashboard/:slug/restaurant/status`
- **Qué hace:** Retorna el estado actual del local: `is_open` calculado + valor de `is_open_override` (auto / open / closed) ⚠️ + timezone.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `PATCH /dashboard/:slug/restaurant/status`
- **Qué hace:** Actualiza `is_open_override` en `restaurante_config` (valores: `auto`, `open`, `closed`) ⚠️. Controla el cierre/apertura manual del local.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

## Grupo 6 — Dashboard: gestión de pedidos

---

- **Endpoint:** `GET /dashboard/:slug/orders`
- **Qué hace:** Retorna la lista de pedidos activos del tenant con nombre del cliente (join usuarios), estado, tipo_despacho, total y tiempo transcurrido desde created_at.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `GET /dashboard/:slug/orders/:id`
- **Qué hace:** Retorna el detalle completo de un pedido: todos los campos de `pedidos` + nombre del cliente desde `usuarios`.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `PATCH /dashboard/:slug/orders/:id/status`
- **Qué hace:** Actualiza el estado de un pedido (transición: `en_curso → confirmado → preparando* → listo* → entregado*` o `→ cancelado`). Los estados con * requieren migración del enum.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `GET /dashboard/:slug/orders/history`
- **Qué hace:** Retorna pedidos finalizados (`entregado`, `cancelado` — estados a crear) con filtros de fecha_desde y fecha_hasta. Para el MVP puede usar `pagado` como aproximación.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

## Grupo 7 — Dashboard: gestión del menú

---

- **Endpoint:** `GET /dashboard/:slug/menu/categories`
- **Qué hace:** Retorna todas las categorías del tenant con `sort_order`, `is_active` y contador de productos activos por categoría.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `POST /dashboard/:slug/menu/categories`
- **Qué hace:** Crea una nueva categoría de menú para el tenant.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `PATCH /dashboard/:slug/menu/categories/:id`
- **Qué hace:** Edita nombre, sort_order o is_active de una categoría. Valida que pertenezca al tenant.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `DELETE /dashboard/:slug/menu/categories/:id`
- **Qué hace:** Soft delete de una categoría (is_active = false). Valida pertenencia al tenant.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `GET /dashboard/:slug/menu/items?category_id=:id`
- **Qué hace:** Retorna los ítems de una categoría con descripción, image_url ⚠️, tags, is_active.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `POST /dashboard/:slug/menu/items`
- **Qué hace:** Crea un nuevo ítem de menú bajo una categoría del tenant.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `PATCH /dashboard/:slug/menu/items/:id`
- **Qué hace:** Edita nombre, descripción, image_url, tags o is_active de un ítem. Valida pertenencia al tenant.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `DELETE /dashboard/:slug/menu/items/:id`
- **Qué hace:** Soft delete de un ítem (is_active = false).
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `GET /dashboard/:slug/menu/items/:item_id/variants`
- **Qué hace:** Retorna las variantes de un ítem (nombre, precio, is_default, is_active).
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `POST /dashboard/:slug/menu/items/:item_id/variants`
- **Qué hace:** Crea una variante para un ítem del tenant. Valida que el ítem pertenezca al tenant antes de insertar.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `PATCH /dashboard/:slug/menu/items/:item_id/variants/:variant_id`
- **Qué hace:** Edita precio, nombre, is_default o is_active de una variante.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `DELETE /dashboard/:slug/menu/items/:item_id/variants/:variant_id`
- **Qué hace:** Soft delete de una variante (is_active = false).
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `GET /dashboard/:slug/menu/extras`
- **Qué hace:** Retorna todos los extras del tenant (nombre, precio, alérgenos, is_active).
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `POST /dashboard/:slug/menu/extras`
- **Qué hace:** Crea un extra disponible para el tenant.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `PATCH /dashboard/:slug/menu/extras/:id`
- **Qué hace:** Edita nombre, precio, alérgenos o is_active de un extra.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `DELETE /dashboard/:slug/menu/extras/:id`
- **Qué hace:** Soft delete de un extra.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `PUT /dashboard/:slug/menu/items/:item_id/extras`
- **Qué hace:** Reemplaza la lista completa de extras asociados a un ítem (`menu_item_extra`). Recibe array de `{extra_id, is_default}`.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

## Grupo 8 — Dashboard: gestión de horarios

---

- **Endpoint:** `GET /dashboard/:slug/hours`
- **Qué hace:** Retorna los 7 registros de horarios del local (uno por día) con franjas de apertura.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `PUT /dashboard/:slug/hours`
- **Qué hace:** Actualiza uno o más registros de horarios del local. Recibe array de días con sus franjas. Valida `restaurante_id` en cada fila.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

## Grupo 9 — Dashboard: gestión de delivery

---

- **Endpoint:** `GET /dashboard/:slug/delivery/zones`
- **Qué hace:** Retorna todas las zonas de delivery del tenant (código postal, tarifa, mínimo, tiempos estimados, activa).
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `POST /dashboard/:slug/delivery/zones`
- **Qué hace:** Crea una nueva zona de delivery para el tenant.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `PATCH /dashboard/:slug/delivery/zones/:id`
- **Qué hace:** Edita los datos de una zona de delivery existente. Valida pertenencia al tenant.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `DELETE /dashboard/:slug/delivery/zones/:id`
- **Qué hace:** Elimina o desactiva una zona de delivery (`activa = false`).
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

## Grupo 10 — Dashboard: configuración del local

---

- **Endpoint:** `GET /dashboard/:slug/settings`
- **Qué hace:** Retorna la configuración completa del local: datos de identidad (nombre, descripción ⚠️, logo ⚠️), contacto, timezone, moneda, datos_bancarios y métodos de pago habilitados.
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

- **Endpoint:** `PATCH /dashboard/:slug/settings`
- **Qué hace:** Actualiza los campos de configuración del local en `restaurante` y UPSERT en `restaurante_config` para claves como `accept_cash`, `accept_transfer` ⚠️. El UPSERT debe incluir `restaurante_id` para evitar colisiones multi-tenant (PK actual de `restaurante_config` es solo `config_key`).
- **Lo llama:** Dashboard
- **Requiere auth:** Sí
- **Requiere filtro por restaurant_id:** Sí

---

## Resumen consolidado

| # | Endpoint | Caller | Auth |
|---|---|---|---|
| 1 | `GET /public/:slug/restaurant` | Público | No |
| 2 | `GET /public/:slug/hours` | Público | No |
| 3 | `GET /public/:slug/menu` | Público | No |
| 4 | `GET /public/:slug/menu/item/:item_id` | Público | No |
| 5 | `POST /public/:slug/cart/validate` | Público | No |
| 6 | `GET /public/:slug/customer/lookup` | Público | No |
| 7 | `POST /public/:slug/orders` | Público | No |
| 8 | `GET /public/:slug/orders/:pedido_codigo` | Público | No |
| 9 | `GET /dashboard/:slug/home/metrics` | Dashboard | Sí |
| 10 | `GET /dashboard/:slug/restaurant/status` | Dashboard | Sí |
| 11 | `PATCH /dashboard/:slug/restaurant/status` | Dashboard | Sí |
| 12 | `GET /dashboard/:slug/orders` | Dashboard | Sí |
| 13 | `GET /dashboard/:slug/orders/:id` | Dashboard | Sí |
| 14 | `PATCH /dashboard/:slug/orders/:id/status` | Dashboard | Sí |
| 15 | `GET /dashboard/:slug/orders/history` | Dashboard | Sí |
| 16 | `GET /dashboard/:slug/menu/categories` | Dashboard | Sí |
| 17 | `POST /dashboard/:slug/menu/categories` | Dashboard | Sí |
| 18 | `PATCH /dashboard/:slug/menu/categories/:id` | Dashboard | Sí |
| 19 | `DELETE /dashboard/:slug/menu/categories/:id` | Dashboard | Sí |
| 20 | `GET /dashboard/:slug/menu/items` | Dashboard | Sí |
| 21 | `POST /dashboard/:slug/menu/items` | Dashboard | Sí |
| 22 | `PATCH /dashboard/:slug/menu/items/:id` | Dashboard | Sí |
| 23 | `DELETE /dashboard/:slug/menu/items/:id` | Dashboard | Sí |
| 24 | `GET /dashboard/:slug/menu/items/:item_id/variants` | Dashboard | Sí |
| 25 | `POST /dashboard/:slug/menu/items/:item_id/variants` | Dashboard | Sí |
| 26 | `PATCH /dashboard/:slug/menu/items/:item_id/variants/:variant_id` | Dashboard | Sí |
| 27 | `DELETE /dashboard/:slug/menu/items/:item_id/variants/:variant_id` | Dashboard | Sí |
| 28 | `GET /dashboard/:slug/menu/extras` | Dashboard | Sí |
| 29 | `POST /dashboard/:slug/menu/extras` | Dashboard | Sí |
| 30 | `PATCH /dashboard/:slug/menu/extras/:id` | Dashboard | Sí |
| 31 | `DELETE /dashboard/:slug/menu/extras/:id` | Dashboard | Sí |
| 32 | `PUT /dashboard/:slug/menu/items/:item_id/extras` | Dashboard | Sí |
| 33 | `GET /dashboard/:slug/hours` | Dashboard | Sí |
| 34 | `PUT /dashboard/:slug/hours` | Dashboard | Sí |
| 35 | `GET /dashboard/:slug/delivery/zones` | Dashboard | Sí |
| 36 | `POST /dashboard/:slug/delivery/zones` | Dashboard | Sí |
| 37 | `PATCH /dashboard/:slug/delivery/zones/:id` | Dashboard | Sí |
| 38 | `DELETE /dashboard/:slug/delivery/zones/:id` | Dashboard | Sí |
| 39 | `GET /dashboard/:slug/settings` | Dashboard | Sí |
| 40 | `PATCH /dashboard/:slug/settings` | Dashboard | Sí |

**Total: 40 endpoints** — 8 públicos sin auth, 32 del dashboard con auth.
