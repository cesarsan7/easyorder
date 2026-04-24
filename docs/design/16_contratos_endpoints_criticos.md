# Contratos de Endpoints Críticos — EasyOrder MVP
**Fecha:** 2026-04-21
**Fuente:** 15_clasificacion_endpoints.md
**Scope:** 11 endpoints que desbloquean el flujo completo de compra y operación básica del dashboard

---

## Índice

| # | Endpoint | Rol en el flujo |
|---|---|---|
| 1 | `GET /public/:slug/restaurant` | Info del local + estado abierto/cerrado |
| 2 | `GET /public/:slug/menu` | Catálogo completo para renderizar la carta |
| 2b | `GET /public/:slug/hours` | Horario semanal completo + is_open actual |
| 3 | `POST /public/:slug/cart/validate` | Validar precios del carrito antes de confirmar |
| 4 | `POST /public/:slug/orders` | Crear pedido — el más crítico del flujo |
| 5 | `GET /public/:slug/orders/:pedido_codigo` | Tracking del pedido post-confirmación |
| 6 | `GET /dashboard/:slug/orders` | Lista de pedidos activos para el operador |
| 7 | `PATCH /dashboard/:slug/orders/:id/status` | Cambiar estado de un pedido desde el dashboard |
| 8 | `GET /dashboard/:slug/restaurant/status` | Ver si el local está abierto en tiempo real |
| 9 | `PATCH /dashboard/:slug/restaurant/status` | Abrir o cerrar el local manualmente |
| 10 | `GET /dashboard/:slug/home/metrics` | Métricas del dashboard principal |

---

## 1. GET /public/:slug/restaurant

**Descripción:** Devuelve la información pública del local y el estado de apertura calculado en tiempo real, necesario para mostrar el banner del local y bloquear el checkout si está cerrado.

**Auth requerida:** Ninguna

**Parámetros de entrada:**
- Path params: [`slug` — identificador único del local en la URL, resuelve a `restaurante.id`]
- Query params: —
- Body: —

**Respuesta exitosa:**
- Status: `200`
- Body:
```json
{
  "id": 1,
  "nombre": "La Isla",
  "direccion": "Tarragon 22 Arrecife",
  "telefono": "+56912345678",
  "moneda": "€",
  "zona_horaria": "Atlantic/Canary",
  "mensaje_bienvenida": "Bienvenido a Isla 🍝 Tu auténtica experiencia italiana en Santiago.",
  "mensaje_cerrado": "Gracias por contactarnos. Actualmente estamos cerrados.",
  "radio_cobertura_km": 5.00,
  "tarifa_envio_tipo": "fija",
  "tarifa_envio_valor": 2500.00,
  "is_open": true,
  "is_open_override": null,
  "horario_hoy": {
    "dia": "Lunes",
    "disponible": true,
    "apertura_1": "12:00",
    "cierre_1": "15:30",
    "apertura_2": "19:00",
    "cierre_2": "23:00"
  }
}
```

**Notas sobre campos:**
- `is_open`: calculado por la API comparando hora actual (en `zona_horaria` del restaurante) contra los registros de `horarios` del día actual. Considera `apertura_1/cierre_1` y `apertura_2/cierre_2` si el local tiene doble turno.
- `is_open_override`: campo pendiente de migración en `restaurante_config` (clave `is_open_override`). Si el valor existe y es `"true"` o `"false"`, sobrescribe el cálculo automático. Devolver `null` si la clave no existe todavía.
- `datos_bancarios`: NO exponer en respuesta pública. Campo sensible excluido explícitamente.
- `lat` / `long`: NO exponer en respuesta pública.

**Errores posibles:**
- `404`: el `slug` no corresponde a ningún registro en `restaurante`

**Tablas que toca:** `restaurante`, `horarios`, `restaurante_config`

**Lógica especial:**
1. Resolver `restaurante_id` desde `slug`. Nota: la columna `slug` es pendiente de migración — en el estado actual del DDL no existe. El slug deberá agregarse como columna `varchar(100) UNIQUE NOT NULL` a la tabla `restaurante` antes de implementar este endpoint.
2. Calcular `is_open`: obtener la hora actual en `restaurante.zona_horaria`; buscar el registro de `horarios` donde `dia` coincida con el día de la semana actual y `disponible = true`; evaluar si la hora cae dentro de `[apertura_1, cierre_1]` o `[apertura_2, cierre_2]`.
3. Leer `restaurante_config` donde `config_key = 'is_open_override'` y `restaurante_id = {id}`. Si existe, usar ese valor para sobreescribir `is_open`.

---

## 2. GET /public/:slug/menu

**Descripción:** Devuelve el catálogo completo del local, estructurado por categorías con sus ítems, variantes y extras disponibles, para renderizar la carta digital.

