# Diseño de la tabla `business_members` — Puente Auth ↔ Tenant
**Fecha:** 2026-04-20
**Fuentes:** `docs/design/03_tabla_businesses.md`, `docs/design/04_roles_y_permisos.md`
**Alcance:** Diseño conceptual. Sin DDL SQL todavía.

---

## Nombre de la tabla

**`business_members`**

Razones:
- El nombre expresa la relación: una persona (`member`) pertenece a un negocio (`business`).
- Es extensible: en post-MVP, la misma tabla gestiona tanto el `owner` como el `staff`, sin necesidad de renombrar.
- Evita nombres técnicos como `user_tenant_roles` que mezclan tres conceptos en uno.
- Es el patrón canónico en SaaS (Linear, Vercel, Notion lo usan con esta semántica).

---

## Propósito

Conecta un usuario autenticado de Supabase (`auth.users`) con un negocio registrado en `businesses`, asignándole un rol operativo dentro de ese negocio. Es la fuente de verdad para responder: *¿qué usuario puede acceder a qué local y con qué nivel de permisos?*

---

## Relación con el diseño actual

En MVP (según `04_roles_y_permisos.md`), el rol se persiste en `app_metadata` del JWT de Supabase. La tabla `business_members` es la evolución natural: reemplaza esa convención informal por una relación explícita y consultable en PostgreSQL. En el momento en que un segundo local o un segundo usuario por local sean necesarios, esta tabla ya está lista.

---

## Columnas

| Columna | Tipo | Nullable | Notas |
|---|---|---|---|
| `id` | `uuid` | NO | PK. Generado con `gen_random_uuid()`. UUID por consistencia con `businesses.id` y con el ecosistema Supabase. |
| `business_id` | `uuid` | NO | FK → `businesses.id`. El local al que pertenece este miembro. |
| `user_id` | `uuid` | NO | FK → `auth.users.id` (esquema `auth` de Supabase). El usuario autenticado. |
| `role` | `varchar(20)` | NO | Rol del usuario dentro de este negocio. Valores permitidos: `owner`, `staff`. El rol `platform_admin` no se almacena aquí (ver sección específica). |
| `is_active` | `boolean` | NO | Default `true`. Permite suspender el acceso sin eliminar el registro ni perder el historial. |
| `invited_by` | `uuid` | SÍ | FK → `auth.users.id`. Quién creó esta membresía. Null si fue creada directamente por el `platform_admin` sin flujo de invitación. |
| `created_at` | `timestamptz` | NO | Default `now()`. Momento en que se otorgó el acceso. |
| `updated_at` | `timestamptz` | SÍ | Última modificación del registro (cambio de rol, desactivación). Null si nunca fue modificado. |

---

## FK a Supabase Auth

La columna `user_id` referencia `auth.users.id`, que es la tabla interna de Supabase donde viven los usuarios autenticados. Esta tabla existe en el esquema `auth`, separado del esquema `public` donde vive el resto del sistema.

Consideraciones:
- En PostgreSQL puro, una FK cruzada de esquemas es válida (`REFERENCES auth.users(id)`).
- Supabase la soporta oficialmente: es el patrón recomendado para extender `auth.users` con datos propios.
- La acción en cascada recomendada es `ON DELETE CASCADE`: si el usuario es eliminado de Supabase Auth, sus membresías desaparecen también. Esto evita registros huérfanos sin datos de identidad.
- Si se prefiere conservar el historial al borrar el usuario (auditoría), usar `ON DELETE SET NULL` y hacer `user_id` nullable — pero esto complica las queries. Para MVP, `CASCADE` es la opción correcta.

---

## FK a `businesses`

La columna `business_id` referencia `businesses.id`. Acción en cascada: `ON DELETE RESTRICT`. No se debe poder eliminar un negocio si tiene miembros activos — ese caso requiere un proceso explícito de offboarding.

---

## Cómo se representa el rol

El campo `role` es un `varchar(20)` con los valores `owner` y `staff`. No se usa un tipo `ENUM` de PostgreSQL porque:
- Los ENUMs son difíciles de extender sin `ALTER TYPE` (requiere lock de tabla).
- Un `varchar` con un `CHECK constraint` es igualmente seguro y más fácil de migrar.

El constraint de validación será: `CHECK (role IN ('owner', 'staff'))`.

### Por qué `platform_admin` no está en esta tabla

