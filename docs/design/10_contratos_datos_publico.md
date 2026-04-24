# Contratos de Datos — Frontend Público EasyOrder (MVP)

**Fecha:** 2026-04-21  
**Fuente base:** `08_arbol_pantallas_publico.md` + `01_auditoria_base_datos.md`  
**Convención:** Los nombres de tabla y columna son los del DDL actual. Las columnas marcadas con ⚠️ no existen aún en la BD — requieren migración.

---

## Notas previas: gaps entre diseño y BD actual

El diseño usa nombres de la capa conceptual (`businesses`, `customers`, `orders`). La BD actual usa:

| Concepto diseño | Tabla real |
|---|---|
| `businesses` | `restaurante` |
| `customers` | `usuarios` |
| `orders` | `pedidos` |
| `order_items` | `pedidos.items` (campo jsonb) |

Columnas que el diseño asume pero **no existen** en el DDL actual:

| Campo asumido | Tabla | Estado |
|---|---|---|
| `slug` | `restaurante` | ⚠️ Faltante — clave de routing por local |
| `logo_url` | `restaurante` | ⚠️ Faltante |
| `brand_color` | `restaurante` | ⚠️ Faltante |
| `description` | `restaurante` | ⚠️ Faltante |
| `is_open` | `restaurante` | ⚠️ Se deriva de `horarios` + hora actual — no hay flag directo |
| `delivery_enabled` | `restaurante` | ⚠️ Faltante |
| `pickup_enabled` | `restaurante` | ⚠️ Faltante |
| `delivery_min_order` | `restaurante` | ⚠️ No en tabla, posible en `restaurante_config` |
| `payment_methods` | `restaurante` | ⚠️ Faltante (array de métodos habilitados) |
| `base_price` | `menu_item` | ⚠️ No existe — el precio está solo en `menu_variant.price` |
| `image_url` | `menu_item` | ⚠️ Faltante |
| `requires_variant` | `menu_item` | ⚠️ Derivable: si existen variantes activas → requiere variante |
| `whatsapp_number` | `restaurante` | Existe como `restaurante.telefono` |
| `estimated_time` | `restaurante` / `config_operativa` | Existe en `config_operativa.tiempo_espera_minutos` |

---

## Pantalla 1 — Landing del local

**URL:** `/:slug`

- **Datos necesarios:**
  - `restaurante.nombre` — nombre del local
  - `restaurante.slug` ⚠️ — para resolución de tenant
  - `restaurante.descripcion` ⚠️ — descripción breve
  - `restaurante.logo_url` ⚠️ — logo del local
  - `restaurante.brand_color` ⚠️ — color de marca para theming
  - `restaurante.direccion` — dirección física
  - `restaurante.delivery_enabled` ⚠️ — etiqueta "Delivery disponible"
  - `restaurante.pickup_enabled` ⚠️ — etiqueta "Retiro en local"
  - `horarios` (todos los registros del local) — para derivar `is_open` y próxima apertura
  - `restaurante.zona_horaria` — para calcular hora actual correctamente (default `Atlantic/Canary`)

- **¿Requiere auth?:** No

- **¿Datos en tiempo real o estáticos?:**
  - `restaurante.*` → cacheables (TTL largo, cambian solo si el dueño edita)
  - `horarios` → cacheables con TTL corto (5-10 min) o derivar `is_open` en cliente con los datos de horarios ya cacheados

- **¿Qué endpoint o query lo resuelve?:**
  - Query única: `SELECT * FROM restaurante WHERE slug = $1` + `SELECT * FROM horarios WHERE restaurante_id = $id`
  - O una vista/función que retorne ambos conjuntos en una sola llamada
  - En Supabase: `GET /rest/v1/restaurante?slug=eq.{slug}&select=*,horarios(*)` (con join)

---

## Pantalla 2 — Menú del local

**URL:** `/:slug/menu`

- **Datos necesarios:**
  - `restaurante.nombre`, `restaurante.logo_url` ⚠️, `restaurante.brand_color` ⚠️ — header compacto
  - `restaurante.delivery_min_order` ⚠️ (o `restaurante_config` donde `config_key = 'delivery_min_order'`) — aviso de mínimo en carrito
  - `horarios.*` del local — estado abierto/cerrado (reutilizable desde Landing si ya está cacheado)
  - `menu_category.menu_category_id`, `menu_category.name`, `menu_category.sort_order`, `menu_category.is_active` — tabs de categorías
  - `menu_item.menu_item_id`, `menu_item.menu_category_id`, `menu_item.name`, `menu_item.description`, `menu_item.is_active`, `menu_item.image_url` ⚠️, `menu_item.tags`
  - `menu_variant.menu_variant_id`, `menu_variant.menu_item_id`, `menu_variant.variant_name`, `menu_variant.price`, `menu_variant.is_active` — para mostrar rango de precio (min-max) y detectar si requiere variante
  - Derivado: `requires_variant` → `TRUE` si el ítem tiene al menos una variante activa

