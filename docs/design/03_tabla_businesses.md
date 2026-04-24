# Diseño de la tabla `businesses` — Tenant raíz de EasyOrder
**Fecha:** 2026-04-20  
**Fuente de verdad:** `docs/db/DDL_restaurante_mvp.sql`, `docs/design/02_plan_migracion_multitenant.md`  
**Alcance:** Diseño conceptual. Sin DDL SQL todavía.

---

## Nombre de la tabla

**`businesses`**

Razones:
- Es el nombre canónico en SaaS multi-tenant (Shopify, Square, Toast lo usan).
- Es neutro respecto al tipo de negocio: aplica a pizzerías, hamburgueserías, cafeterías, etc.
- Evita colisión con la tabla existente `restaurante`, que sigue siendo la tabla operativa del único tenant actual hasta que la migración esté completa.
- `tenants` es técnicamente preciso pero oscuro para el equipo de negocio. `locals` es demasiado específico del español rioplatense/canario.

---

## Relación con la tabla `restaurante` existente

La tabla `restaurante` actual **no se elimina ni se reemplaza en el MVP**. Contiene datos operativos de La Isla Pizzería (`id = 1`) que son referenciados por todas las tablas del sistema. Romper esa FK sería de muy alto riesgo.

La relación propuesta para el MVP es:
- `businesses` es la tabla de identidad y configuración del tenant en la plataforma EasyOrder (slug, plan, Supabase Auth, estado de onboarding).
- `restaurante` sigue siendo la tabla operativa interna, con su `id = 1` intacto.
- Se agrega una columna `business_id` en `restaurante` como FK hacia `businesses`, estableciendo el puente entre ambos mundos.
- En el MVP: una fila en `businesses` corresponde a exactamente una fila en `restaurante`.
- Post-MVP: un `business` podría tener múltiples sucursales, cada una como fila separada en `restaurante`.

Esto permite migrar gradualmente sin tocar ninguna query existente de n8n.

---

## Columnas MVP

Estas columnas son necesarias para lanzar el primer local en la plataforma:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK generada con `gen_random_uuid()`. UUID en lugar de serial para compatibilidad con Supabase Auth y para evitar colisiones en entornos distribuidos. |
| `name` | `varchar(150)` | Nombre público del negocio. Ej: "La Isla Pizzería". NOT NULL. |
| `slug` | `varchar(80)` | Identificador de URL única. Ej: `la-isla-pizzeria`. Formato: solo minúsculas, guiones, sin espacios. UNIQUE NOT NULL. Determina la URL pública: `easyorder.app/{slug}`. |
| `owner_email` | `varchar(255)` | Email del dueño o administrador principal. Se usará para vincular con Supabase Auth. NOT NULL. |
| `phone` | `varchar(30)` | Teléfono de contacto del negocio (distinto del WhatsApp de pedidos). Nullable. |
| `country_code` | `char(2)` | ISO 3166-1 alpha-2. Ej: `ES`, `AR`, `CL`. Necesario para zona horaria, moneda y formato de teléfonos. NOT NULL. |
| `timezone` | `varchar(50)` | Zona horaria IANA. Ej: `Atlantic/Canary`. Puede derivarse de `country_code` pero conviene explícita. NOT NULL. |
| `currency` | `varchar(5)` | Símbolo o código ISO 4217. Ej: `€`, `ARS`, `CLP`. NOT NULL. |
| `is_active` | `boolean` | Si el negocio puede operar en la plataforma. Default `true`. Permite suspender sin borrar. NOT NULL. |
| `plan` | `varchar(30)` | Plan de suscripción actual. Valores iniciales: `trial`, `starter`, `pro`. Default `trial`. NOT NULL. |
| `restaurante_id` | `int4` | FK hacia `restaurante.id`. Puente de compatibilidad con el sistema actual. Nullable en MVP (la migración puede ser gradual). |
| `created_at` | `timestamptz` | Timestamp de registro en la plataforma. Default `now()`. NOT NULL. |
| `updated_at` | `timestamptz` | Última modificación. Actualizar con trigger o en la aplicación. Nullable. |

---

## Columnas post-MVP

Estas columnas no son necesarias para el primer lanzamiento pero se anticipan para no tener que migrar la tabla con cambios de ruptura más adelante:

