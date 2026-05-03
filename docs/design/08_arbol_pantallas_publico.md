# Árbol de Pantallas — Frontend Público EasyOrder (MVP)

Scope: menú digital + flujo de pedido web por local. No cubre dashboard administrativo.
Cada pantalla corresponde a un estado de URL único y navegable.

---

## Pantalla 1 — Landing del local

- **Nombre:** Landing del local
- **URL:** `/:slug`
- **Qué muestra:** Cabecera con logo, nombre, descripción breve del local e indicador de estado (abierto / cerrado con próxima apertura). Acceso directo al menú como acción principal.
- **Datos que necesita de la base:**
  - `businesses`: `name`, `slug`, `description`, `logo_url`, `brand_color`, `is_open`, `opening_hours`, `address`
  - `businesses`: `delivery_enabled`, `pickup_enabled` (para mostrar etiquetas de tipo de servicio)
- **Acciones posibles del usuario:**
  - Ver información del local
  - Ir al menú (CTA principal)
  - Ver estado del local (abierto / cerrado / horario)
- **A dónde va después:** `/:slug/menu`
- **Notas:**
  - Si el local está cerrado, el CTA al menú muestra el próximo horario y bloquea agregar al carrito (validación también en `/:slug/menu`)
  - El slug identifica al negocio en todo el flujo

---

## Pantalla 2 — Menú del local

- **Nombre:** Menú
- **URL:** `/:slug/menu`
- **Qué muestra:** Header compacto del local (logo + nombre + estado). Tabs o secciones de categorías con scroll. Grid de productos por categoría. Carrito lateral en desktop / botón flotante con contador en mobile.
- **Datos que necesita de la base:**
  - `businesses`: `name`, `logo_url`, `brand_color`, `is_open`, `opening_hours`, `delivery_min_order`
  - `menu_category`: `id`, `name`, `sort_order`, `is_active`
  - `menu_item`: `id`, `category_id`, `name`, `description`, `base_price`, `image_url`, `is_active`, `requires_variant`
  - `menu_variant`: `id`, `item_id`, `name`, `price` (para mostrar rango de precio si tiene variantes)
- **Acciones posibles del usuario:**
  - Navegar entre categorías
  - Ver producto en detalle (tap/click en card)
  - Agregar producto directo al carrito si no requiere variante ni extra
  - Ver carrito acumulado
  - Ir al carrito para proceder al checkout
- **A dónde va después:**
  - Card de producto con variantes o extras → `/:slug/menu/producto/:item_id`
  - Botón "Ver carrito" / "Continuar" → `/:slug/carrito`
- **Notas:**
  - Si el local está cerrado: banner visible, botón de agregar deshabilitado, se muestra próxima apertura
  - Si el carrito tiene ítems y el monto no alcanza el mínimo de delivery, mostrar aviso inline en el carrito antes de continuar (no bloquear en checkout tardío)

---

## Pantalla 3 — Detalle de producto

- **Nombre:** Detalle de producto
- **URL:** `/:slug/menu/producto/:item_id`
- **Qué muestra:** Imagen grande del producto, nombre, descripción completa, precio base. Selector de variante (tamaño u otro) si el producto lo requiere. Lista de extras disponibles con precio adicional. Selector de cantidad. Botón "Agregar al pedido".
- **Datos que necesita de la base:**
  - `menu_item`: `id`, `name`, `description`, `base_price`, `image_url`, `requires_variant`
  - `menu_variant`: `id`, `item_id`, `name`, `price`
  - `extra`: `id`, `name`, `price` (extras asociados al item o categoría)
  - `menu_item_extra` (tabla de relación si existe) o campo `extras` en `menu_item`
- **Acciones posibles del usuario:**
  - Seleccionar variante (obligatorio si `requires_variant = true`)
  - Seleccionar extras (opcional)
  - Ajustar cantidad
  - Agregar al carrito
  - Volver al menú sin agregar
