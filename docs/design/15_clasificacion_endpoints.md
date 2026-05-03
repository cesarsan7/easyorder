# Clasificación de Endpoints por Destino de Implementación — EasyOrder MVP
**Fecha:** 2026-04-21
**Fuente:** `14_inventario_endpoints.md`, `00_consolidacion_hallazgos.md`

---

## Criterios de clasificación

| Categoría | Criterio |
|---|---|
| **1 — CRUD puro** | Escritura/borrado directo a PostgreSQL sin lógica de negocio compleja. Validación de tenant obligatoria. |
| **2 — Lectura pura** | Solo lectura; sin efecto de estado. Candidatos a cache (Redis / HTTP cache headers). |
| **3 — Integración n8n** | Deben invocar un subflujo n8n existente porque la lógica de negocio ya vive ahí. |
| **4 — A definir** | El destino correcto depende de una decisión arquitectural pendiente (notificaciones, transiciones de estado, side effects). |

> **Nota sobre multi-tenant:** Todos los endpoints que tocan tablas con `restaurante_id` deben resolver el tenant desde el slug antes de ejecutar la query. Ese paso no es "lógica de n8n" — es una validación de acceso que va en la capa API sin excepción.

---

## Categoría 2 — Lectura pura (cacheable) · 18 endpoints

Son consultas SELECT sin efecto de estado. El tenant se resuelve desde el slug → `restaurante_id`. Ninguna necesita n8n.

| # | Endpoint | Tabla(s) principales | Cache recomendado | Nota |
|---|---|---|---|---|
| 1 | `GET /public/:slug/restaurant` | `restaurante`, `restaurante_config` | TTL medio (5–15 min) | Incluye datos bancarios — no exponer campos sensibles en respuesta pública |
| 2 | `GET /public/:slug/hours` | `horarios` | TTL medio | Frontend calcula `is_open`; la API solo entrega los registros |
| 3 | `GET /public/:slug/menu` | `menu_category`, `menu_item`, `menu_variant`, `extra`, `menu_item_extra` | TTL corto (2–5 min) | Usa `fn_menu_catalog` o join directo — requiere filtro `restaurante_id` ⚠️ |
| 4 | `GET /public/:slug/menu/item/:item_id` | `menu_item`, `menu_variant`, `extra` | TTL corto | Alternativa al catálogo completo |
| 5 | `POST /public/:slug/cart/validate` | `menu_variant` | Sin cache | POST semántico de solo lectura — lee precios actuales, no escribe; devuelve delta de precios |
| 6 | `GET /public/:slug/customer/lookup` | `usuarios` | Sin cache | UNIQUE bug multi-tenant: filtrar por `(telefono, restaurante_id)` ⚠️ |
| 8 | `GET /public/:slug/orders/:pedido_codigo` | `pedidos` | Sin cache | `pedido_codigo` actúa como token implícito — validar que pertenezca al slug |
| 9 | `GET /dashboard/:slug/home/metrics` | `pedidos` | TTL muy corto (30 s) | Agrega COUNT + SUM — candidato a vista materializada si hay carga |
| 10 | `GET /dashboard/:slug/restaurant/status` | `restaurante`, `restaurante_config`, `horarios` | Sin cache | `is_open` es calculado en tiempo real; `is_open_override` columna pendiente ⚠️ |
| 12 | `GET /dashboard/:slug/orders` | `pedidos`, `usuarios` | Sin cache | Lista pedidos activos con JOIN — polling desde dashboard |
| 13 | `GET /dashboard/:slug/orders/:id` | `pedidos`, `usuarios` | Sin cache | Detalle completo del pedido |
| 15 | `GET /dashboard/:slug/orders/history` | `pedidos` | TTL corto | Filtros fecha_desde/hasta; estado `entregado`/`cancelado` requieren migración del enum |
| 16 | `GET /dashboard/:slug/menu/categories` | `menu_category`, `menu_item` | TTL corto | Contador de ítems activos por categoría (subquery o JOIN) |
| 20 | `GET /dashboard/:slug/menu/items` | `menu_item` | TTL corto | Filtro por `category_id` obligatorio |
| 24 | `GET /dashboard/:slug/menu/items/:item_id/variants` | `menu_variant` | TTL corto | |
| 28 | `GET /dashboard/:slug/menu/extras` | `extra` | TTL corto | |
| 33 | `GET /dashboard/:slug/hours` | `horarios` | TTL medio | |
| 35 | `GET /dashboard/:slug/delivery/zones` | `delivery_zone` | TTL corto | |
| 39 | `GET /dashboard/:slug/settings` | `restaurante`, `restaurante_config` | Sin cache | |

---

## Categoría 1 — CRUD puro (API directa a PostgreSQL) · 22 endpoints

Escritura sin lógica conversacional. La validación de tenant (slug → restaurante_id) y la verificación de pertenencia de cada fila son responsabilidad de la capa API.

