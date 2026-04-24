# Contratos de Datos — Dashboard Administrativo MVP
**Fecha:** 2026-04-21
**Fuentes:** `12_navegacion_dashboard.md`, `01_auditoria_base_datos.md`, `02_auditoria_datos_semilla.md`

---

## Advertencias globales antes de leer los contratos

### ⚠ Gap crítico: estados de pedido
El diseño de navegación (`12_navegacion_dashboard.md`) asume los estados: `pendiente`, `confirmado`, `preparando`, `listo`, `entregado`, `cancelado`.
El esquema real de `pedidos.estado` usa: `en_curso`, `pendiente_pago`, `confirmado`, `pagado`.

**Los estados `preparando`, `listo`, `entregado` no existen en la BD actual.** Antes de implementar cualquier módulo de pedidos, hay que definir y migrar el enum de estados o hacer mapeo explícito en la capa de API.

### ⚠ Gap crítico: control manual de apertura
El diseño requiere un campo de override manual de estado del local ("Abrir ahora / Cerrar ahora"). Ninguna tabla del esquema actual tiene este campo. Se necesita añadir una clave en `restaurante_config` (ej: `is_open_override` con valores `auto | open | closed`) antes de implementar el módulo de Home y Horarios.

### ⚠ Gap: tabla `delivery_zone` no documentada en DDL
La tabla aparece en los datos semilla (DML) pero no en la auditoría DDL. Las columnas inferidas del DML son: `restaurante_id`, `codigo_postal`, `nombre_zona`, `tarifa_envio`, `pedido_minimo`, `tiempo_estimado_min`, `tiempo_estimado_max`, `activa`. Verificar DDL real antes de implementar el módulo de Delivery.

### ⚠ Gap: `restaurante` no tiene slug
El routing del dashboard usa `/dashboard/[slug]/...`. La tabla `restaurante` solo tiene `id` y `nombre`. Se necesita añadir columna `slug` (unique, text) o derivarla en la capa de aplicación.

---

## Módulo: Resumen operativo

**Ruta:** `/dashboard/[slug]/home`

### Datos que lee

| Tabla | Campos | Para qué |
|---|---|---|
| `pedidos` | `estado`, `total`, `created_at`, `restaurante_id`, `telefono`, `tipo_despacho`, `pedido_codigo`, `updated_at` | Tarjetas de métricas + tabla "Pedidos recientes" |
| `restaurante` | `id`, `nombre` | Cabecera del sidebar |
| `horarios` | `dia`, `disponible`, `apertura_1`, `cierre_1`, `apertura_2`, `cierre_2`, `restaurante_id` | Lógica de apertura por horario |
| `restaurante_config` | `is_open_override` (**campo a crear**), `timezone` | Banner de estado manual del local |

### Datos que escribe

| Tabla | Campo | Operación | Cuándo |
|---|---|---|---|
| `restaurante_config` | `is_open_override` (**a crear**) | UPSERT | Al pulsar "Abrir ahora", "Por horario" o "Cerrar ahora" |

### ¿Requiere filtro por `restaurante_id`?
**Sí.** Todas las queries de `pedidos` deben incluir `WHERE restaurante_id = :id`. Sin esto, un local vería pedidos de otros.

### ¿Necesita datos en tiempo real?
**Sí.** Las tarjetas de métricas (especialmente "Pedidos activos") y la tabla de pedidos recientes deben reflejar cambios producidos por el agente n8n. Recomendado: polling cada 30 segundos o WebSocket sobre tabla `pedidos`.

### Métricas calculables con datos actuales sin trabajo extra

```sql
-- Pedidos activos (usando estados actuales de la BD)
SELECT COUNT(*) FROM pedidos
WHERE restaurante_id = :id
  AND estado IN ('en_curso', 'pendiente_pago', 'confirmado', 'pagado');

-- Pedidos hoy
SELECT COUNT(*) FROM pedidos
WHERE restaurante_id = :id
  AND DATE(created_at AT TIME ZONE 'Atlantic/Canary') = CURRENT_DATE;

-- Ingresos del día (excluye cancelados, no hay estado cancelado real aún)
SELECT COALESCE(SUM(total), 0) FROM pedidos
WHERE restaurante_id = :id
  AND DATE(created_at AT TIME ZONE 'Atlantic/Canary') = CURRENT_DATE
  AND estado NOT IN ('en_curso');

-- Pedidos recientes (últimos 5)
SELECT pedido_codigo, telefono, tipo_despacho, estado, total, created_at
FROM pedidos
WHERE restaurante_id = :id
ORDER BY created_at DESC
LIMIT 5;
```