- **A dónde va después:**
  - Al agregar → regresa a `/:slug/menu` con carrito actualizado
  - Al cancelar → regresa a `/:slug/menu`
- **Notas:**
  - Si el producto requiere variante y no se selecciona ninguna, el botón "Agregar" permanece deshabilitado
  - El precio total del ítem en el detalle se actualiza en tiempo real según variante y extras seleccionados
  - Esta pantalla puede implementarse como panel deslizante (sheet) sobre el menú en lugar de URL separada; la URL se mantiene para permitir deep link y accesibilidad

---

## Pantalla 4 — Carrito

- **Nombre:** Carrito
- **URL:** `/:slug/carrito`
- **Qué muestra:** Lista de ítems agregados con nombre, variante, extras, cantidad y precio unitario. Controles para modificar cantidad o eliminar ítem. Subtotal, costo de envío (si aplica) y total. Aviso si el monto no alcanza el mínimo de delivery (si el cliente ya indicó intención de delivery en sesión previa). Botón "Continuar con el pedido".
- **Datos que necesita de la base:**
  - Estado del carrito: almacenado en estado local del cliente (sessionStorage / localStorage) durante el flujo
  - `businesses`: `delivery_min_order`, `delivery_price`, `delivery_enabled`, `pickup_enabled`
  - `menu_item`, `menu_variant`, `extra`: para validar precios actuales antes de continuar
- **Acciones posibles del usuario:**
  - Aumentar o disminuir cantidad de un ítem
  - Eliminar ítem del carrito
  - Vaciar carrito
  - Continuar al checkout
  - Volver al menú para agregar más productos
- **A dónde va después:** `/:slug/checkout/datos`
- **Notas:**
  - El carrito es el punto de revisión antes de comprometer datos del cliente
  - Si el carrito queda vacío al eliminar ítems, mostrar estado vacío con CTA de volver al menú
  - No se confirma ningún tipo de despacho aquí; eso ocurre en el checkout

---

## Pantalla 5 — Checkout (flujo de 3 pasos)

El checkout es una pantalla única con indicador de progreso de pasos. Cada paso tiene su URL para permitir navegación con "atrás" del navegador.

### Paso 5.1 — Datos del cliente

- **Nombre:** Checkout — Datos del cliente
- **URL:** `/:slug/checkout/datos`
- **Qué muestra:** Pregunta "¿A nombre de quién va el pedido?" con campo de nombre y campo de teléfono (prefijo CL +56 por defecto). Indicador de progreso: Datos > Despacho > Confirmar.
- **Datos que necesita de la base:**
  - `customers`: `name`, `phone` — para pre-cargar si el teléfono ya fue usado antes (opcional en MVP, requiere lookup por `phone`)
- **Acciones posibles del usuario:**
  - Ingresar nombre
  - Ingresar teléfono
  - Continuar al paso de despacho
  - Volver al carrito
- **A dónde va después:** `/:slug/checkout/despacho`
- **Notas:**
  - El nombre es obligatorio para continuar (regla de negocio: pedir nombre antes de confirmar pedido)
  - El teléfono es necesario para asociar el pedido al cliente y para el mensaje de WhatsApp

---

### Paso 5.2 — Tipo de despacho y dirección

- **Nombre:** Checkout — Despacho
- **URL:** `/:slug/checkout/despacho`
- **Qué muestra:** Dos cards visuales: "Delivery" y "Retiro en local". Si se selecciona Delivery, aparece campo de dirección y validación de zona de cobertura. Si se selecciona Retiro, el campo de dirección no aparece. Muestra costo de envío calculado o "Sin costo de envío" para retiro. Aviso si no alcanza el mínimo de delivery.
- **Datos que necesita de la base:**
  - `businesses`: `delivery_enabled`, `pickup_enabled`, `delivery_price`, `delivery_min_order`, `delivery_zones` (o tabla equivalente)
  - `customers`: `address` — para pre-cargar última dirección frecuente si el teléfono fue ingresado en paso anterior