| # | Endpoint | Tabla(s) afectadas | Riesgo / Nota |
|---|---|---|---|
| 11 | `PATCH /dashboard/:slug/restaurant/status` | `restaurante_config` | Columna `is_open_override` pendiente de migración ⚠️; PK de `restaurante_config` requiere ser `(config_key, restaurante_id)` antes de implementar |
| 17 | `POST /dashboard/:slug/menu/categories` | `menu_category` | Asignar `restaurante_id` desde slug; no aceptar `restaurante_id` en body |
| 18 | `PATCH /dashboard/:slug/menu/categories/:id` | `menu_category` | Validar que `id` pertenece al tenant antes de UPDATE |
| 19 | `DELETE /dashboard/:slug/menu/categories/:id` | `menu_category` | Soft delete: `is_active = false`; validar pertenencia |
| 21 | `POST /dashboard/:slug/menu/items` | `menu_item` | Ídem; `category_id` debe pertenecer al mismo tenant |
| 22 | `PATCH /dashboard/:slug/menu/items/:id` | `menu_item` | Validar pertenencia; `image_url` pendiente de columna ⚠️ |
| 23 | `DELETE /dashboard/:slug/menu/items/:id` | `menu_item` | Soft delete |
| 25 | `POST /dashboard/:slug/menu/items/:item_id/variants` | `menu_variant` | Validar que `item_id` pertenece al tenant; FK `menu_variant.menu_item_id` pendiente de declarar ⚠️ |
| 26 | `PATCH /dashboard/:slug/menu/items/:item_id/variants/:variant_id` | `menu_variant` | Validar cadena ítem → variante → tenant |
| 27 | `DELETE /dashboard/:slug/menu/items/:item_id/variants/:variant_id` | `menu_variant` | Soft delete |
| 29 | `POST /dashboard/:slug/menu/extras` | `extra` | `restaurante_id` nullable pendiente de NOT NULL ⚠️ |
| 30 | `PATCH /dashboard/:slug/menu/extras/:id` | `extra` | Validar pertenencia |
| 31 | `DELETE /dashboard/:slug/menu/extras/:id` | `extra` | Soft delete |
| 32 | `PUT /dashboard/:slug/menu/items/:item_id/extras` | `menu_item_extra` | DELETE + INSERT en transacción; validar `item_id` y cada `extra_id` al tenant |
| 34 | `PUT /dashboard/:slug/hours` | `horarios` | UPSERT por día; validar `restaurante_id` en cada fila |
| 36 | `POST /dashboard/:slug/delivery/zones` | `delivery_zone` | |
| 37 | `PATCH /dashboard/:slug/delivery/zones/:id` | `delivery_zone` | Validar pertenencia |
| 38 | `DELETE /dashboard/:slug/delivery/zones/:id` | `delivery_zone` | Desactivar (`activa = false`) o DELETE físico — definir |
| 40 | `PATCH /dashboard/:slug/settings` | `restaurante`, `restaurante_config` | UPSERT en `restaurante_config` requiere PK `(config_key, restaurante_id)` ⚠️; migración previa obligatoria |
| 7 | `POST /public/:slug/orders` | `pedidos`, `usuarios`, `menu_variant`, `delivery_zone` | Validar zona + mínimo + calcular envío en API; usar `fn_next_pedido_codigo` con advisory lock para el código; sin notificación WhatsApp en MVP |
| 14 | `PATCH /dashboard/:slug/orders/:id/status` | `pedidos` | Validar transición permitida en API (tabla de estados); sin notificación WhatsApp al cliente en MVP |

---

## Categoría 3 — Integración con n8n · 0 endpoints (MVP)

Ninguno de los 40 endpoints del inventario invoca directamente un subflujo n8n existente.

**Motivo:** Los subflujos de n8n (`Apertura`, `Despacho`, `Pago`, `Perfil Cliente`, etc.) son flujos conversacionales acoplados al canal WhatsApp / Chatwoot. Reciben mensajes de texto de usuarios finales, mantienen estado de sesión y responden en el mismo canal. No exponen una interfaz de "ejecutar lógica de pedido dado un payload JSON estructurado".

La web de EasyOrder crea pedidos a partir de un formulario de checkout donde todos los datos ya están recolectados. La lógica de validación (zona, mínimo de entrega, cálculo de envío) se reimplementa en la capa API — no se delega al flujo conversacional.

> **Excepción potencial** → ver Categoría 4, endpoints #7 y #14.

---

## Categoría 4 — A definir · 0 endpoints (MVP)

> **Decisión registrada (2026-04-21):** Para el MVP no se implementan notificaciones WhatsApp desde la capa web. El operador monitorea pedidos web desde el dashboard. Los subflujos n8n siguen siendo exclusivos del canal WhatsApp/Chatwoot. Los 3 endpoints originalmente aquí clasificados bajaron a Categoría 1.