### Métricas que requerirían trabajo adicional

- **"En preparación"**: el estado `preparando` no existe en la BD. Requiere migrar el enum de estados.
- **"Ingresos del día" confiable**: los estados actuales no distinguen claramente pedidos completados vs cancelados. Requiere estado `entregado` y `cancelado` bien definidos.
- **Tiempo promedio de preparación**: no hay campo `tiempo_inicio_preparacion` en `pedidos`.
- **Indicador en tiempo real de si el local está "Abierto ahora"**: requiere el campo `is_open_override` más lógica de timezone coherente (actualmente `restaurante.zona_horaria` y `restaurante_config.timezone` son inconsistentes).

---

## Módulo: Lista de pedidos activos

**Ruta:** `/dashboard/[slug]/pedidos`

### Datos que lee

| Tabla | Campos | Para qué |
|---|---|---|
| `pedidos` | `id`, `pedido_codigo`, `telefono`, `tipo_despacho`, `estado`, `total`, `created_at`, `restaurante_id` | Filas de la tabla principal |
| `usuarios` | `nombre`, `telefono` | Nombre del cliente (join por `telefono` o `usuario_id`) |

**Query base:**
```sql
SELECT p.id, p.pedido_codigo, p.telefono, u.nombre,
       p.tipo_despacho, p.estado, p.total, p.created_at
FROM pedidos p
LEFT JOIN usuarios u ON u.telefono = p.telefono AND u.restaurante_id = p.restaurante_id
WHERE p.restaurante_id = :id
  AND p.estado IN ('en_curso', 'pendiente_pago', 'confirmado', 'pagado')
ORDER BY p.created_at DESC;
```

> **Nota:** El join con `usuarios` debe incluir `restaurante_id` en ambos lados para evitar cruce de datos multi-tenant. El índice único actual de `usuarios.telefono` (sin `restaurante_id`) es un riesgo de integridad.

### Datos que escribe
Ninguno. La lista es de solo lectura. La acción de cambio de estado ocurre en el módulo de Detalle.

### ¿Requiere filtro por `restaurante_id`?
**Sí.** Crítico. Sin él, el local vería pedidos de toda la BD.

### ¿Necesita datos en tiempo real?
**Sí.** Los pedidos nuevos llegan vía agente n8n sin intervención del dashboard. El badge numérico en el sidebar y la lista deben actualizarse sin recargar. Recomendado: polling cada 20–30 segundos o SSE/WebSocket.

### Métricas calculables con datos actuales sin trabajo extra
- Count de pedidos activos por estado (para badge del sidebar).
- Tiempo transcurrido desde `created_at` (para mostrar "hace X min" en la tabla).

### Métricas que requerirían trabajo adicional
- **Tiempo en estado actual**: no hay campo `estado_updated_at` en `pedidos`. Requiere añadir columna o tabla de historial de estados.
- **Pedidos "urgentes"** (llevan más de N minutos sin avanzar): depende de `estado_updated_at`.

---

## Módulo: Detalle del pedido

**Ruta:** `/dashboard/[slug]/pedidos/[id]` y `/dashboard/[slug]/historial/[id]`

### Datos que lee

| Tabla | Campos | Para qué |
|---|---|---|
| `pedidos` | Todos los campos | Encabezado, ítems (JSONB), importes, método de pago, notas |
| `usuarios` | `nombre`, `telefono`, `direccion_frecuente` | Sección datos del cliente |

**Detalle especial:** El campo `pedidos.items` es JSONB. Su estructura interna (nombre, variante, extras, subtotal por línea) debe estar documentada para renderizar correctamente el detalle del pedido. La BD no garantiza la forma del JSONB a nivel de constraint.