**Auth requerida:** Ninguna

**Parámetros de entrada:**
- Path params: [`slug` — identificador único del local]
- Query params: [`only_active` (boolean, opcional, default `true`) — si `false`, incluye ítems inactivos (uso interno/debug)]
- Body: —

**Respuesta exitosa:**
- Status: `200`
- Body:
```json
{
  "restaurante_id": 1,
  "moneda": "€",
  "categories": [
    {
      "menu_category_id": 1,
      "name": "Pizzas",
      "sort_order": 1,
      "is_active": true,
      "items": [
        {
          "menu_item_id": 1,
          "name": "Margarita",
          "description": "Salsa de tomate, mozzarella fresca y albahaca",
          "is_pizza": true,
          "is_active": true,
          "tags": "veg,clasica",
          "image_url": null,
          "variants": [
            {
              "menu_variant_id": 1,
              "variant_name": "Individual",
              "price": 8.50,
              "is_default": true,
              "is_active": true,
              "sku": null
            },
            {
              "menu_variant_id": 2,
              "variant_name": "Familiar",
              "price": 14.90,
              "is_default": false,
              "is_active": true,
              "sku": null
            }
          ],
          "extras": [
            {
              "extra_id": 1,
              "name": "Extra Queso Mozzarella",
              "price": 1.50,
              "allergens": "lactosa",
              "is_active": true
            }
          ]
        }
      ]
    }
  ]
}
```

**Notas sobre campos:**
- `image_url`: columna pendiente de migración en `menu_item`. Devolver `null` hasta que exista.
- `extras`: se obtienen via `menu_item_extra JOIN extra` filtrando `extra.is_active = true`.
- Si un ítem no tiene variantes en `menu_variant`, `variants` devuelve array vacío `[]`. El precio base se infiere del precio más bajo de las variantes activas o se expone `null`.
- Filtro multi-tenant obligatorio: `WHERE menu_category.restaurante_id = {restaurante_id}` en todas las subqueries.

**Errores posibles:**
- `404`: slug no resuelve ningún restaurante activo

**Tablas que toca:** `restaurante`, `menu_category`, `menu_item`, `menu_variant`, `extra`, `menu_item_extra`

**Lógica especial:**
- Puede usar `fn_menu_catalog()` como referencia de lógica pero debe adaptarse para filtrar por `restaurante_id` y estructurar la respuesta en árbol categoría → ítems → variantes/extras en vez de filas planas.
- Filtrar `menu_category.is_active = true`, `menu_item.is_active = true`, `menu_variant.is_active = true` (cuando `only_active = true`).
- Ordenar categorías por `sort_order ASC`, ítems por `menu_item_id ASC`.

---

## 2b. GET /public/:slug/hours

**Descripción:** Devuelve el horario semanal completo del local y el estado de apertura calculado en tiempo real. Permite a la carta digital mostrar los horarios de apertura al cliente sin necesidad de llamar al endpoint `/restaurant` completo.

**Auth requerida:** Ninguna

**Parámetros de entrada:**
- Path params: [`slug` — identificador único del local]
- Query params: —
- Body: —

**Respuesta exitosa:**
- Status: `200`
- Body:
```json
{
  "zona_horaria": "Atlantic/Canary",
  "is_open": true,
  "dia_hoy": "Lunes",
  "schedule": [
    {
      "dia": "Lunes",
      "disponible": true,
      "apertura_1": "12:00",
      "cierre_1": "15:30",
      "apertura_2": "19:00",
      "cierre_2": "23:00"
    },
    {
      "dia": "Martes",
      "disponible": true,
      "apertura_1": "12:00",
      "cierre_1": "15:30",
      "apertura_2": "19:00",
      "cierre_2": "23:00"
    },
    {
      "dia": "Domingo",
      "disponible": false,
      "apertura_1": null,
      "cierre_1": null,
      "apertura_2": null,
      "cierre_2": null
    }
  ]
}
```

**Notas sobre campos:**
- `restaurante_id`: NO exponer. El slug es la clave pública; el ID interno es un detalle de implementación.
- `is_open`: valor efectivo final — el override de `restaurante_config` tiene precedencia sobre el cálculo automático por horario. Misma lógica que el endpoint 1.
- `dia_hoy`: nombre del día en español correspondiente a la hora local del restaurante. `null` si no hay registro de horario configurado para hoy.
- `schedule`: ordenado Lunes → Domingo. IDs internos (`horarios.id`) no se exponen.
- Los campos de hora usan formato `HH:MM` (sin segundos). `null` cuando el día no tiene turno configurado.

**Errores posibles:**
- `404`: el `slug` no corresponde a ningún registro en `restaurante`

**Tablas que toca:** `restaurante`, `horarios`