| Columna | Tipo | Justificación |
|---|---|---|
| `logo_url` | `text` | URL de la imagen del logo, almacenada en Supabase Storage o CDN. |
| `cover_url` | `text` | Imagen de portada para la carta digital pública. |
| `description` | `text` | Descripción corta del negocio para el frontend público. |
| `address` | `text` | Dirección física del local. Útil para mostrar en la carta y para pickup. |
| `lat` / `lng` | `numeric(10,8)` / `numeric(11,8)` | Coordenadas para integración con mapa y cálculo de delivery. |
| `website_url` | `varchar(255)` | Sitio web propio del negocio, si tiene. |
| `instagram_handle` | `varchar(80)` | Handle de Instagram sin `@`. |
| `whatsapp_number` | `varchar(30)` | Número de WhatsApp de atención al cliente. Distinto del número de pedidos de n8n. |
| `onboarding_step` | `varchar(50)` | Paso actual del wizard de alta: `menu`, `horarios`, `pagos`, `completado`. |
| `trial_ends_at` | `timestamptz` | Fecha de vencimiento del trial. Null si no aplica. |
| `billing_email` | `varchar(255)` | Email para facturación, si difiere del `owner_email`. |
| `supabase_org_id` | `text` | ID del tenant en Supabase si se usa Supabase Auth con organizaciones. |
| `custom_domain` | `varchar(255)` | Dominio propio del negocio si quieren usar su URL en lugar del slug de EasyOrder. |

---

## ¿El `restaurant_id = 1` de La Isla Pizzería ya existe?

**Sí.** La tabla `restaurante` tiene una fila con `id = 1` correspondiente a La Isla Pizzería, confirmado en el DDL y en los planes de migración anteriores (todos los backfills usan `restaurante_id = 1`).

Lo que **no existe** todavía es la tabla `businesses`. Al crearla, La Isla Pizzería será el primer registro: `businesses.id = <uuid generado>`, con `slug = 'la-isla-pizzeria'` (o el que el dueño defina), y `restaurante_id = 1` como FK de compatibilidad.

---

## Relaciones con otras tablas del sistema

| Tabla existente | Cómo se relaciona |
|---|---|
| `restaurante` | Recibe FK `business_id` apuntando a `businesses.id`. Relación 1-a-1 en MVP. |
| `pedidos` | Se conecta a `businesses` indirectamente vía `restaurante_id → restaurante.id → businesses.id`. No se agrega FK directa en MVP para no alterar queries existentes de n8n. |
| `usuarios` | Ídem — vía `restaurante_id`. |
| `horarios`, `faqs`, `config_operativa`, `contexto` | Ídem — todos ya tienen `restaurante_id`. |
| `menu_category`, `menu_item`, `menu_variant`, `extra` | Ídem — serán actualizados con NOT NULL + FK en las Fases 3 del plan de migración. |
| Supabase Auth (tabla `auth.users`) | La columna `owner_email` en `businesses` será el puente. Se creará una tabla intermedia `business_members` (post-MVP) para manejar múltiples usuarios por negocio. |

---

## Decisiones de diseño relevantes

1. **UUID como PK**: aunque el sistema actual usa `serial4`, la tabla `businesses` es el punto de entrada del SaaS público y se integrará con Supabase Auth. Los UUIDs evitan exposición de IDs correlativas en URLs y son nativos en el ecosistema Supabase.

2. **`slug` como identificador de URL**: permite URLs limpias (`/la-isla-pizzeria/menu`) sin exponer el UUID. Debe ser validado contra formato `[a-z0-9-]+` y ser único en la plataforma.

3. **`plan` como columna simple**: en MVP no hay lógica de facturación. El campo existe para poder filtrar features por plan sin necesidad de una tabla separada todavía.

4. **`restaurante_id` nullable**: permite crear el registro en `businesses` antes de que exista la fila en `restaurante`, o vice versa. El puente se completa en la misma migración.

5. **No mover datos operativos a `businesses`**: la configuración de envío, mensajes, datos bancarios, horarios, etc., sigue en `restaurante` y sus tablas satélite. `businesses` es identidad de plataforma, no configuración operativa.