- **¿Requiere auth?:** No

- **¿Datos en tiempo real o estáticos?:**
  - Todo el catálogo es cacheable con TTL moderado (2-5 min)
  - El estado `is_open` requiere recalcularse cada minuto en cliente (los datos de horarios ya están cargados)

- **¿Qué endpoint o query lo resuelve?:**
  - Función existente `fn_menu_catalog()` — retorna catálogo plano con categoría, producto, variante y precio. Falta image_url ⚠️.
  - Alternativa directa: query con JOIN `menu_category → menu_item → menu_variant` filtrado por `restaurante_id` y `is_active = true`
  - Solo cargar categorías e ítems activos; las variantes de cada ítem se incluyen en la misma respuesta

---

## Pantalla 3 — Detalle de producto

**URL:** `/:slug/menu/producto/:item_id`

- **Datos necesarios:**
  - `menu_item.menu_item_id`, `menu_item.name`, `menu_item.description`, `menu_item.image_url` ⚠️
  - `menu_variant.menu_variant_id`, `menu_variant.variant_name`, `menu_variant.price`, `menu_variant.is_default`, `menu_variant.is_active` — selector de variante
  - `extra.extra_id`, `extra.name`, `extra.price`, `extra.is_active` — filtrados por `menu_item_extra`
  - `menu_item_extra.is_default` — para saber qué extras vienen incluidos por defecto
  - Derivado: `requires_variant` → si existen variantes activas para el ítem

- **¿Requiere auth?:** No

- **¿Datos en tiempo real o estáticos?:**
  - Cacheables (mismo TTL que el catálogo). Si el menú general ya fue cargado en Pantalla 2, los datos del ítem ya están en cliente — no requiere llamada adicional.

- **¿Qué endpoint o query lo resuelve?:**
  - Si el catálogo completo ya está en cliente (cargado en Pantalla 2): resolución local sin red
  - Si se implementa como ruta separada: query `menu_item` por `menu_item_id` + JOIN `menu_variant` + JOIN `menu_item_extra` + JOIN `extra`
  - En Supabase: `GET /rest/v1/menu_item?menu_item_id=eq.{id}&select=*,menu_variant(*),menu_item_extra(extra(*))`

---

## Pantalla 4 — Carrito

**URL:** `/:slug/carrito`

- **Datos necesarios:**
  - **Estado local del cliente** (sessionStorage/localStorage): ítems agregados con `menu_item_id`, `menu_variant_id`, extras seleccionados, cantidades — no viene de BD en tiempo real
  - `restaurante.tarifa_envio_valor` — costo de envío para cálculo de total
  - `restaurante.delivery_min_order` ⚠️ — para aviso de mínimo
  - `restaurante.delivery_enabled` ⚠️, `restaurante.pickup_enabled` ⚠️ — para saber qué tipos de despacho mostrar
  - Validación de precios actuales antes de continuar: `menu_variant.price` por cada variante en carrito (evitar precio desactualizado si el menú cambió durante la sesión)

- **¿Requiere auth?:** No

- **¿Datos en tiempo real o estáticos?:**
  - Configuración del local (tarifa, mínimo): cacheable desde la carga del menú
  - Validación de precios al hacer "Continuar": requiere llamada puntual a BD para verificar que los precios del carrito local siguen vigentes

- **¿Qué endpoint o query lo resuelve?:**
  - Datos del local: ya disponibles desde carga del menú (sin llamada extra)
  - Validación de precios: query `menu_variant` por array de `menu_variant_id` presentes en el carrito — comparar `price` devuelto vs precio almacenado localmente
  - En Supabase: `GET /rest/v1/menu_variant?menu_variant_id=in.(id1,id2,...)&select=menu_variant_id,price`

---

## Pantalla 5.1 — Checkout: Datos del cliente

**URL:** `/:slug/checkout/datos`

- **Datos necesarios:**
  - **Entrada del usuario:** `nombre` (texto libre), `telefono` (texto, prefijo +34 / +56 / configurable)
  - Lookup opcional: `usuarios.nombre`, `usuarios.direccion_frecuente` WHERE `usuarios.telefono = $telefono AND usuarios.restaurante_id = $id` — para pre-cargar si el cliente ya existe
  - ⚠️ Nota: `usuarios_telefono_key UNIQUE (telefono)` no incluye `restaurante_id` — en multi-tenant esto es un bug. El lookup debe filtrarse también por `restaurante_id`.

- **¿Requiere auth?:** No