**Lógica especial:**
1. Resolver `restaurante_id` desde slug.
2. Leer `restaurante.zona_horaria` para calcular `is_open` y `dia_hoy`.
3. Leer `restaurante_config` donde `config_key = 'is_open_override'` y `restaurante_id = {id}`. Si existe, usar ese valor para sobreescribir el cálculo automático (mismo patrón tolerante a migración pendiente que el endpoint 1).
4. Calcular `is_open` con la misma función `calcIsOpen()` usada en el endpoint 1 — fuente de timezone es siempre `restaurante.zona_horaria`.
5. Ordenar filas por día de la semana (Lunes=1 … Domingo=7) via `CASE dia` en SQL.

**Tablas que toca:** `restaurante`, `horarios`, `restaurante_config`

---

## 3. POST /public/:slug/cart/validate

**Descripción:** Valida que los precios del carrito construido por el cliente coincidan con los precios actuales en la base de datos y que todas las variantes sigan activas, devolviendo delta de precios si hubo cambios.

**Auth requerida:** Ninguna

**Parámetros de entrada:**
- Path params: [`slug` — identificador único del local]
- Query params: —
- Body:
```json
{
  "items": [
    {
      "menu_variant_id": 1,
      "quantity": 2,
      "unit_price_claimed": 8.50,
      "extras": [
        {
          "extra_id": 1,
          "unit_price_claimed": 1.50
        }
      ]
    }
  ]
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `items` | array | SI | Lista de líneas del carrito |
| `items[].menu_variant_id` | integer | SI | ID de la variante seleccionada |
| `items[].quantity` | integer | SI | Cantidad (>= 1) |
| `items[].unit_price_claimed` | decimal | SI | Precio que el frontend tiene almacenado |
| `items[].extras` | array | NO | Extras agregados a esta línea |
| `items[].extras[].extra_id` | integer | SI (si extras) | ID del extra |
| `items[].extras[].unit_price_claimed` | decimal | SI (si extras) | Precio del extra que el frontend tiene |

**Respuesta exitosa:**
- Status: `200`
- Body:
```json
{
  "valid": true,
  "price_changed": false,
  "items": [
    {
      "menu_variant_id": 1,
      "menu_item_id": 1,
      "variant_name": "Individual",
      "item_name": "Margarita",
      "quantity": 2,
      "unit_price_current": 8.50,
      "unit_price_claimed": 8.50,
      "price_delta": 0.00,
      "is_active": true,
      "extras": [
        {
          "extra_id": 1,
          "name": "Extra Queso Mozzarella",
          "unit_price_current": 1.50,
          "unit_price_claimed": 1.50,
          "price_delta": 0.00,
          "is_active": true
        }
      ]
    }
  ],
  "subtotal_current": 20.00,
  "subtotal_claimed": 20.00,
  "unavailable_items": []
}
```

**Respuesta con cambios de precio:**
```json
{
  "valid": false,
  "price_changed": true,
  "items": [...],
  "subtotal_current": 21.00,
  "subtotal_claimed": 20.00,
  "unavailable_items": []
}
```

**Respuesta con ítems no disponibles:**
```json
{
  "valid": false,
  "price_changed": false,
  "items": [...],
  "subtotal_current": 8.50,
  "subtotal_claimed": 17.00,
  "unavailable_items": [
    {
      "menu_variant_id": 99,
      "reason": "variant_not_found"
    }
  ]
}
```

**Errores posibles:**
- `400`: `items` vacío o malformado; `quantity` < 1; `menu_variant_id` no es entero positivo
- `404`: slug no resuelve ningún restaurante

**Tablas que toca:** `restaurante`, `menu_variant`, `menu_item`, `extra`

**Lógica especial:**
1. Resolver `restaurante_id` desde slug.
2. Para cada `menu_variant_id`: buscar en `menu_variant` filtrando por `restaurante_id` (via `menu_item.restaurante_id`). Si no existe o `is_active = false`, agregar a `unavailable_items` con `reason: "variant_not_found"` o `"variant_inactive"`.
3. Para cada `extra_id`: buscar en `extra` filtrando `restaurante_id`. Mismo tratamiento si inactivo.
4. Calcular `price_delta = unit_price_current - unit_price_claimed` por línea.
5. Si cualquier `price_delta != 0` o cualquier ítem está inactivo: `valid: false`.
6. Este endpoint NO escribe en ninguna tabla — es una consulta de validación semántica.

---

## 4. POST /public/:slug/orders

**Descripción:** Crea un pedido nuevo en la base de datos tras la confirmación del checkout, asignando un `pedido_codigo` único mediante el trigger `fn_set_pedido_codigo` con advisory lock.

**Auth requerida:** Ninguna

**Parámetros de entrada:**
- Path params: [`slug` — identificador único del local]
- Query params: —
- Body:
```json
{
  "telefono": "+34612345678",
  "nombre": "Carlos López",
  "tipo_despacho": "delivery",
  "direccion": "Calle Mayor 12, Arrecife",
  "zona_id": 1,
  "metodo_pago": "transferencia",
  "notas": "Sin cebolla por favor",
  "items": [
    {
      "menu_variant_id": 1,
      "menu_item_id": 1,
      "item_name": "Margarita",
      "variant_name": "Individual",
      "quantity": 2,
      "unit_price": 8.50,
      "extras": [
        {
          "extra_id": 1,
          "name": "Extra Queso Mozzarella",
          "unit_price": 1.50,
          "quantity": 1
        }
      ]
    }
  ]
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `telefono` | string | SI | Teléfono del cliente (se busca/crea en `usuarios`) |
| `nombre` | string | SI | Nombre del cliente |
| `tipo_despacho` | string | SI | `"delivery"` o `"retiro"` |
| `direccion` | string | SI si delivery | Dirección de entrega |
| `zona_id` | integer | SI si delivery | `delivery_zone.delivery_zone_id` seleccionada |
| `metodo_pago` | string | SI | `"efectivo"`, `"transferencia"`, `"tarjeta"`, `"bizum"` |
| `notas` | string | NO | Notas adicionales del cliente |
| `items` | array | SI | Al menos 1 ítem |
| `items[].menu_variant_id` | integer | SI | FK a `menu_variant` |
| `items[].menu_item_id` | integer | SI | FK a `menu_item` |
| `items[].item_name` | string | SI | Nombre del ítem (se persiste en JSONB) |
| `items[].variant_name` | string | SI | Nombre de la variante (se persiste en JSONB) |
| `items[].quantity` | integer | SI | >= 1 |
| `items[].unit_price` | decimal | SI | Precio validado (viene del frontend tras validate) |
| `items[].extras` | array | NO | Extras seleccionados |

**Respuesta exitosa:**
- Status: `201`
- Body:
```json
{
  "id": 42,
  "pedido_codigo": "260421-1001",
  "estado": "confirmado",
  "tipo_despacho": "delivery",
  "subtotal": 18.50,
  "costo_envio": 2.50,
  "total": 21.00,
  "metodo_pago": "transferencia",
  "tiempo_estimado": "30-45 min",
  "created_at": "2026-04-21T14:32:00Z",
  "usuario_id": 7
}
```

**Notas sobre el estado inicial:**
- Si `metodo_pago = "transferencia"`: `estado = "pendiente_pago"` (regla 9 del negocio).
- Cualquier otro método: `estado = "confirmado"`.

**Errores posibles:**
- `400`: `items` vacío; `tipo_despacho` inválido; `metodo_pago` no presente; `telefono` ausente
- `404`: slug no resuelve restaurante; `zona_id` no existe o no pertenece al tenant
- `409`: colisión de `pedido_codigo` (muy improbable por advisory lock, pero manejar)
- `422`: delivery sin `direccion`; delivery con `zona_id` inactiva; subtotal < `delivery_zone.min_order_amount`; local cerrado al momento de crear (`is_open = false`)

**Tablas que toca:** `pedidos`, `usuarios`, `menu_variant`, `menu_item`, `delivery_zone`, `restaurante`, `horarios`, `restaurante_config`

**Lógica especial:**
1. Resolver `restaurante_id` desde slug.
2. Verificar `is_open` (misma lógica que endpoint 1). Si cerrado: `422` con `reason: "local_closed"`.
3. Upsert de cliente: llamar `fn_upsert_usuario_perfil(telefono, nombre, direccion, tipo_despacho)` — devuelve `usuario_id`.
4. Si `tipo_despacho = "delivery"`:
   a. Buscar `delivery_zone` donde `delivery_zone_id = zona_id` y `restaurante_id = {id}` y `is_active = true`. Si no: `422`.
   b. `costo_envio = delivery_zone.fee`.
   c. Calcular `subtotal` sumando `(unit_price * quantity) + extras` por ítem.
   d. Verificar `subtotal >= delivery_zone.min_order_amount`. Si no: `422` con `reason: "below_minimum"`, `min_order_amount` y `subtotal_current`.
   e. `tiempo_estimado`: leer `delivery_zone.estimated_minutes_min` + `estimated_minutes_max`; si son NULL usar `restaurante_config` con keys `delivery_eta_min_minutes` / `delivery_eta_max_minutes`.
5. Si `tipo_despacho = "retiro"`:
   a. `costo_envio = 0`.
   b. `direccion = NULL`.
   c. `tiempo_estimado`: leer `restaurante_config` con key `pickup_eta_minutes`.
6. Calcular `total = subtotal + costo_envio`.
7. Insertar en `pedidos`. El trigger `fn_set_pedido_codigo` asigna `pedido_codigo` automáticamente con advisory lock sobre el prefijo de fecha.
8. El JSONB `items` almacena el array completo con `item_name`, `variant_name`, `unit_price`, `quantity`, `extras` — snapshot de precios al momento de la compra.
9. NO enviar notificación WhatsApp en MVP.

---

## 5. GET /public/:slug/orders/:pedido_codigo

**Descripción:** Devuelve el estado y detalle de un pedido para la pantalla de tracking post-confirmación del cliente.

**Auth requerida:** Ninguna (`pedido_codigo` actúa como token implícito de acceso — conocerlo equivale a ser el titular)

**Parámetros de entrada:**
- Path params:
  - [`slug` — identificador del local]
  - [`pedido_codigo` — código único del pedido, formato `YYMMDD-NNNN`, ej: `260421-1001`]
- Query params: —
- Body: —

**Respuesta exitosa:**
- Status: `200`
- Body:
```json
{
  "id": 42,
  "pedido_codigo": "260421-1001",
  "estado": "en_preparacion",
  "tipo_despacho": "delivery",
  "items": [
    {
      "item_name": "Margarita",
      "variant_name": "Individual",
      "quantity": 2,
      "unit_price": 8.50,
      "extras": [
        {
          "name": "Extra Queso Mozzarella",
          "unit_price": 1.50,
          "quantity": 1
        }
      ]
    }
  ],
  "subtotal": 18.50,
  "costo_envio": 2.50,
  "total": 21.00,
  "direccion": "Calle Mayor 12, Arrecife",
  "tiempo_estimado": "30-45 min",
  "metodo_pago": "transferencia",
  "notas": "Sin cebolla por favor",
  "created_at": "2026-04-21T14:32:00Z",
  "updated_at": "2026-04-21T14:35:00Z",
  "datos_transferencia": {
    "banco": "CaixaBank",
    "titular": "La Isla S.L.",
    "iban": "ES12 3456 7890 1234 5678"
  }
}
```

**Notas sobre campos:**
- `datos_transferencia`: incluir SOLO si `metodo_pago = "transferencia"`. Leer de `restaurante.datos_bancarios` (JSONB). Si es `null` o el restaurante no los tiene configurados, omitir el campo.
- `items`: leer directamente del JSONB `pedidos.items` — es el snapshot guardado al crear el pedido.
- No exponer `usuario_id`, `telefono` del cliente, `restaurante_id`, `session_id`.

**Errores posibles:**
- `404`: `pedido_codigo` no existe, o no pertenece al `restaurante_id` del slug (validación de tenant obligatoria)

**Tablas que toca:** `pedidos`, `restaurante`

**Lógica especial:**
- Query: `SELECT * FROM pedidos WHERE pedido_codigo = $1 AND restaurante_id = $2`. El `restaurante_id` se resuelve desde el slug antes — si el código existe pero pertenece a otro tenant: devolver `404` (no revelar existencia cruzada de pedidos).
- El estado `datos_transferencia` se muestra solo cuando `metodo_pago = 'transferencia'` para no exponer datos bancarios innecesariamente.

---

## 6. GET /dashboard/:slug/orders

**Descripción:** Devuelve la lista de pedidos activos del local para el panel del operador, con los datos suficientes para el listado en tiempo real mediante polling.

**Auth requerida:** Bearer JWT (Supabase) — el JWT debe contener un claim que resuelva al `restaurante_id` del slug o el operador debe tener permiso sobre ese slug.

**Parámetros de entrada:**
- Path params: [`slug` — identificador del local]
- Query params:
  - [`estado` (string, opcional) — filtrar por estado: `en_curso`, `confirmado`, `en_preparacion`, `listo`, `en_camino`, `pendiente_pago`; si se omite devuelve todos excepto `entregado` y `cancelado`]
  - [`page` (integer, opcional, default `1`) — paginación]
  - [`limit` (integer, opcional, default `50`) — máximo de resultados]
  - [`fecha` (string ISO date, opcional) — filtrar pedidos del día indicado, ej: `2026-04-21`; default: hoy]
- Body: —

**Respuesta exitosa:**
- Status: `200`
- Body:
```json
{
  "total": 12,
  "page": 1,
  "limit": 50,
  "orders": [
    {
      "id": 42,
      "pedido_codigo": "260421-1001",
      "estado": "en_preparacion",
      "tipo_despacho": "delivery",
      "total": 21.00,
      "subtotal": 18.50,
      "costo_envio": 2.50,
      "metodo_pago": "transferencia",
      "notas": "Sin cebolla",
      "telefono": "+34612345678",
      "nombre_cliente": "Carlos López",
      "direccion": "Calle Mayor 12, Arrecife",
      "tiempo_estimado": "30-45 min",
      "items_count": 2,
      "created_at": "2026-04-21T14:32:00Z",
      "updated_at": "2026-04-21T14:35:00Z"
    }
  ]
}
```

**Notas sobre campos:**
- `nombre_cliente`: leer de `usuarios.nombre` via `pedidos.usuario_id`. Si el usuario no tiene nombre, puede usar `pedidos.telefono`.
- `items_count`: `jsonb_array_length(pedidos.items)` — evita transferir el JSONB completo en el listado.
- Ordenar por `created_at DESC`.
- Los estados `entregado` y `cancelado` se excluyen del default para no sobrecargar el listado operativo.

**Errores posibles:**
- `401`: JWT ausente o inválido
- `403`: JWT válido pero el usuario no tiene acceso al slug solicitado
- `404`: slug no resuelve ningún restaurante

**Tablas que toca:** `pedidos`, `usuarios`, `restaurante`

**Lógica especial:**
- Multi-tenant: `WHERE pedidos.restaurante_id = {restaurante_id}` obligatorio antes de cualquier filtro adicional.
- Si `fecha` se provee: `WHERE DATE(pedidos.created_at AT TIME ZONE restaurante.zona_horaria) = $fecha`.
- Si `estado` se provee: `AND pedidos.estado = $estado`.
- Default sin `estado`: `AND pedidos.estado NOT IN ('entregado', 'cancelado')`.

---

## 7. PATCH /dashboard/:slug/orders/:id/status

**Descripción:** Actualiza el estado de un pedido desde el dashboard del operador, validando que la transición sea permitida según el flujo de estados definido.

**Auth requerida:** Bearer JWT (Supabase)

**Parámetros de entrada:**
- Path params:
  - [`slug` — identificador del local]
  - [`id` — `pedidos.id` del pedido a actualizar]
- Query params: —
- Body:
```json
{
  "estado": "en_preparacion"
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `estado` | string | SI | Nuevo estado. Valores válidos: `confirmado`, `en_preparacion`, `listo`, `en_camino`, `entregado`, `cancelado` |

**Respuesta exitosa:**
- Status: `200`
- Body:
```json
{
  "id": 42,
  "pedido_codigo": "260421-1001",
  "estado_anterior": "confirmado",
  "estado": "en_preparacion",
  "updated_at": "2026-04-21T14:40:00Z"
}
```

**Transiciones de estado permitidas:**

| Estado actual | Transiciones permitidas |
|---|---|
| `en_curso` | `confirmado`, `cancelado` |
| `pendiente_pago` | `confirmado`, `cancelado` |
| `confirmado` | `en_preparacion`, `cancelado` |
| `en_preparacion` | `listo`, `cancelado` |
| `listo` | `en_camino` (delivery), `entregado` (retiro), `cancelado` |
| `en_camino` | `entregado`, `cancelado` |
| `entregado` | — (terminal) |
| `cancelado` | — (terminal) |

**Errores posibles:**
- `400`: `estado` ausente o no es un valor válido del enum
- `401`: JWT ausente o inválido
- `403`: JWT válido pero el usuario no tiene acceso al slug
- `404`: pedido no existe o no pertenece al `restaurante_id` del slug
- `409`: transición no permitida (ej: intentar pasar de `entregado` a `en_curso`)

**Tablas que toca:** `pedidos`

**Lógica especial:**
1. Resolver `restaurante_id` desde slug.
2. Leer el pedido: `SELECT id, estado, tipo_despacho FROM pedidos WHERE id = $id AND restaurante_id = $restaurante_id`. Si no existe: `404`.
3. Consultar la tabla de transiciones permitidas (implementada como constante en la API). Si la transición `estado_actual → estado_nuevo` no está permitida: `409` con `{"error": "transition_not_allowed", "from": "confirmado", "to": "en_curso"}`.
4. `UPDATE pedidos SET estado = $nuevo_estado, updated_at = NOW() WHERE id = $id AND restaurante_id = $restaurante_id`.
5. NO enviar notificación WhatsApp al cliente en MVP.

---

## 8. GET /dashboard/:slug/restaurant/status

**Descripción:** Devuelve el estado de apertura actual del local, incluyendo si hay un override manual activo y el horario del día, para que el operador pueda ver y gestionar el estado desde el dashboard.

**Auth requerida:** Bearer JWT (Supabase)

**Parámetros de entrada:**
- Path params: [`slug` — identificador del local]
- Query params: —
- Body: —

**Respuesta exitosa:**
- Status: `200`
- Body:
```json
{
  "restaurante_id": 1,
  "nombre": "La Isla",
  "is_open": true,
  "is_open_calculated": true,
  "is_open_override": null,
  "override_reason": null,
  "zona_horaria": "Atlantic/Canary",
  "hora_local_actual": "14:32",
  "dia_actual": "Lunes",
  "horario_hoy": {
    "disponible": true,
    "apertura_1": "12:00",
    "cierre_1": "15:30",
    "apertura_2": "19:00",
    "cierre_2": "23:00"
  },
  "horarios_semana": [
    {
      "id": 1,
      "dia": "Lunes",
      "disponible": true,
      "apertura_1": "12:00:00",
      "cierre_1": "15:30:00",
      "apertura_2": "19:00:00",
      "cierre_2": "23:00:00"
    }
  ]
}
```

**Notas sobre campos:**
- `is_open`: valor efectivo final (override tiene precedencia sobre calculado).
- `is_open_calculated`: resultado del cálculo automático por horario, independientemente del override.
- `is_open_override`: valor de `restaurante_config` donde `config_key = 'is_open_override'`. Valores posibles: `"true"`, `"false"`, `null` (no existe el registro).
- `override_reason`: valor de `restaurante_config` donde `config_key = 'is_open_override_reason'`. Pendiente de migración.
- `hora_local_actual` y `dia_actual`: calculados por la API en la `zona_horaria` del restaurante.

**Errores posibles:**
- `401`: JWT ausente o inválido
- `403`: usuario sin acceso al slug
- `404`: slug no resuelve restaurante

**Tablas que toca:** `restaurante`, `horarios`, `restaurante_config`

**Lógica especial:**
- Misma lógica de cálculo de `is_open` que el endpoint 1, pero aquí se expone también `is_open_calculated` por separado para que el operador entienda si hay un override activo.
- Leer clave `is_open_override` de `restaurante_config` con filtro `restaurante_id`. La PK actual de `restaurante_config` es solo `config_key` sin `restaurante_id` — esto es una migración pendiente ⚠️. Hasta que se aplique la migración, leer con `WHERE config_key = 'is_open_override' AND restaurante_id = $restaurante_id`.

---

## 9. PATCH /dashboard/:slug/restaurant/status

**Descripción:** Permite al operador abrir o cerrar el local manualmente mediante un override, sobreescribiendo el cálculo automático por horarios.

**Auth requerida:** Bearer JWT (Supabase)

**Parámetros de entrada:**
- Path params: [`slug` — identificador del local]
- Query params: —
- Body:
```json
{
  "is_open_override": true,
  "reason": "Cerramos antes por evento privado"
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `is_open_override` | boolean o null | SI | `true` = forzar abierto; `false` = forzar cerrado; `null` = eliminar override (volver al cálculo automático) |
| `reason` | string | NO | Texto libre para que el operador anote el motivo del override |

**Respuesta exitosa:**
- Status: `200`
- Body:
```json
{
  "restaurante_id": 1,
  "is_open_override": false,
  "reason": "Cerramos antes por evento privado",
  "is_open_effective": false,
  "updated_at": "2026-04-21T14:45:00Z"
}
```

**Errores posibles:**
- `400`: body malformado; `is_open_override` no es boolean ni null
- `401`: JWT ausente o inválido
- `403`: usuario sin acceso al slug
- `404`: slug no resuelve restaurante
- `503`: migración de `restaurante_config` no aplicada aún (PK compuesto pendiente ⚠️)

**Tablas que toca:** `restaurante_config`

**Lógica especial:**
1. Resolver `restaurante_id` desde slug.
2. Si `is_open_override = null`: `DELETE FROM restaurante_config WHERE config_key = 'is_open_override' AND restaurante_id = $restaurante_id`. También borrar `is_open_override_reason` si existe.
3. Si `is_open_override = true` o `false`:
   - UPSERT en `restaurante_config`: `INSERT INTO restaurante_config (config_key, config_value, restaurante_id, updated_at) VALUES ('is_open_override', $value::text, $restaurante_id, NOW()) ON CONFLICT (config_key, restaurante_id) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW()`.
   - Si `reason` presente: mismo UPSERT con `config_key = 'is_open_override_reason'`.
4. PRECONDICION BLOQUEANTE ⚠️: este endpoint requiere que `restaurante_config` tenga PK compuesto `(config_key, restaurante_id)`. La migración debe aplicarse antes de implementar este endpoint. La PK actual (`config_key` solo) no es multi-tenant.
5. `is_open_effective` en la respuesta: recalcular `is_open` aplicando el nuevo override sobre el horario actual.

---

## 10. GET /dashboard/:slug/home/metrics

**Descripción:** Devuelve las métricas agregadas del día y del período reciente para el panel principal del dashboard del operador.

**Auth requerida:** Bearer JWT (Supabase)

**Parámetros de entrada:**
- Path params: [`slug` — identificador del local]
- Query params:
  - [`fecha` (string ISO date, opcional, default: hoy en la zona horaria del local) — día a consultar, ej: `2026-04-21`]
- Body: —

**Respuesta exitosa:**
- Status: `200`
- Body:
```json
{
  "restaurante_id": 1,
  "fecha": "2026-04-21",
  "zona_horaria": "Atlantic/Canary",
  "today": {
    "pedidos_total": 18,
    "pedidos_confirmados": 12,
    "pedidos_en_preparacion": 3,
    "pedidos_en_camino": 2,
    "pedidos_entregados": 10,
    "pedidos_cancelados": 1,
    "pedidos_pendiente_pago": 2,
    "revenue_total": 387.50,
    "revenue_delivery": 241.00,
    "revenue_retiro": 146.50,
    "ticket_promedio": 21.53,
    "costo_envio_total": 32.50
  },
  "active_orders": {
    "count": 5,
    "oldest_created_at": "2026-04-21T13:15:00Z"
  },
  "last_7_days": {
    "pedidos_total": 94,
    "revenue_total": 1987.20
  }
}
```

**Notas sobre campos:**
- `today.revenue_total`: `SUM(pedidos.total)` filtrando por fecha del local y excluyendo `estado = 'cancelado'`.
- `today.ticket_promedio`: `revenue_total / pedidos_entregados` (usar `pedidos_entregados` como denominador; si es 0 devolver `null`).
- `active_orders.count`: pedidos con `estado NOT IN ('entregado', 'cancelado')` del día actual.
- `active_orders.oldest_created_at`: el `created_at` más antiguo de los pedidos activos — indica si hay pedidos "colgados" sin atender.
- `last_7_days`: conteo y revenue de los últimos 7 días completos (excluyendo hoy), estados `entregado` únicamente para revenue limpio.

**Errores posibles:**
- `401`: JWT ausente o inválido
- `403`: usuario sin acceso al slug
- `404`: slug no resuelve restaurante

**Tablas que toca:** `pedidos`, `restaurante`

**Lógica especial:**
- Todas las comparaciones de fecha deben hacerse en la zona horaria del local: `DATE(pedidos.created_at AT TIME ZONE restaurante.zona_horaria) = $fecha`.
- Multi-tenant: `WHERE pedidos.restaurante_id = $restaurante_id` en todas las subqueries.
- Candidato a cache Redis con TTL de 30 segundos para evitar carga en PostgreSQL en polling frecuente del dashboard.
- Query sugerida para `today`: un único `SELECT` con múltiples `COUNT(*) FILTER (WHERE estado = ...)` y `SUM(total) FILTER (WHERE estado != 'cancelado')` para evitar N queries.

---

## Consideraciones transversales

### Resolución de slug (aplicable a los 10 endpoints)
El slug no existe aún como columna en `restaurante`. Antes de implementar cualquier endpoint, se debe aplicar la siguiente migración:
```sql
ALTER TABLE public.restaurante ADD COLUMN slug VARCHAR(100) UNIQUE NOT NULL;
CREATE UNIQUE INDEX ux_restaurante_slug ON public.restaurante (slug);
UPDATE public.restaurante SET slug = 'la-isla' WHERE id = 1;
```
Una vez aplicada, la resolución es: `SELECT id FROM restaurante WHERE slug = $slug LIMIT 1`. Si no hay resultado: `404`.

### Migraciones pendientes que bloquean endpoints específicos

| Migración | Bloquea endpoint | Prioridad |
|---|---|---|
| Columna `slug` en `restaurante` | Todos (1-10) | CRITICA — pre-requisito global |
| PK compuesto `(config_key, restaurante_id)` en `restaurante_config` | Endpoint 9 | CRITICA — bloquea apertura/cierre manual |
| Columna `is_open_override` (o gestión via `restaurante_config`) | Endpoints 1, 8, 9 | ALTA |
| Columna `image_url` en `menu_item` | Endpoint 2 (parcial — devuelve null mientras no exista) | MEDIA |

### Formato de `pedido_codigo`
Generado automáticamente por el trigger `fn_set_pedido_codigo`. Formato: `YYMMDD-NNNN` (ej: `260421-1001`). El advisory lock es `pg_advisory_xact_lock(hashtextextended('pedido_codigo_' || v_prefix, 0))` — garantiza unicidad bajo concurrencia.

### Aislamiento multi-tenant
En todos los endpoints, `restaurante_id` se resuelve desde el `slug` en la capa API antes de ejecutar cualquier query. Nunca se acepta `restaurante_id` como parámetro externo del cliente. Para endpoints de dashboard, adicionalmente se verifica que el JWT corresponda a un usuario con acceso al `restaurante_id` resuelto.
