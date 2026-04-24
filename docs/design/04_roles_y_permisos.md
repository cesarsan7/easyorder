# Roles y Permisos — EasyOrder Panel Admin
**Fecha:** 2026-04-20
**Alcance:** MVP. Solo lo necesario para que un local opere sin soporte técnico.
**Fuentes:** `docs/design/03_tabla_businesses.md`, `docs/business/objetivo_MVP_EasyOrder.md`, `CLAUDE.md`

---

## Preguntas respondidas

### 1. ¿Qué tipos de usuarios van a acceder al panel?

Tres roles, en dos niveles:

**Nivel plataforma (cross-tenant):**
- `platform_admin` — administrador de EasyOrder. Ve y opera todos los locales.

**Nivel tenant (scoped a un `business_id`):**
- `owner` — dueño del local. Control total sobre su negocio.
- `staff` — empleado. Acceso operativo de solo lectura + acciones de despacho.

No se define ningún rol adicional en MVP. Un cuarto rol (`manager`, `cashier`, etc.) queda como post-MVP si un local crece lo suficiente para necesitarlo.

---

### 2. ¿Qué puede hacer cada rol?

#### Rol: `platform_admin`

Existe una sola instancia en el MVP (el equipo EasyOrder). No se expone un panel de plataforma completo en MVP — basta con acceso directo a la base de datos y a n8n. Lo que se registra aquí es el contrato de permisos para cuando ese panel exista.

| Area | Puede ver | Puede editar | No puede hacer |
|---|---|---|---|
| Businesses | Todos los tenants registrados | `is_active`, `plan` de cualquier tenant | Eliminar un tenant con pedidos activos |
| Pedidos | Pedidos de cualquier local | Estado de pedido (soporte/escalamiento) | Modificar ítems de un pedido confirmado |
| Usuarios | Clientes de cualquier local | — | Exportar PII sin registro de auditoría |
| Metricas | Metricas agregadas de la plataforma | — | — |
| Auth | Usuarios Supabase de la plataforma | Desactivar cuenta de un owner | Asumir la identidad de otro usuario (no impersonation en MVP) |

---

#### Rol: `owner`

Dueño del local. Se asigna al `owner_email` registrado en `businesses`. Tiene control total sobre su tenant. No puede ver datos de otros tenants.

| Area | Puede ver | Puede editar | No puede hacer |
|---|---|---|---|
| Pedidos | Todos los pedidos de su local | Estado del pedido (confirmar, cancelar) | Ver pedidos de otro local |
| Menu | Categorías, ítems, variantes, extras de su local | Crear, editar y desactivar cualquier elemento del menú | Publicar ítems sin precio definido |
| Horarios | Horarios de su local | Crear, editar y eliminar horarios | Dejar el local sin horario activo (validación de negocio) |
| Configuracion del local | Todos los campos de `restaurante` y `businesses` para su local | Nombre, descripción, datos bancarios, método de pago, moneda, dirección, WhatsApp | Cambiar `restaurante_id` o `business_id` (campos inmutables post-creación) |
| Zonas de delivery | Zonas y precios de su local | Crear, editar y desactivar zonas | Solapar zonas sin validación |
| FAQs | FAQs de su local | Crear, editar y eliminar FAQs | — |
| Clientes | Lista de clientes de su local (teléfono, nombre, historial) | — | Ver clientes de otro local |
| Metricas | Métricas básicas de su local (pedidos, facturación, productos más pedidos) | — | Ver métricas de otro local |
| Usuarios del panel | Miembros con acceso a su panel (solo él mismo en MVP) | — | Agregar miembros (post-MVP: tabla `business_members`) |
| Config Auth | Su propio email y contraseña | Email y contraseña via Supabase Auth | Cambiar el `owner_email` sin re-verificación |

---

#### Rol: `staff`

Empleado del local. En MVP se crea manualmente por el `platform_admin` o se omite si el local opera con un solo usuario. Su foco es el despacho operativo diario.

| Area | Puede ver | Puede editar | No puede hacer |
|---|---|---|---|
| Pedidos | Todos los pedidos activos de su local | Estado del pedido (marcar como preparando, listo, entregado) | Cancelar un pedido confirmado |
| Menu | Categorías e ítems de su local | Disponibilidad (`is_available`) de un ítem | Crear, editar o eliminar categorías o ítems |
| Horarios | Horarios de su local | — | Editar horarios |
| Configuracion del local | Nombre, dirección, horarios de su local | — | Editar configuración operativa, datos bancarios o zonas |
| Clientes | Nombre y telefono del cliente en el contexto del pedido activo | — | Ver historial completo de clientes |
| Metricas | — | — | Ver métricas o reportes |

---

### 3. ¿El cliente final (el que pide por WhatsApp) necesita autenticación web en el MVP?

**No.**

El cliente final en el MVP interactúa solo por WhatsApp a través del agente n8n. Su identidad se gestiona por teléfono en la tabla `usuarios`, sin ningún flujo de login web.

Si en el futuro se agrega un frontend público de menú digital (carrito web + envío por WhatsApp), el cliente tampoco necesitará cuenta: el pedido se enviará con los datos del formulario público (nombre, teléfono, dirección si aplica). No hay autenticación de cliente en MVP ni en la primera iteración post-MVP del menú web.

