# Módulos del Dashboard Administrativo — EasyOrder
**Fecha:** 2026-04-21
**Alcance:** Definición de módulos, clasificación MVP / post-MVP y justificación.
**Fuentes:** `objetivo_MVP_EasyOrder.md`, `04_roles_y_permisos.md`, `00_consolidacion_hallazgos.md`

---

## Criterio de clasificación

Un módulo es **MVP** si su ausencia impide que el local opere con autonomía mínima: recibir pedidos, configurar menú, controlar disponibilidad y atender clientes sin depender del equipo técnico de EasyOrder.

Un módulo es **post-MVP** si agrega valor pero el local puede operar sin él en las primeras semanas.

---

## Módulos

---

**Módulo: Resumen operativo (Home del dashboard)**
- ¿Qué resuelve?: Ofrece una vista rápida del estado actual del local: pedidos activos, pedidos del día y si el local está abierto o cerrado.
- ¿Por qué es MVP?: Es la pantalla de entrada. Sin ella, el owner o staff tiene que navegar a ciegas. El resumen mínimo — conteo de pedidos activos y estado abierto/cerrado — requiere cero lógica nueva: lee `pedidos` y `horarios`. No agrega complejidad, sí agrega orientación operativa desde el primer día.
- ¿Qué rol lo necesita?: `staff` (mínimo); `owner` también.
- ¿Depende de otro módulo para funcionar?: Sí — Lista de pedidos activos y Gestión de horarios deben existir para que los datos sean coherentes.

---

**Módulo: Lista de pedidos activos**
- ¿Qué resuelve?: Muestra los pedidos en curso con estado, hora, tipo de despacho y monto. Permite al staff y al owner saber qué está en preparación en tiempo real.
- ¿Por qué es MVP?: Es el núcleo operativo diario. Sin esta vista, el dashboard no tiene razón de existir. La tabla `pedidos` ya existe con estados (`pendiente`, `confirmado`, `preparando`, `listo`, `entregado`). Solo requiere una query filtrada por `restaurante_id` y estado activo.
- ¿Qué rol lo necesita?: `staff` (mínimo); `owner` también.
- ¿Depende de otro módulo para funcionar?: Sí — Detalle del pedido para acceder al contenido de cada pedido.

---

**Módulo: Detalle del pedido**
- ¿Qué resuelve?: Muestra ítems, variantes, extras, datos del cliente, tipo de despacho, dirección (si aplica), método de pago y botones de cambio de estado.
- ¿Por qué es MVP?: Sin ver el detalle, el operador no puede preparar el pedido ni confirmar el estado. Es la unidad atómica de la operación. La data está en `pedidos`, `pedido_items` y `usuarios`. El cambio de estado es la única escritura requerida.
- ¿Qué rol lo necesita?: `staff` (mínimo); `owner` también.
- ¿Depende de otro módulo para funcionar?: Sí — Lista de pedidos activos es el punto de entrada.

---

**Módulo: Historial de pedidos**
- ¿Qué resuelve?: Lista de pedidos completados o cancelados con filtros por fecha, estado y cliente.
- ¿Por qué es MVP?: MVP mínimo — basta con acceso a pedidos con `estado IN ('entregado', 'cancelado')` sin filtros avanzados. Es necesario para que el owner pueda revisar operaciones del día anterior sin métricas elaboradas. El esfuerzo de implementación es bajo dado que reutiliza la misma query de lista de pedidos con un filtro distinto.
- ¿Qué rol lo necesita?: `owner` (mínimo). `staff` no necesita historial completo en MVP.
- ¿Depende de otro módulo para funcionar?: Sí — Detalle del pedido para ver el contenido de pedidos pasados.

---

**Módulo: Gestión del menú (categorías, productos, variantes, extras)**
- ¿Qué resuelve?: Permite al owner crear, editar, desactivar y reordenar categorías, ítems, variantes y extras de su carta.
- ¿Por qué es MVP?: Sin menú configurado el frontend público no muestra nada y el flujo de WhatsApp usa `fn_menu_lookup` que lee de las mismas tablas. Es imposible arrancar un local nuevo sin esta pantalla. Las tablas `menu_category`, `menu_item`, `menu_variant`, `extra` y `menu_item_extra` ya existen.
- ¿Qué rol lo necesita?: `owner` (mínimo). `staff` solo puede cambiar `is_available` de un ítem (sub-acción dentro del módulo).
- ¿Depende de otro módulo para funcionar?: Sí — Configuración del local (debe existir el `restaurante_id` antes de crear ítems de menú).

---

**Módulo: Gestión de horarios**
- ¿Qué resuelve?: Permite definir días y rangos horarios en que el local acepta pedidos. El flujo de WhatsApp valida apertura/cierre contra esta tabla.
- ¿Por qué es MVP?: Si no hay horarios configurados, el agente n8n no puede validar si el local está abierto. Actualmente los horarios viven en un DataTable interno de n8n (hallazgo de auditoría). Migrarlos a la tabla `horarios` y exponer este módulo es un paso obligatorio para habilitar multi-tenant real. Sin esta pantalla, cada nuevo local requiere intervención técnica.
- ¿Qué rol lo necesita?: `owner`.
- ¿Depende de otro módulo para funcionar?: Sí — Configuración del local (el `restaurante_id` debe existir).

---