---

## Historial de decisiones — ex Categoría 4

### 7 — `POST /public/:slug/orders`

**Por qué no es CRUD puro:**
La creación de un pedido implica:
1. Validar que las variantes pertenecen al tenant y están activas.
2. Si es delivery: validar zona, calcular `costo_envio`, verificar mínimo de pedido.
3. Generar `pedido_codigo` mediante `fn_next_pedido_codigo` con advisory lock.
4. Insertar en `pedidos` con `restaurante_id` del slug.
5. **Notificar al local** que llegó un pedido web nuevo.

Los pasos 1–4 son implementables directamente en la API sin n8n.

El paso 5 es la bifurcación:

| Opción | Descripción | Implicancia |
|---|---|---|
| A | API inserta el pedido; el dashboard del operador lo ve por polling/websocket | Sin n8n. Operador ve pedidos web igual que pedidos WhatsApp. |
| B | API inserta el pedido y luego dispara un webhook a n8n para que envíe notificación WhatsApp al operador | Requiere crear un subflujo n8n de "notificación de pedido web" (no existe hoy). |
| C | El pedido web pasa por un endpoint n8n que ejecuta la lógica de validación y luego inserta | Acopla web a n8n; la latencia de n8n impacta al checkout. No recomendado. |

**Decisión pendiente:** ¿Necesita el operador un aviso WhatsApp cuando llega un pedido web, o el dashboard (con polling o websockets) es suficiente?

---

### 14 — `PATCH /dashboard/:slug/orders/:id/status`

**Por qué no es CRUD puro:**
La transición de estado tiene dos capas:

1. **Validación de transición:** solo ciertas transiciones son válidas (`en_curso → confirmado`, no `entregado → en_curso`). Esta lógica puede vivir en la API como tabla de transiciones permitidas.
2. **Side effect de notificación:** cuando el operador confirma el pedido o lo marca como "listo para retiro / en camino", ¿se envía un WhatsApp al cliente?

El subflujo `Pago` en n8n ya maneja `pendiente_pago → pagado`. Si el operador cambia el estado desde el dashboard y ese cambio debe notificar al cliente por WhatsApp, se necesita un nuevo subflujo n8n de "notificaciones de estado" (no existe hoy).

| Opción | Descripción |
|---|---|
| A | UPDATE directo en `pedidos.estado`; sin notificación. Operador confirma verbalmente. |
| B | UPDATE + disparo de webhook n8n para notificación WhatsApp al cliente. Requiere nuevo subflujo. |

**Decisión pendiente:** ¿El cliente recibe notificaciones de estado por WhatsApp cuando el operador usa el dashboard?

---

### Nota cruzada — `GET /dashboard/:slug/restaurant/status` (catalogado como Categoría 2)

El campo `is_open` calculado depende de `horarios`, `zona_horaria` y `is_open_override`. La lógica de cálculo la hace actualmente el nodo JavaScript `Validacion` del workflow `Pizzeria` de n8n con timezone hardcodeada (`Atlantic/Canary`). Para la API REST, esta lógica debe **reimplementarse** (no delegarse a n8n) dado que es una función determinista sobre datos disponibles en PostgreSQL. No cambia la categoría 2, pero es un punto de implementación no trivial.

---

## Resumen consolidado

| Categoría | Endpoints | % |
|---|---|---|
| 1 — CRUD puro | 22 | 55 % |
| 2 — Lectura pura | 18 | 45 % |
| 3 — Integración n8n | 0 | 0 % |
| 4 — A definir | 0 | 0 % |
| **Total** | **40** | **100 %** |

---

## Implicancias para la arquitectura

1. **No se requiere n8n para la capa web.** Los 40 endpoints del MVP pueden implementarse como API directa sobre PostgreSQL (PostgREST o backend custom). n8n sigue siendo el motor del canal WhatsApp — los dos canales comparten la base de datos, no el procesador de pedidos.

2. **Los 3 endpoints de Categoría 4 bloquean decisiones de notificación.** Resolver si el operador necesita WhatsApp-push define si se construye un subflujo n8n de notificaciones o si el dashboard con polling es suficiente para MVP.

3. **Las migraciones de esquema son un pre-requisito bloqueante.** Antes de implementar los endpoints marcados con ⚠️ (especialmente #11 y #40) se deben aplicar las migraciones de `restaurante_config` (PK compuesto) y crear las columnas faltantes (`is_open_override`, `image_url`, `descripcion`, `logo`).

4. **La función `fn_next_pedido_codigo` con advisory lock** debe mantenerse tal cual para el endpoint #7. No reimplementar la generación de código de pedido fuera de esa función.

5. **Los endpoints de lectura (#2, #3, #10) son los candidatos más rápidos de implementar** — queries directas con filtro `restaurante_id` y sin dependencias de migración.