La autenticación con Supabase Auth es exclusiva para el panel admin (owners y staff). Los clientes son entidades pasivas de la base de datos, no usuarios autenticados.

---

### 4. ¿Hay un superadmin de la plataforma EasyOrder que puede ver todos los locales?

**Sí, es el rol `platform_admin`.**

En MVP este rol lo tiene únicamente el equipo de EasyOrder. No se construye un panel de administración de plataforma en MVP — el acceso se hace directamente a la base de datos, n8n y Supabase Dashboard.

El contrato de permisos está definido en esta tabla para que cuando se construya el panel de plataforma, no haya que rediseñar los roles. Técnicamente, en Supabase Auth se diferencia del `owner` por un `app_metadata.role = 'platform_admin'` en el JWT, sin necesidad de una tabla separada de roles en el MVP.

---

## Tabla resumen de permisos por modulo

| Modulo | platform_admin | owner | staff |
|---|---|---|---|
| Ver pedidos de su local | Si | Si | Si |
| Cambiar estado de pedido | Si | Si | Parcial (no cancelar) |
| Gestionar menú completo | Si | Si | Solo disponibilidad |
| Gestionar horarios | Si | Si | No |
| Ver clientes de su local | Si | Si | Solo datos del pedido activo |
| Editar configuración del local | Si | Si | No |
| Gestionar zonas de delivery | Si | Si | No |
| Ver métricas de su local | Si | Si | No |
| Ver todos los locales | Si | No | No |
| Gestionar planes y suscripciones | Si | No | No |
| Activar / suspender un local | Si | No | No |

---

## Implementacion en Supabase Auth (MVP)

### Como se asigna el rol

El rol se persiste en el campo `app_metadata` del usuario Supabase, que solo puede ser escrito por el backend (no desde el cliente). Esto evita que un usuario escale sus propios permisos.

```
auth.users.app_metadata = {
  "role": "owner",          -- valores: platform_admin | owner | staff
  "business_id": "<uuid>"   -- solo para owner y staff; null para platform_admin
}
```

### Como se aplica el aislamiento de tenant

Toda query del panel que retorne datos del negocio debe incluir el filtro `AND business_id = <business_id del JWT`. En MVP este filtro se aplica en el backend API (o en las funciones PostgreSQL que se exponen). No se usa Row Level Security de Supabase en MVP para no agregar complejidad, pero la estructura de datos ya es compatible con RLS si se quiere agregar después.

### Tabla `business_members` (post-MVP)

En MVP no existe esta tabla. El `owner` es siempre el `owner_email` de `businesses`. Agregar staff manualmente implica crear el usuario en Supabase Auth y setear `app_metadata` directamente. Esta es una operación del `platform_admin`, no del `owner`, en MVP.

En post-MVP, `business_members` gestionará la relación `(business_id, user_id, role)` y el `owner` podrá invitar staff desde el panel.

---

## Decisiones de diseño

1. **Tres roles, no mas.** `platform_admin`, `owner` y `staff` son suficientes para operar el primer local. Agregar roles intermedios (manager, cashier, viewer) antes de tener demanda real es sobre-ingeniería.

2. **El rol vive en `app_metadata` de Supabase, no en una tabla propia.** Evita una tabla extra en MVP y es la forma nativa de Supabase para roles en el JWT. La tabla `business_members` se agrega cuando haya necesidad real de multi-usuario por tenant.

3. **No hay RBAC library externa.** Los permisos se validan con condicionales simples en el backend: `if user.role !== 'owner' throw 403`. Suficiente para MVP.

4. **El cliente final no tiene rol.** Es una entidad de datos (tabla `usuarios`), no un actor del sistema de autenticación. Esta decisión elimina fricción de onboarding para el cliente y reduce la superficie de autenticación.

5. **`staff` existe en el contrato pero puede no usarse en el primer lanzamiento.** Si La Isla Pizzería opera solo con el dueño, el rol `staff` no se crea. El diseño lo contempla para que el primer local que tenga empleados no requiera cambios de arquitectura.

---

## Riesgos

| Riesgo | Probabilidad | Mitigacion |
|---|---|---|
| El owner filtra datos de otro local por error de query sin `business_id` | Media | Revisar toda query del panel en code review; agregar RLS en post-MVP |
| El staff cancela un pedido que no debería | Baja | Accion "cancelar" bloqueada en UI y en backend para rol `staff` |
| El platform_admin tiene acceso irrestricto y no hay auditoría | Media | Registrar en log toda acción del `platform_admin` que modifique datos de un tenant; post-MVP |
| Agregar un segundo owner por local es una operación manual | Alta (en cuanto haya un segundo local con equipo) | Documentar el proceso manual; priorizar `business_members` en el primer post-MVP |

---

## Lo que queda fuera del MVP

- Panel de administración de plataforma (UI para `platform_admin`)
- Invitación de staff desde el panel del owner
- Tabla `business_members`
- Permisos granulares por sección (ej. staff que solo ve pedidos pero no menú)
- Logs de auditoría de acciones sensibles
- Impersonation de tenants por parte del platform_admin
- Row Level Security en PostgreSQL

---

## Siguiente paso

Definir el esquema de la tabla `business_members` y el flujo de invitación de staff como primer ítem post-MVP de permisos, en paralelo con el diseño del panel admin (`05_panel_admin_navegacion.md`).