- **¿Datos en tiempo real o estáticos?:**
  - Lookup de cliente: consulta puntual al ingresar el teléfono (debounce ~800ms tras teclear)

- **¿Qué endpoint o query lo resuelve?:**
  - `SELECT nombre, direccion_frecuente FROM usuarios WHERE telefono = $1 AND restaurante_id = $2 LIMIT 1`
  - En Supabase: `GET /rest/v1/usuarios?telefono=eq.{tel}&restaurante_id=eq.{id}&select=nombre,direccion_frecuente&limit=1`
  - Si no existe el cliente: no error, simplemente no hay pre-carga — el cliente completa manualmente

---

## Pantalla 5.2 — Checkout: Tipo de despacho y dirección

**URL:** `/:slug/checkout/despacho`

- **Datos necesarios:**
  - `restaurante.delivery_enabled` ⚠️, `restaurante.pickup_enabled` ⚠️ — qué cards mostrar
  - `restaurante.tarifa_envio_valor` — "Costo de envío: X €"
  - `restaurante.delivery_min_order` ⚠️ — aviso de mínimo de delivery
  - `restaurante.radio_cobertura_km` + `restaurante.lat` + `restaurante.long` — validación de zona de cobertura (cálculo de distancia cliente ↔ local)
  - `usuarios.direccion_frecuente`, `usuarios.lat_frecuente`, `usuarios.long_frecuente` — pre-carga si teléfono fue ingresado en paso anterior

- **¿Requiere auth?:** No

- **¿Datos en tiempo real o estáticos?:**
  - Configuración del local: cacheable (ya disponible desde carga del menú)
  - Dirección frecuente del cliente: ya disponible desde lookup en paso 5.1
  - Validación de zona: cálculo en cliente con los datos de lat/long del local ya cargados (distancia Haversine)

- **¿Qué endpoint o query lo resuelve?:**
  - No requiere nueva llamada a BD si los datos del local están cacheados y el lookup de cliente se hizo en el paso anterior
  - Validación de zona: cálculo geográfico en frontend con `restaurante.lat`, `restaurante.long`, `restaurante.radio_cobertura_km`

---

## Pantalla 5.3 — Checkout: Método de pago

**URL:** `/:slug/checkout/pago`

- **Datos necesarios:**
  - `restaurante.payment_methods` ⚠️ — array de métodos habilitados por el local (Efectivo, Tarjeta, Transferencia, etc.)
  - Estado acumulado del carrito (local): subtotal + costo envío → total mostrado en resumen

- **¿Requiere auth?:** No

- **¿Datos en tiempo real o estáticos?:**
  - `payment_methods`: cacheable (configuración del local, cambia raramente)
  - Total: derivado en cliente de estado local

- **¿Qué endpoint o query lo resuelve?:**
  - Si `payment_methods` se guarda en `restaurante_config` (como valor JSON): `SELECT config_value FROM restaurante_config WHERE config_key = 'payment_methods' AND restaurante_id = $1`
  - En Supabase: `GET /rest/v1/restaurante_config?config_key=eq.payment_methods&restaurante_id=eq.{id}&select=config_value`
  - Alternativa: incluir `payment_methods` como columna jsonb directamente en `restaurante` ⚠️

---

## Pantalla 5.4 — Checkout: Resumen y confirmación

**URL:** `/:slug/checkout/confirmar`

- **Datos necesarios:**
  - Todo el estado acumulado en cliente: ítems + variantes + extras + nombre + teléfono + tipo despacho + dirección + método de pago + totales
  - `restaurante.telefono` — usado como `whatsapp_number` para construir `wa.me/{numero}?text={mensaje}`
  - `restaurante.datos_bancarios` (jsonb) — si el método es Transferencia, mostrar instrucciones de pago
  - Al confirmar → INSERT en `pedidos`: `restaurante_id`, `telefono`, `items` (jsonb), `subtotal`, `costo_envio`, `total`, `tipo_despacho`, `direccion`, `metodo_pago`, `estado` (`confirmado` o `pendiente_pago`)
  - Trigger `fn_set_pedido_codigo` genera `pedido_codigo` automáticamente al insertar

- **¿Requiere auth?:** No

- **¿Datos en tiempo real o estáticos?:**
  - Datos del local (`telefono`, `datos_bancarios`): cacheables
  - INSERT en `pedidos`: operación de escritura puntual al confirmar

- **¿Qué endpoint o query lo resuelve?:**
  - Lectura: ya disponible desde caché del menú y pasos anteriores
  - Escritura: `INSERT INTO pedidos (...) VALUES (...) RETURNING id, pedido_codigo, estado`
  - En Supabase: `POST /rest/v1/pedidos` con body JSON del pedido completo

---

## Pantalla 6 — Estado del pedido