**Query:**
```sql
SELECT p.*, u.nombre AS cliente_nombre
FROM pedidos p
LEFT JOIN usuarios u ON u.telefono = p.telefono AND u.restaurante_id = p.restaurante_id
WHERE p.id = :pedido_id
  AND p.restaurante_id = :restaurante_id;
```

El filtro `restaurante_id` en el WHERE es obligatorio para evitar que un local acceda al pedido de otro.

### Datos que escribe

| Tabla | Campo | Operación | Cuándo |
|---|---|---|---|
| `pedidos` | `estado` | UPDATE | Al pulsar "Confirmar", "En Preparación", "Listo", "Cancelar" |
| `pedidos` | `updated_at` | UPDATE automático | Con cada cambio de estado |

**Transiciones de estado válidas** (a definir y validar en backend antes de implementar):
```
en_curso → confirmado → [preparando*] → [listo*] → [entregado*]
cualquier estado → cancelado
```
*Estados marcados con * no existen aún en la BD.

### ¿Requiere filtro por `restaurante_id`?
**Sí.** En la query del pedido y en la validación previa al UPDATE de estado.

### ¿Necesita datos en tiempo real?
**Sí, parcialmente.** Si el agente n8n actualiza el pedido mientras el operador lo está viendo (ej: cliente confirma pago), el detalle debe reflejar el cambio. Recomendado: re-fetch al enfocar la pestaña o polling ligero cada 60 segundos.

### Métricas calculables con datos actuales sin trabajo extra
- Subtotal, costo_envio, total (ya calculados en la BD).
- Tiempo transcurrido desde `created_at`.
- Si el pedido es modificable: usar `fn_resolver_pedido_modificable` (función SQL existente).

### Métricas que requerirían trabajo adicional
- Historial de cambios de estado (no hay tabla de eventos/log de estados).
- Tiempo por estado (requiere `estado_updated_at`).

---

## Módulo: Historial de pedidos

**Ruta:** `/dashboard/[slug]/historial`

### Datos que lee

| Tabla | Campos | Para qué |
|---|---|---|
| `pedidos` | `id`, `pedido_codigo`, `telefono`, `tipo_despacho`, `estado`, `total`, `created_at`, `restaurante_id` | Filas de la tabla con filtros |
| `usuarios` | `nombre`, `telefono` | Nombre del cliente |

**Query base con filtro de fecha:**
```sql
SELECT p.id, p.pedido_codigo, p.telefono, u.nombre,
       p.tipo_despacho, p.estado, p.total, p.created_at
FROM pedidos p
LEFT JOIN usuarios u ON u.telefono = p.telefono AND u.restaurante_id = p.restaurante_id
WHERE p.restaurante_id = :id
  AND p.estado IN ('entregado', 'cancelado')  -- estados a crear
  AND p.created_at >= :fecha_desde
  AND p.created_at < :fecha_hasta
ORDER BY p.created_at DESC;
```

> **Gap:** Los estados `entregado` y `cancelado` no existen actualmente. El historial no tendrá datos hasta que se migren los estados. Mientras tanto, se podría mostrar como "historial" los pedidos en estado `pagado` con `updated_at` de más de N horas.

### Datos que escribe
Ninguno. El historial es exclusivamente de solo lectura. El detalle se abre en modo lectura (sin botones de cambio de estado).

### ¿Requiere filtro por `restaurante_id`?
**Sí.**

### ¿Necesita datos en tiempo real?
**No.** El historial muestra pedidos ya finalizados. Un re-fetch al cargar la página es suficiente. Los filtros de fecha se resuelven en el cliente o en la query.

### Métricas calculables con datos actuales sin trabajo extra
- Total recaudado en el período filtrado: `SUM(total)` sobre los resultados.
- Distribución por tipo de despacho: COUNT GROUP BY `tipo_despacho`.
- Distribución por método de pago: COUNT GROUP BY `metodo_pago`.

### Métricas que requerirían trabajo adicional
- Ticket promedio: trivial de calcular pero requiere estados correctos para filtrar pedidos completados reales.
- Comparativa período anterior: requiere lógica de cálculo en la API o vista materializada.
- Top productos más pedidos: requiere parsear el JSONB `pedidos.items` — posible con `jsonb_array_elements` en PostgreSQL pero costoso sin índice.