**Módulo: Gestión de zonas de delivery**
- ¿Qué resuelve?: Permite definir zonas de cobertura con monto mínimo y costo de envío. El flujo de Despacho en n8n consulta `delivery_zone` para validar cobertura y calcular envío.
- ¿Por qué es MVP?: Sin zonas configuradas, cualquier pedido de delivery falla la validación de zona en n8n y el checkout público no puede calcular el costo de envío. Es una dependencia directa del flujo operativo. La tabla `delivery_zone` ya existe con `restaurant_id`.
- ¿Qué rol lo necesita?: `owner`.
- ¿Depende de otro módulo para funcionar?: Sí — Configuración del local.

---

**Módulo: Configuración del local**
- ¿Qué resuelve?: Gestiona los datos básicos del local: nombre, descripción, logo, dirección, teléfono de WhatsApp, moneda, método de pago aceptado, datos bancarios para transferencia y timezone.
- ¿Por qué es MVP?: Es el módulo cero — todos los demás dependen de que el `restaurante` y `restaurante_config` estén bien configurados. Sin nombre, WhatsApp y timezone correctos, el system prompt del agente n8n y el frontend público tienen datos incorrectos (hallazgo crítico de auditoría: timezone `America/New_York` vs `Atlantic/Canary`). Permite al local operar sin intervención técnica desde el primer día.
- ¿Qué rol lo necesita?: `owner`.
- ¿Depende de otro módulo para funcionar?: No — es la base de todos los demás.

---

**Módulo: Clientes**
- ¿Qué resuelve?: Lista de clientes que han pedido en el local con nombre, teléfono, número de pedidos e historial.
- ¿Por qué es post-MVP?: El local puede operar sin esta vista. Los datos del cliente llegan con cada pedido en el detalle. Un módulo de clientes agrega valor de fidelización y seguimiento, pero no desbloquea ninguna operación crítica. Requiere además resolver la decisión pendiente del modelo de datos: `usuarios` con UNIQUE `(telefono)` global vs `(telefono, restaurante_id)` por tenant (pregunta 11 de la auditoría).
- ¿Qué rol lo necesita?: `owner`.
- ¿Depende de otro módulo para funcionar?: Sí — Lista de pedidos / Historial (la data viene de ahí).

---

**Módulo: Métricas y estadísticas**
- ¿Qué resuelve?: Indicadores de negocio: pedidos del día, ingresos, ticket promedio, productos más pedidos, comparativa semanal.
- ¿Por qué es post-MVP?: El objetivo del MVP es que el local reciba y gestione pedidos, no que analice su desempeño. Un resumen básico de conteo diario puede incluirse en el Home del dashboard sin construir un módulo dedicado. Las métricas elaboradas requieren queries de agregación que pueden introducir lentitud en la base operativa si no se diseñan con cuidado. Se construye cuando el local ya tenga volumen suficiente para que las métricas sean significativas.
- ¿Qué rol lo necesita?: `owner`.
- ¿Depende de otro módulo para funcionar?: Sí — requiere al menos 2-4 semanas de datos de `pedidos` para ser útil.

---

**Módulo: Usuarios y roles del local**
- ¿Qué resuelve?: Permite al owner invitar staff, asignar roles y revocar accesos al panel del local.
- ¿Por qué es post-MVP?: En MVP el `owner` es el único usuario del panel por tenant. El staff se crea manualmente por el `platform_admin` directamente en Supabase Auth con `app_metadata`. La tabla `business_members` no existe en MVP (decisión documentada en `04_roles_y_permisos.md`). Construir la UI de invitación antes de tener al menos un local con empleados reales es sobre-ingeniería.
- ¿Qué rol lo necesita?: `owner`.
- ¿Depende de otro módulo para funcionar?: Sí — Configuración del local y Supabase Auth deben estar operativos.

---

## Tabla resumen

| Módulo | Clasificación | Rol mínimo | Depende de |
|---|---|---|---|
| Configuración del local | MVP | owner | — |
| Gestión del menú | MVP | owner | Configuración del local |
| Gestión de horarios | MVP | owner | Configuración del local |
| Gestión de zonas de delivery | MVP | owner | Configuración del local |
| Lista de pedidos activos | MVP | staff | — |
| Detalle del pedido | MVP | staff | Lista de pedidos activos |
| Resumen operativo (Home) | MVP | staff | Lista de pedidos, Horarios |
| Historial de pedidos | MVP (mínimo) | owner | Detalle del pedido |
| Clientes | post-MVP | owner | Historial de pedidos |
| Métricas y estadísticas | post-MVP | owner | Historial de pedidos |
| Usuarios y roles del local | post-MVP | owner | Configuración del local |

---

## Orden de construcción recomendado (MVP)

1. **Configuración del local** — desbloquea todos los demás módulos y corrige los datos semilla incorrectos (timezone, coordenadas).
2. **Gestión del menú** — permite configurar la carta antes de recibir el primer pedido.
3. **Gestión de horarios** — elimina la dependencia del DataTable hardcodeado en n8n.
4. **Gestión de zonas de delivery** — habilita el cálculo de envío en el checkout público.
5. **Lista de pedidos activos + Detalle del pedido** — operación diaria real.
6. **Resumen operativo (Home)** — agrega orientación sin complejidad extra una vez que los datos existen.
7. **Historial de pedidos** — completar la vista operativa con datos pasados.

---

## Lo que queda fuera del MVP

- Invitación y gestión de staff desde el panel del owner.
- Módulo de clientes con historial completo.
- Métricas elaboradas (más allá del conteo diario en el Home).
- Exportación de datos (pedidos, clientes, facturación).
- Panel de plataforma para `platform_admin` (UI — en MVP es acceso directo a DB y n8n).
- Notificaciones push o por email al owner cuando llega un pedido.
- Logs de auditoría de acciones sensibles.