- **Acciones posibles del usuario:**
  - Seleccionar tipo de despacho (Delivery / Retiro)
  - Ingresar dirección (solo si Delivery)
  - Validar si la dirección está en zona de cobertura
  - Continuar al paso de confirmación
  - Volver al paso de datos
- **A dónde va después:** `/:slug/checkout/confirmar`
- **Notas:**
  - Si se selecciona Delivery y el carrito no alcanza el mínimo: mostrar aviso con monto faltante, no permitir avanzar; ofrecer "Agregar más productos" (vuelve al menú) o "Cambiar a Retiro"
  - Si se selecciona Delivery y la dirección no está en zona: indicar que no hay cobertura, no bloquear el flujo completo pero sí el avance al siguiente paso
  - El sistema NO cambia de Delivery a Retiro de forma silenciosa; el cambio debe ser acción explícita del usuario
  - Regla: para Retiro nunca pedir dirección

---

### Paso 5.3 — Método de pago

- **Nombre:** Checkout — Método de pago
- **URL:** `/:slug/checkout/pago`
- **Qué muestra:** Lista de métodos de pago habilitados por el local (Efectivo, Tarjeta, Transferencia, Bizum, Online). Selección por radio button o card. Resumen del total con costo de envío incluido.
- **Datos que necesita de la base:**
  - `businesses`: `payment_methods` (array de métodos habilitados)
- **Acciones posibles del usuario:**
  - Seleccionar método de pago
  - Continuar al resumen final
  - Volver al paso de despacho
- **A dónde va después:** `/:slug/checkout/confirmar`
- **Notas:**
  - El sistema NO asume ningún método de pago; el usuario debe elegir explícitamente
  - Este paso es obligatorio; no se puede llegar al resumen sin haber seleccionado método de pago
  - Si el método seleccionado es Transferencia, el pedido quedará en estado `pendiente_pago` al confirmar

---

### Paso 5.4 — Resumen y confirmación

- **Nombre:** Checkout — Confirmar pedido
- **URL:** `/:slug/checkout/confirmar`
- **Qué muestra:** Resumen completo: lista de ítems con cantidades y precios, nombre del cliente, tipo de despacho, dirección (si aplica), método de pago, subtotal, costo de envío, total. Aviso explicativo: "Se abrirá WhatsApp con tu pedido. Solo toca enviar." Botón final "Enviar pedido por WhatsApp" en verde con ícono de WhatsApp.
- **Datos que necesita de la base:**
  - Todo el estado acumulado del flujo (carrito + datos del cliente + despacho + pago)
  - `businesses`: `whatsapp_number` — para construir el link `wa.me/`
- **Acciones posibles del usuario:**
  - Revisar el pedido completo
  - Editar sección específica (volver a paso anterior)
  - Confirmar y abrir WhatsApp con el mensaje pre-armado
- **A dónde va después:** `/:slug/pedido/estado` (después de abrir WhatsApp)
- **Notas:**
  - Esta pantalla solo es accesible si los pasos anteriores fueron completados correctamente
  - El mensaje pre-armado para WhatsApp debe incluir: nombre, teléfono, ítems con variantes y extras, tipo de despacho, dirección (si aplica), método de pago, total
  - El link de WhatsApp usa `wa.me/{numero}?text={mensaje_codificado}`
  - Si el método es Transferencia, el estado del pedido al crear el registro será `pendiente_pago`; en otros métodos será `confirmado`

---

## Pantalla 6 — Estado del pedido