---

## Módulo: Gestión del menú

**Ruta:** `/dashboard/[slug]/ajustes/menu`

### Datos que lee

| Tabla | Campos | Para qué |
|---|---|---|
| `menu_category` | `menu_category_id`, `name`, `sort_order`, `is_active`, `restaurante_id` | Lista de categorías (columna izquierda) |
| `menu_item` | `menu_item_id`, `menu_category_id`, `name`, `description`, `is_active`, `restaurante_id` | Productos de la categoría seleccionada |
| `menu_variant` | `menu_variant_id`, `menu_item_id`, `variant_name`, `price`, `is_default`, `is_active` | Variantes al editar un producto |
| `extra` | `extra_id`, `name`, `price`, `is_active`, `allergens`, `restaurante_id` | Extras disponibles al editar un producto |
| `menu_item_extra` | `menu_item_id`, `extra_id`, `is_default` | Qué extras tiene asociado cada producto |

**Query de categorías con contador de productos:**
```sql
SELECT c.menu_category_id, c.name, c.sort_order, c.is_active,
       COUNT(i.menu_item_id) FILTER (WHERE i.is_active = true) AS productos_activos
FROM menu_category c
LEFT JOIN menu_item i ON i.menu_category_id = c.menu_category_id
WHERE c.restaurante_id = :id
GROUP BY c.menu_category_id
ORDER BY c.sort_order;
```

**⚠ Advertencia de datos semilla:** El local actual tiene `sort_order` solapados entre categorías (dos con valor 2, dos con valor 3, etc.) y variantes duplicadas en los ítems 1 y 2. El formulario de edición debe manejar estos casos sin romperse.

### Datos que escribe

| Tabla | Operación | Cuándo |
|---|---|---|
| `menu_category` | INSERT / UPDATE / DELETE (soft: `is_active = false`) | Crear/editar/eliminar categoría |
| `menu_item` | INSERT / UPDATE / soft DELETE | Crear/editar/eliminar producto |
| `menu_variant` | INSERT / UPDATE / soft DELETE | Gestionar variantes en modal de producto |
| `extra` | INSERT / UPDATE / soft DELETE | Gestionar extras |
| `menu_item_extra` | INSERT / DELETE | Asociar/desasociar extras de un producto |

**Riesgo al escribir:** `menu_variant.menu_item_id` no tiene FK declarada. La capa de API debe validar que el `menu_item_id` exista y pertenezca al mismo `restaurante_id` antes de insertar variantes.

### ¿Requiere filtro por `restaurante_id`?
**Sí.** En todas las queries de lectura y en todas las operaciones de escritura (verificar que el recurso a modificar pertenece al tenant antes de aplicar el cambio).

### ¿Necesita datos en tiempo real?
**No.** El menú lo edita solo el operador del local. No hay concurrencia esperada. Un re-fetch al abrir el módulo es suficiente.

### Métricas calculables con datos actuales sin trabajo extra
- Número de categorías activas / total.
- Número de productos activos por categoría.
- Número de productos sin variantes (pueden ser problemáticos para el agente n8n).
- Número de productos sin extras asociados.

### Métricas que requerirían trabajo adicional
- Productos más pedidos (requiere parsear `pedidos.items` JSONB).
- Productos nunca pedidos (cruce con `pedidos.items`).
- Imagen de producto: la tabla `menu_item` no tiene columna de URL de imagen — se necesita añadir.

---

## Módulo: Gestión de horarios

**Ruta:** `/dashboard/[slug]/ajustes/horarios`

### Datos que lee

| Tabla | Campos | Para qué |
|---|---|---|
| `horarios` | `id`, `restaurante_id`, `dia`, `disponible`, `apertura_1`, `cierre_1`, `apertura_2`, `cierre_2` | Tabla semanal Lun–Dom |
| `restaurante_config` | `is_open_override` (**a crear**), `timezone` | Banner de estado actual + lógica de override |
| `restaurante` | `zona_horaria` | Referencia de timezone del local |

**⚠ Inconsistencia de timezone en datos semilla:** `restaurante.zona_horaria = 'Atlantic/Canary'` vs `restaurante_config.timezone = 'America/New_York'`. Antes de implementar la lógica de "¿está abierto ahora?", hay que definir cuál es la fuente de verdad. Recomendación: `restaurante.zona_horaria` como fuente canónica.