El rol `platform_admin` no es un rol de negocio — es un rol de plataforma. No tiene `business_id` asociado porque opera sobre todos los locales. Almacenarlo en `business_members` requeriría un `business_id` ficticio o un `NULL`, ambas opciones son señales de un modelo incorrecto.

La decisión de diseño (heredada de `04_roles_y_permisos.md`) es que `platform_admin` vive en `app_metadata` del JWT de Supabase:
```
auth.users.app_metadata = { "role": "platform_admin" }
```

El backend verifica primero si el JWT tiene `role = platform_admin` antes de consultar `business_members`. Si lo tiene, otorga acceso global. Si no, consulta la tabla para determinar el rol del usuario en el negocio solicitado.

---

## Constraints de unicidad

**Un usuario puede tener exactamente un rol por negocio.**

Constraint: `UNIQUE (business_id, user_id)`

Esto implica:
- Un usuario puede ser `owner` de un local y `staff` de otro — son filas distintas en la tabla.
- Un usuario no puede tener dos roles simultáneos en el mismo local. Si el `owner` quiere darle acceso de `staff` a alguien que ya es `owner`, debe cambiar el `role` existente, no agregar una fila nueva.
- No hay restricción que impida que un usuario sea miembro de múltiples negocios. Esto es intencional: un consultor o el equipo de EasyOrder puede necesitar acceso a múltiples locales.

---

## Índices necesarios

| Índice | Columnas | Tipo | Motivo |
|---|---|---|---|
| PK | `id` | UNIQUE B-tree | Acceso por PK estándar. |
| UNIQUE membership | `(business_id, user_id)` | UNIQUE B-tree | Enforce de unicidad y lookup de "¿tiene este usuario acceso a este negocio?". Es la query más frecuente del sistema de autenticación. |
| Lookup por usuario | `user_id` | B-tree | "¿A qué negocios pertenece este usuario?" — necesario para el selector de negocios si un usuario es miembro de múltiples locales. |
| Lookup por negocio | `business_id` | B-tree | "¿Quiénes son los miembros de este negocio?" — para el panel de gestión de equipo. El índice compuesto del UNIQUE ya cubre el prefijo `business_id`, por lo que este índice adicional solo es necesario si el UNIQUE está definido como `(user_id, business_id)`. Con `(business_id, user_id)`, el UNIQUE sirve como este índice. |

Resumen práctico: el UNIQUE sobre `(business_id, user_id)` + un índice simple sobre `user_id` cubren el 100% de las queries de membresía esperadas en MVP.

---

## Relaciones con otras tablas del sistema

| Tabla | Relación |
|---|---|
| `businesses` | FK `business_id → businesses.id`. Cada membresía pertenece a un negocio. |
| `auth.users` (Supabase) | FK `user_id → auth.users.id`. El miembro es un usuario autenticado. |
| `auth.users` (vía `invited_by`) | FK opcional. Registra quién creó la membresía. No tiene cascade — si el invitador es eliminado, la FK queda null. |
| `restaurante` | Sin FK directa. El acceso al local operativo se deriva: `business_members → businesses → restaurante`. |

---

## Decisiones de diseño

1. **UUID como PK**: consistente con `businesses`. Evita IDs correlativos expuestos.

2. **`is_active` en lugar de `deleted_at`**: permite suspender acceso temporalmente (empleado de licencia, conflicto) sin eliminar el historial. El borrado físico de una membresía se reserva para casos de baja definitiva.

3. **`role` como varchar con CHECK**: preferido sobre ENUM para facilitar migraciones futuras cuando aparezcan roles nuevos (`manager`, `cashier`).

4. **`invited_by` nullable**: en MVP la mayoría de membresías las crea el `platform_admin` directamente. Cuando el `owner` pueda invitar staff desde el panel, este campo se poblará automáticamente.

5. **Sin columna `permissions`**: los permisos granulares se derivan del `role`, no se almacenan en esta tabla. Si en el futuro se necesitan permisos por módulo, se agrega una tabla `role_permissions` separada, no se desnormaliza aquí.

---

## Lo que queda fuera del MVP

- Flujo de invitación por email (el `owner` invita a un `staff` desde el panel).
- Fecha de expiración de membresía (`expires_at`) para accesos temporales.
- Tabla `role_permissions` para permisos granulares por módulo.
- Auditoría de cambios de rol (quién cambió el rol de quién y cuándo).

---

## Siguiente paso

Definir el DDL SQL de `businesses` y `business_members` como una sola migración, incluyendo el puente `restaurante_id` en `businesses`. Propuesto en `06_ddl_businesses_y_members.md`.