**URL:** `/:slug/pedido/estado?id={order_id}` o `/:slug/pedido/:order_code`

- **Datos necesarios:**
  - `pedidos.id`, `pedidos.pedido_codigo` — identificador visible del pedido
  - `pedidos.estado` — `en_curso` / `confirmado` / `pendiente_pago` / `pagado` / etc.
  - `pedidos.items` (jsonb) — resumen de ítems pedidos
  - `pedidos.tipo_despacho`, `pedidos.total`, `pedidos.metodo_pago`, `pedidos.created_at`
  - `config_operativa.tiempo_espera_minutos` + `config_operativa.mensaje_tiempo_espera` — tiempo estimado de preparación
  - `restaurante.datos_bancarios` — si `metodo_pago = 'transferencia'`, mostrar instrucciones de pago

- **¿Requiere auth?:** No — el cliente llega con el `order_id` o `pedido_codigo` desde la pantalla anterior. El `pedido_codigo` actúa como token implícito.

- **¿Datos en tiempo real o estáticos?:**
  - `pedidos.estado`: en MVP, polling cada 30s o mostrar estado inicial fijo "Recibido"
  - Resto de datos del pedido: estáticos tras la creación

- **¿Qué endpoint o query lo resuelve?:**
  - `SELECT p.*, c.tiempo_espera_minutos, c.mensaje_tiempo_espera FROM pedidos p JOIN config_operativa c ON c.restaurante_id = p.restaurante_id WHERE p.pedido_codigo = $1 OR p.id = $2`
  - En Supabase: `GET /rest/v1/pedidos?pedido_codigo=eq.{code}&select=*,config_operativa(tiempo_espera_minutos,mensaje_tiempo_espera)` o por id
  - Para `datos_bancarios`: incluir en JOIN con `restaurante` si el método de pago es transferencia

---

## Pantalla auxiliar — Local cerrado

**URL:** `/:slug` o `/:slug/menu` (estado condicional)

- **Datos necesarios:**
  - `restaurante.nombre` — ya disponible
  - `horarios.*` del local — para calcular próxima apertura
  - `restaurante.zona_horaria` — para calcular hora actual correcta (default `Atlantic/Canary`)
  - Derivado en cliente: `is_open` (booleano) + `next_opening` (timestamp de próxima apertura)

- **¿Requiere auth?:** No

- **¿Datos en tiempo real o estáticos?:**
  - `horarios`: cacheable (TTL largo). El cálculo de `is_open` se hace en cliente cada minuto con los datos de horarios ya cargados.

- **¿Qué endpoint o query lo resuelve?:**
  - Sin llamada adicional — usa los datos de horarios ya cargados en Pantalla 1 o 2

---

## Resumen de endpoints únicos necesarios

| # | Descripción | Tablas tocadas | Tipo |
|---|---|---|---|
| 1 | Datos del local por slug | `restaurante`, `horarios` | GET — cacheable |
| 2 | Catálogo completo del menú | `menu_category`, `menu_item`, `menu_variant` | GET — cacheable |
| 3 | Extras por ítem | `menu_item_extra`, `extra` | GET — cacheable (incluible en catálogo) |
| 4 | Lookup de cliente por teléfono | `usuarios` | GET — puntual |
| 5 | Métodos de pago del local | `restaurante_config` o `restaurante` | GET — cacheable |
| 6 | Validación de precios del carrito | `menu_variant` | GET — puntual antes de continuar |
| 7 | Crear pedido | `pedidos` | POST — escritura |
| 8 | Estado del pedido | `pedidos`, `config_operativa`, `restaurante` | GET — polling 30s en MVP |

---

## Columnas a agregar en migración para que el frontend funcione

| Tabla | Columna | Tipo sugerido | Obligatoria para MVP |
|---|---|---|---|
| `restaurante` | `slug` | `varchar(80) UNIQUE NOT NULL` | ✅ Sí — es la clave de routing |
| `restaurante` | `logo_url` | `text` | ✅ Sí |
| `restaurante` | `descripcion` | `text` | ✅ Sí |
| `restaurante` | `brand_color` | `varchar(7)` (hex) | Opcional |
| `restaurante` | `delivery_enabled` | `bool DEFAULT true` | ✅ Sí |
| `restaurante` | `pickup_enabled` | `bool DEFAULT true` | ✅ Sí |
| `restaurante` | `delivery_min_order` | `numeric(10,2)` | ✅ Sí |
| `restaurante` | `payment_methods` | `jsonb` o `text[]` | ✅ Sí |
| `menu_item` | `image_url` | `text` | Opcional (UX mejor con imagen) |
| `menu_item` | `base_price` | `numeric(10,2)` | Opcional — precio cuando no hay variante |