### Datos que escribe

| Tabla | Campo | Operación | Cuándo |
|---|---|---|---|
| `horarios` | `disponible`, `apertura_1`, `cierre_1`, `apertura_2`, `cierre_2` | UPDATE por fila (por `id` + `restaurante_id`) | Al guardar cambios del horario semanal |
| `restaurante_config` | `is_open_override` (**a crear**) | UPSERT | Al pulsar "Abrir ahora", "Por horario" o "Cerrar ahora" |

### ¿Requiere filtro por `restaurante_id`?
**Sí.** En SELECT y en UPDATE de `horarios`, siempre incluir `AND restaurante_id = :id`.

### ¿Necesita datos en tiempo real?
**Parcialmente.** El banner de "estado actual" (Abierto/Cerrado) debe ser preciso al momento de cargar la pantalla. No requiere actualización continua salvo que otro operador cambie el estado manual simultáneamente (escenario poco probable en MVP mono-usuario).

### Métricas calculables con datos actuales sin trabajo extra
- Total de horas de apertura semanales (suma de franjas horarias).
- Días cerrados de la semana.
- Estado actual calculado: comparar hora actual con franjas del día en la timezone correcta.

### Métricas que requerirían trabajo adicional
- Historial de cambios de estado manual (no hay log de cambios en `restaurante_config`).
- Alertas de "local abierto fuera de horario" (requiere monitoreo activo).

---

## Módulo: Gestión de zonas de delivery

**Ruta:** `/dashboard/[slug]/ajustes/delivery`

### Datos que lee

| Tabla | Campos | Para qué |
|---|---|---|
| `delivery_zone` | `id`, `restaurante_id`, `codigo_postal`, `nombre_zona`, `tarifa_envio`, `pedido_minimo`, `tiempo_estimado_min`, `tiempo_estimado_max`, `activa` | Tabla de zonas configuradas |

> **Nota:** Los nombres exactos de columnas de `delivery_zone` están inferidos del DML. Verificar contra el DDL real antes de implementar. El dato semilla muestra: código postal PLAYA HONDA como `3509` (probablemente debería ser `35509`).

### Datos que escribe

| Tabla | Operación | Cuándo |
|---|---|---|
| `delivery_zone` | INSERT | Al crear nueva zona |
| `delivery_zone` | UPDATE | Al editar zona existente |
| `delivery_zone` | DELETE o `activa = false` | Al eliminar zona |

### ¿Requiere filtro por `restaurante_id`?
**Sí.** Tanto en lectura como en escritura. Verificar que la zona a editar/eliminar pertenece al tenant antes de aplicar.

### ¿Necesita datos en tiempo real?
**No.** Las zonas las configura el operador. Sin concurrencia esperada.

### Métricas calculables con datos actuales sin trabajo extra
- Número de zonas activas.
- Rango de tarifas de envío (mínima/máxima entre zonas).
- Pedido mínimo por zona.

### Métricas que requerirían trabajo adicional
- Pedidos por zona (requiere cruzar `pedidos` con `delivery_zone` por código postal — actualmente `pedidos` guarda dirección en texto libre, no código postal estructurado).
- Mapa visual de zonas de cobertura (requiere coordenadas de polígono por zona, no disponibles en el esquema actual).

---

## Módulo: Configuración del local

**Ruta:** `/dashboard/[slug]/ajustes/local`

### Datos que lee

| Tabla | Campos | Para qué |
|---|---|---|
| `restaurante` | `nombre`, `direccion`, `telefono`, `zona_horaria`, `moneda`, `datos_bancarios` | Formulario de identidad, contacto y operación |
| `restaurante_config` | `timezone`, `tax_rate` | Campos de operación (la fuente de timezone es ambigua, ver nota) |
| `config_operativa` | `tiempo_espera_minutos`, `mensaje_tiempo_espera` | Sección operativa (si se expone en MVP) |

**Campos del formulario mapeados a columnas:**