- **Nombre:** Estado del pedido
- **URL:** `/:slug/pedido/estado?id={order_id}` o `/:slug/pedido/:order_code`
- **Qué muestra:** Número o código del pedido, estado actual (Recibido / En preparación / Listo para retiro / En camino), resumen de ítems, tipo de despacho y tiempo estimado si el local lo configuró. Mensaje distinto si el pedido está en `pendiente_pago` (instrucciones de transferencia).
- **Datos que necesita de la base:**
  - `orders`: `id`, `order_code`, `status`, `items` (o relación a `order_items`), `dispatch_type`, `total`, `payment_method`, `created_at`
  - `businesses`: `estimated_time` (tiempo estimado de preparación o delivery)
- **Acciones posibles del usuario:**
  - Ver estado actual del pedido
  - Volver al menú (para hacer un pedido nuevo)
- **A dónde va después:** `/:slug/menu` (si el cliente quiere pedir de nuevo)
- **Notas:**
  - Esta pantalla es post-WhatsApp; el cliente llega aquí después de enviar el mensaje
  - En MVP, el estado puede actualizarse por polling simple (cada 30s) o mostrarse como estado inicial fijo "Recibido" sin tiempo real
  - Si `payment_method = transferencia`, mostrar instrucciones de pago del local junto al estado
  - Si el `order_id` no existe o no corresponde al teléfono del cliente, mostrar mensaje claro de error

---

## Pantalla auxiliar — Local cerrado

- **Nombre:** Local cerrado
- **URL:** `/:slug` o `/:slug/menu` (misma URL, estado condicional)
- **Qué muestra:** Banner o pantalla de estado cerrado con nombre del local, horario de próxima apertura. El menú puede seguir visible como referencia pero sin posibilidad de agregar al carrito.
- **Datos que necesita de la base:**
  - `businesses`: `is_open`, `opening_hours` (para calcular próxima apertura con zona horaria `Atlantic/Canary`)
- **Acciones posibles del usuario:**
  - Ver el menú (solo lectura)
  - Ver próximo horario de apertura
- **A dónde va después:** No permite avanzar al checkout
- **Notas:**
  - No es una pantalla separada; es un estado condicional de `/:slug/menu`
  - La validación de horario usa zona horaria del local, no del cliente

---

## Resumen del flujo completo

```
/:slug
  └── /:slug/menu
        └── /:slug/menu/producto/:item_id  (panel/sheet sobre el menú)
              └── /:slug/carrito
                    └── /:slug/checkout/datos
                          └── /:slug/checkout/despacho
                                └── /:slug/checkout/pago
                                      └── /:slug/checkout/confirmar
                                            └── [abre WhatsApp externo]
                                                  └── /:slug/pedido/estado?id=...
```

---

## Tabla de rutas

| Pantalla | URL | Paso en flujo |
|---|---|---|
| Landing del local | `/:slug` | Entrada |
| Menú | `/:slug/menu` | 1 |
| Detalle de producto | `/:slug/menu/producto/:item_id` | 1a (opcional) |
| Carrito | `/:slug/carrito` | 2 |
| Checkout — Datos | `/:slug/checkout/datos` | 3a |
| Checkout — Despacho | `/:slug/checkout/despacho` | 3b |
| Checkout — Pago | `/:slug/checkout/pago` | 3c |
| Checkout — Confirmar | `/:slug/checkout/confirmar` | 3d |
| Estado del pedido | `/:slug/pedido/estado` | 4 |

---

## Dependencias de datos por pantalla (resumen)

| Pantalla | Tablas principales |
|---|---|
| Landing | `businesses` |
| Menú | `businesses`, `menu_category`, `menu_item`, `menu_variant` |
| Detalle producto | `menu_item`, `menu_variant`, `extra` |
| Carrito | estado local + `businesses` (mínimos y envío) |
| Checkout datos | estado local + `customers` (lookup opcional) |
| Checkout despacho | `businesses` (zonas, mínimo, precio envío) + `customers` (dirección previa) |
| Checkout pago | `businesses` (métodos habilitados) |
| Checkout confirmar | estado local acumulado + `businesses` (whatsapp_number) |
| Estado pedido | `orders`, `order_items`, `businesses` (tiempo estimado) |
