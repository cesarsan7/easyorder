# Clasificación de tablas — Multi-tenant EasyOrder
**Fecha:** 2026-04-20  
**Fuente:** `docs/audit/01_auditoria_base_datos.md`

---

## Resumen

| Categoría | Tablas |
|---|---|
| **A — Necesita `restaurante_id`** | `n8n_chat_histories` |
| **B — Global (no necesita discriminador)** | `restaurante`, `menu_item_extra` |
| **C — Ya tiene discriminador** | `menu_category`, `menu_item`, `menu_variant`, `extra`, `restaurante_config`, `pedidos`, `usuarios`, `horarios`, `faqs`, `config_operativa`, `contexto` |

---

## Categoría A — Tenant (necesita `restaurante_id`)

### `n8n_chat_histories`
**Situación actual:** Sin `restaurante_id`. Tabla gestionada por n8n (LangChain memory). El `session_id` puede codificar el tenant por convención, pero no hay discriminador explícito.

**Decisión sobre NOT NULL:**  
→ `restaurante_id` debe ser **nullable en la migración inicial** y convertirse en NOT NULL solo cuando el workflow de n8n sea actualizado para poblarlo.  
Razón: la tabla es escrita directamente por n8n. Forzar NOT NULL antes de actualizar los flujos rompería la inserción de mensajes en producción.

**Riesgo:** Bajo en single-tenant actual. Crítico si se onboardean nuevos locales antes de que n8n escriba el campo.

**Acción requerida:**
1. Agregar columna `restaurante_id int4 NULL REFERENCES restaurante(id)`.
2. Actualizar el workflow n8n para pasar `restaurante_id` en cada inserción.
3. Backfill de registros existentes con `restaurante_id = 1` (La Isla Pizzería).
4. Convertir a NOT NULL después del backfill.

---

## Categoría B — Global (no necesita discriminador)

### `restaurante`
Es la tabla raíz del tenant — define al propio local. No tiene sentido que se autodiscramine.  
Cada fila **es** un tenant. Sin `restaurante_id`.

### `menu_item_extra`
Tabla de relación pura (`menu_item_id` × `extra_id`). La tenencia se hereda transitivamente:  
`menu_item_extra → menu_item.restaurante_id`.  
Agregar `restaurante_id` sería redundante y rompería la normalización. Las queries multi-tenant deben filtrar haciendo JOIN hacia `menu_item`.

---

## Categoría C — Ya tiene discriminador

### Subcategoría C1 — Discriminador robusto (FK declarada, NOT NULL)

Estas tablas tienen `restaurante_id int4 NOT NULL FK → restaurante(id)`. Son las más seguras para multi-tenant.

| Tabla | Estado | Observaciones |
|---|---|---|
| `pedidos` | ✅ FK + NOT NULL | Bien definido. Tiene índices multi-tenant. |
| `usuarios` | ⚠️ FK + NOT NULL | Discriminador correcto pero `UNIQUE (telefono)` sin `restaurante_id` impide registrar el mismo cliente en dos locales. Requiere migrar unique a `(telefono, restaurante_id)`. |
| `horarios` | ✅ FK + NOT NULL | Bien definido. |
| `faqs` | ✅ FK + NOT NULL | Bien definido. |
| `config_operativa` | ✅ FK + NOT NULL | Bien definido. |
| `contexto` | ⚠️ FK + NOT NULL | Tiene FK pero **sin PK declarada** — permite filas duplicadas por mismo teléfono/sesión. Requiere agregar PK compuesta. |

### Subcategoría C2 — Discriminador débil (nullable, sin FK)

Estas tablas tienen `restaurante_id` pero **sin FK hacia `restaurante`** y **nullable**. No hay integridad referencial.

| Tabla | Estado | Problema | Migración necesaria |
|---|---|---|---|
| `menu_category` | ⚠️ nullable, sin FK | Registros huérfanos posibles | Poblar NULLs → NOT NULL + FK |
| `menu_item` | ⚠️ nullable, sin FK | Idem | Idem |
| `menu_variant` | ⚠️ nullable, sin FK | Idem | Idem |
| `extra` | ⚠️ nullable, sin FK | Idem | Idem |
| `restaurante_config` | ⚠️ nullable, sin FK, PK roto | PK es solo `config_key` — colisión si dos locales tienen misma clave | PK compuesta `(config_key, restaurante_id)` + NOT NULL + FK |

**Nota sobre `delivery_zone`:** Mencionada en las observaciones de integridad como tabla con `restaurante_id` sin FK, pero no aparece en el DDL inventariado. Tratarla como C2 si existe, verificar existencia antes de migrar.

---

## Plan de migración por prioridad

| Prioridad | Tabla | Acción | Riesgo |
|---|---|---|---|
| 🔴 Crítico | `restaurante_config` | PK compuesta `(config_key, restaurante_id)` | Alto — cambia PK |
| 🔴 Crítico | `usuarios` | Unique `(telefono, restaurante_id)` | Alto — rompe unique existente |
| 🟡 Alto | `menu_category`, `menu_item`, `menu_variant`, `extra` | NOT NULL + FK en `restaurante_id` | Medio — requiere backfill previo |
| 🟡 Alto | `contexto` | Declarar PK | Medio — sin PK actual |
| 🟢 Medio | `n8n_chat_histories` | Agregar `restaurante_id` nullable → backfill → NOT NULL | Bajo si n8n se actualiza en paralelo |
| 🟢 Bajo | `fn_upsert_usuario_perfil` | Parametrizar `restaurante_id` (hardcodea `1`) | Bajo — función SQL interna |

---

## Funciones SQL que requieren atención

| Función | Problema multi-tenant |
|---|---|
| `fn_upsert_usuario_perfil` | Hardcodea `restaurante_id = 1` en el INSERT |
| `fn_menu_catalog()` | No filtra por `restaurante_id` — devuelve menú de todos los locales |
| `fn_menu_lookup(p_search)` | Idem — búsqueda sin scope de tenant |
| `fn_get_rest_config_int` | Lee `restaurante_config` sin filtrar por tenant |
| `fn_next_pedido_codigo` | Calcula el correlativo sobre todos los pedidos — en multi-tenant, el código podría no ser secuencial por local |

Todas estas funciones deberán recibir `p_restaurante_id` como parámetro antes de operar en un entorno multi-tenant real.