| Sección UI | Campo | Tabla | Columna |
|---|---|---|---|
| Identidad | Nombre del local | `restaurante` | `nombre` |
| Identidad | Descripción | `restaurante` | No existe — **campo a añadir** |
| Identidad | Logo | `restaurante` | No existe — **campo a añadir** |
| Contacto | Teléfono WhatsApp | `restaurante` | `telefono` |
| Contacto | Dirección | `restaurante` | `direccion` |
| Operación | Timezone | `restaurante` | `zona_horaria` (fuente canónica propuesta) |
| Operación | Moneda | `restaurante` | `moneda` |
| Pagos | Efectivo | `restaurante_config` | clave `accept_cash` (**a crear**) |
| Pagos | Transferencia | `restaurante_config` | clave `accept_transfer` (**a crear**) |
| Pagos | Datos bancarios | `restaurante` | `datos_bancarios` (JSONB) |

### Datos que escribe

| Tabla | Operación | Cuándo |
|---|---|---|
| `restaurante` | UPDATE | Al guardar cambios del formulario |
| `restaurante_config` | UPSERT por `config_key` | Al guardar métodos de pago y configs adicionales |

**⚠ Riesgo multi-tenant en `restaurante_config`:** El PK actual es solo `config_key`. Si hay dos restaurantes con la misma clave, habrá colisión. El UPSERT debe filtrar siempre por `restaurante_id`. Pendiente de migrar el PK a `(config_key, restaurante_id)`.

### ¿Requiere filtro por `restaurante_id`?
**Sí.** El UPDATE de `restaurante` debe llevar `WHERE id = :restaurante_id`. El UPSERT de `restaurante_config` debe incluir `restaurante_id` en el WHERE y en los valores.

### ¿Necesita datos en tiempo real?
**No.** Formulario de edición clásico: leer al cargar, guardar al enviar.

### Métricas calculables con datos actuales sin trabajo extra
Ninguna. Este módulo es puramente CRUD de configuración.

### Métricas que requerirían trabajo adicional
- Historial de cambios de configuración (no hay audit log en el esquema actual).

---

## Resumen de gaps a resolver antes de implementar

| Gap | Módulos afectados | Prioridad |
|---|---|---|
| Estados de pedido incompletos (`preparando`, `listo`, `entregado`, `cancelado`) | Home, Pedidos, Historial, Detalle | **Alta** |
| Campo `is_open_override` no existe en ninguna tabla | Home, Horarios | **Alta** |
| Columna `slug` no existe en `restaurante` | Todos (routing) | **Alta** |
| PK de `restaurante_config` no es multi-tenant | Configuración local, Home | **Media** |
| Columnas `descripcion` y `logo_url` no existen en `restaurante` | Configuración local | **Media** |
| Campos `accept_cash`, `accept_transfer` no existen en `restaurante_config` | Configuración local | **Media** |
| Columna `imagen_url` no existe en `menu_item` | Gestión del menú | **Baja (MVP)** |
| Ambigüedad de timezone (`restaurante.zona_horaria` vs `restaurante_config.timezone`) | Home, Horarios | **Alta** |
| Join `pedidos → usuarios` riesgoso sin `restaurante_id` en unique de `usuarios` | Pedidos, Historial, Detalle | **Media** |
| Estructura interna del JSONB `pedidos.items` no está contractualizada | Detalle del pedido | **Alta** |
| DDL de `delivery_zone` no auditado | Delivery | **Media** |

---

## Fuentes de verdad por módulo (resumen)

| Módulo | Tablas principales | Escribe en |
|---|---|---|
| Resumen operativo | `pedidos`, `horarios`, `restaurante_config` | `restaurante_config` |
| Lista pedidos activos | `pedidos`, `usuarios` | — |
| Detalle del pedido | `pedidos`, `usuarios` | `pedidos.estado` |
| Historial | `pedidos`, `usuarios` | — |
| Gestión menú | `menu_category`, `menu_item`, `menu_variant`, `extra`, `menu_item_extra` | Las 5 tablas |
| Gestión horarios | `horarios`, `restaurante_config` | `horarios`, `restaurante_config` |
| Gestión delivery | `delivery_zone` | `delivery_zone` |
| Configuración local | `restaurante`, `restaurante_config` | `restaurante`, `restaurante_config` |
