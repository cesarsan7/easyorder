# Auditoría de Base de Datos — EasyOrder MVP
**Fecha:** 2026-04-20  
**Fuente:** `docs/db/DDL_restaurante_mvp.sql`

---

## Inventario de tablas

### `restaurante`
Entidad raíz del tenant. Representa un local de comida.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | serial4 PK | Identificador del tenant |
| `nombre` | text NOT NULL | Nombre del local |
| `direccion`, `lat`, `long` | text / numeric | Ubicación física |
| `telefono` | text | Contacto |
| `zona_horaria` | text | Default `Atlantic/Canary` |
| `radio_cobertura_km` | numeric | Radio de cobertura delivery |
| `tarifa_envio_tipo` | text | `fija` u otros |
| `tarifa_envio_valor` | numeric | Valor del envío |
| `mensaje_bienvenida`, `mensaje_cerrado` | text | Mensajes del bot |
| `datos_bancarios` | jsonb | Datos para transferencia |
| `moneda` | varchar(5) | Default `€` |

**Tenant:** Es la tabla raíz — no necesita `restaurante_id`.

---

### `menu_category`
Categorías del menú (ej: Pizzas, Bebidas, Entrantes).

| Columna | Tipo | Notas |
|---|---|---|
| `menu_category_id` | bigserial PK | |
| `name` | varchar(100) NOT NULL | Nombre de la categoría |
| `sort_order` | int4 | Orden de presentación |
| `is_active` | bool | Visibilidad |
| `restaurante_id` | int4 | **Discriminador de tenant — nullable, sin FK** |

---

### `menu_item`
Productos del menú. Pertenece a una categoría.

| Columna | Tipo | Notas |
|---|---|---|
| `menu_item_id` | bigserial PK | |
| `menu_category_id` | int8 FK → `menu_category` | |
| `name` | varchar(150) NOT NULL | |
| `description` | varchar(500) | |
| `is_pizza` | bool | Flag especial para lógica de pizzas |
| `is_active` | bool | |
| `tags` | varchar(300) | Etiquetas libres |
| `restaurante_id` | int4 | **Discriminador de tenant — nullable, sin FK** |

**Índice:** `ix_menu_item_category_active (menu_category_id, is_active)`

---

### `menu_variant`
Variantes de un producto (ej: Pequeña, Mediana, Grande). Un item puede tener 0 o N variantes.

| Columna | Tipo | Notas |
|---|---|---|
| `menu_variant_id` | bigserial PK | |
| `menu_item_id` | int8 NOT NULL | Referencia a `menu_item` — **sin FK declarada** |
| `variant_name` | varchar(80) NOT NULL | Nombre de la variante |
| `price` | numeric(10,2) NOT NULL | Precio específico de esta variante |
| `sku` | varchar(50) | Referencia interna opcional |
| `is_default` | bool | Variante por defecto |
| `is_active` | bool | |
| `restaurante_id` | int4 | **Discriminador de tenant — nullable, sin FK** |

**Índice:** `ix_menu_variant_item_active (menu_item_id, is_active)`

---

### `extra`
Extras o ingredientes adicionales disponibles (ej: queso extra, bacon).

| Columna | Tipo | Notas |
|---|---|---|
| `extra_id` | bigserial PK | |
| `name` | varchar(120) NOT NULL | |
| `price` | numeric(10,2) | Precio adicional (0 si es gratuito) |
| `is_active` | bool | |
| `allergens` | varchar(200) | Alérgenos en texto libre |
| `restaurante_id` | int4 | **Discriminador de tenant — nullable, sin FK** |

---

### `menu_item_extra`
Tabla de relación muchos-a-muchos entre `menu_item` y `extra`.

| Columna | Tipo | Notas |
|---|---|---|
| `menu_item_id` | int8 PK+FK → `menu_item` | |
| `extra_id` | int8 PK+FK → `extra` | |
| `is_default` | bool | Si el extra viene incluido por defecto |

**Sin `restaurante_id`.** La tenencia se hereda transitivamente por `menu_item`.

---

### `pedidos`
Pedidos realizados por clientes.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | serial4 PK | |
| `restaurante_id` | int4 FK → `restaurante` | Tenant |
| `usuario_id` | int4 FK → `usuarios` ON DELETE SET NULL | |
| `telefono` | text NOT NULL | Identificador del cliente |
| `items` | jsonb | Array de productos pedidos |
| `subtotal`, `costo_envio`, `total` | numeric | Importes |
| `tipo_despacho` | text | `delivery` / `retiro` |
| `direccion`, `lat`, `lng` | text / numeric | Dirección de entrega |
| `distancia_km` | numeric | Distancia calculada |
| `tiempo_estimado` | text | Tiempo estimado expresado como texto |
| `metodo_pago` | text | Método de pago |
| `estado` | text | `en_curso`, `pendiente_pago`, `confirmado`, `pagado`, etc. |
| `notas` | text | Notas libres |
| `session_id` | text | Vínculo con sesión de chat |
| `pedido_numero` | int4 | Número secuencial por sesión |
| `pedido_codigo` | varchar(20) | Código legible (ej: `260420-1001`) generado por trigger |

**Índices notables:**
- `idx_pedidos_telefono_updated_at (telefono, updated_at DESC)`
- `pedidos_session_pedido_unique UNIQUE (session_id, pedido_numero)`
- `ux_pedidos_pedido_codigo UNIQUE (pedido_codigo) WHERE pedido_codigo IS NOT NULL`

**Triggers:** Dos triggers before-insert llaman a `fn_set_pedido_codigo` y `trg_set_pedido_codigo` respectivamente (ver Observaciones de integridad).

---

### `usuarios`
Clientes del local. Almacena perfil y dirección frecuente.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | serial4 PK | |
| `restaurante_id` | int4 FK → `restaurante` | Tenant |
| `telefono` | text NOT NULL | |
| `nombre` | text | |
| `direccion_frecuente` | text | Última dirección de delivery usada |
| `lat_frecuente`, `long_frecuente` | numeric | Coordenadas de la dirección frecuente |
| `contexto` | text | Campo legacy — contexto libre |

**Índice único:** `usuarios_telefono_key UNIQUE (telefono)` — **sin incluir `restaurante_id`**. Problema multi-tenant (ver Observaciones).

---

### `horarios`
Franjas horarias de apertura por día de la semana, por local.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | serial4 PK | |
| `restaurante_id` | int4 FK → `restaurante` | Tenant |
| `dia` | text | Nombre del día |
| `disponible` | bool | Si el local abre ese día |
| `apertura_1`, `cierre_1` | time | Primera franja |
| `apertura_2`, `cierre_2` | time | Segunda franja (opcional) |

---

### `faqs`
Preguntas frecuentes por local, usadas por el bot.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | serial4 PK | |
| `restaurante_id` | int4 FK → `restaurante` | Tenant |
| `pregunta` | text NOT NULL | |
| `respuesta` | text NOT NULL | |
| `orden` | int4 | Orden de presentación |

---

### `config_operativa`
Configuración operativa del local (tiempos de espera, mensajes).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | serial4 PK | |
| `restaurante_id` | int4 FK → `restaurante` | Tenant |
| `tiempo_espera_minutos` | int4 | Default 30 |
| `mensaje_tiempo_espera` | text | Template con `{minutos}` |

---

### `restaurante_config`
Configuración genérica clave-valor por local.

| Columna | Tipo | Notas |
|---|---|---|
| `config_key` | varchar(100) PK | Clave de configuración |
| `config_value` | varchar(500) NOT NULL | Valor |
| `description` | text | Descripción opcional |
| `restaurante_id` | int4 | Tenant — **nullable, sin FK, no forma parte del PK** |

**Problema multi-tenant:** El PK es solo `config_key`. Si dos locales comparten la misma clave (ej: `cart_expiry_minutes`), habrá colisión. El PK compuesto debería ser `(config_key, restaurante_id)`.

---

### `contexto`
Contexto conversacional del bot por número de teléfono y sesión.

| Columna | Tipo | Notas |
|---|---|---|
| `telefono` | text NOT NULL | Identificador del cliente |
| `contexto` | text | Texto libre del contexto |
| `timestamp` | timestamp NOT NULL | |
| `session_id` | text | ID de sesión |
| `session_started_at` | timestamp | Inicio de sesión |
| `restaurante_id` | int4 FK → `restaurante` | Tenant |

**Sin PK declarada.** Los índices cubren `telefono`, `session_id` y `restaurante_id`.

---

### `n8n_chat_histories`
Historial de mensajes del chat gestionado por n8n (LangChain memory).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | serial4 PK | |
| `session_id` | varchar(255) NOT NULL | ID de sesión |
| `message` | jsonb NOT NULL | Mensaje completo |
| `timestamp` | timestamp | |

**Sin `restaurante_id`.** Tabla global o acoplada al session_id del tenant.

---

## Modelo moderno de menú

El modelo moderno está compuesto por cuatro tablas que se navegan en cascada:

```
menu_category
    └── menu_item  (menu_category_id FK)
            ├── menu_variant  (menu_item_id, sin FK declarada)
            └── menu_item_extra (menu_item_id FK)
                        └── extra (extra_id FK)
```

### Navegación del catálogo a un ítem con variante

1. **`menu_category`** define el grupo (ej: *Pizzas*).
2. **`menu_item`** es el producto (ej: *Pizza Margarita*). Tiene flag `is_pizza` para lógica especial de pizzas (mitad/mitad, etc.).
3. **`menu_variant`** define opciones de tamaño/presentación del producto, cada una con su propio precio (ej: *Pequeña — 8,50 €*, *Grande — 12,00 €*). Si un ítem no tiene variantes, se muestra sin distinción de tamaño.
4. **`extra`** son ingredientes o complementos con precio adicional (ej: *Queso extra — 1,00 €*). La relación `menu_item_extra` indica qué extras aplican a qué ítem, y si alguno viene incluido por defecto (`is_default`).

La función `fn_menu_catalog()` materializa esta estructura en filas planas `(categoria, producto, variante, precio, extras_disponibles)` con el campo derivado `producto_display` (ej: `"Pizza Margarita - Grande"`).

---

## Tabla legacy `menu`

**No existe** en el DDL actual. No hay tabla `menu` ni secuencia `menu_id_seq` referenciada por ninguna tabla activa. La secuencia `public.menu_id_seq` aparece declarada en el DDL pero no hay `CREATE TABLE public.menu` asociada — es un artefacto residual de una versión anterior.

El modelo operativo activo es exclusivamente `menu_category + menu_item + menu_variant + extra`.

---

## Funciones SQL definidas

### `fn_get_rest_config_int(p_key text, p_default integer) → integer`
Lee un valor entero de `restaurante_config` por clave. Si no existe o está vacío, devuelve el valor por defecto. Usada internamente por otras funciones para leer `cart_expiry_minutes` y `modify_window_minutes`.

---

### `fn_menu_catalog() → TABLE`
Retorna el catálogo completo del menú en filas planas: `(categoria, producto, descripcion, variante, precio, extras_disponibles, disponible, tags, is_pizza, producto_display)`. Solo incluye ítems activos con variantes activas. Agrega los extras disponibles como texto concatenado.

---

### `fn_menu_lookup(p_search text) → TABLE`
Busca en el catálogo completo por texto libre. Usa `unaccent` y `lower` para búsqueda case-insensitive sin tildes. Retorna las mismas columnas que `fn_menu_catalog()`. Si `p_search` es NULL o vacío, retorna todo el catálogo.

---

### `fn_next_pedido_codigo(p_fecha date) → text`
Genera el siguiente código de pedido con formato `YYMMDD-NNNN` (ej: `260420-1001`). Calcula el máximo correlativo del día y suma 1. No usa advisory lock — versión sin protección contra concurrencia.

---

### `fn_next_pedido_numero() → integer`
Retorna `MAX(pedido_numero) + 1` de toda la tabla `pedidos`. Función simple sin parámetros.

---

### `fn_resolver_pedido_referencia(p_telefono text, p_referencia text) → TABLE`
Busca un pedido del cliente por referencia textual flexible: acepta código exacto, prefijo de código, ID numérico o sufijo de dígitos (mínimo 3). Retorna datos completos del pedido incluyendo `es_modificable` según ventanas de tiempo configurables.

---

### `fn_resolver_pedido_modificable(p_telefono text, p_referencia text) → TABLE`
Filtra el resultado de `fn_resolver_pedido_referencia` para retornar solo pedidos donde `es_modificable = true`. Retorna máximo 1 fila.

---

### `fn_listar_pedidos_modificables(p_telefono text) → TABLE`
Lista todos los pedidos del cliente con flag `es_modificable` calculado. Usa las ventanas de tiempo de `restaurante_config`: `cart_expiry_minutes` (para estados `en_curso`/`draft`) y `modify_window_minutes` (para estados `pendiente_pago`/`confirmado`/`pagado`).

---

### `fn_select_pedido_reutilizable(p_telefono, p_session_id, p_pedido_id int8)` — overload 1
Selecciona el pedido más apropiado para reutilizar en una sesión. Prioridad: coincidencia por ID > coincidencia por session_id > tiene ítems > estado `en_curso` > más reciente. Retorna `SETOF pedidos`.

---

### `fn_select_pedido_reutilizable(p_telefono, p_session_id, p_pedido_id text, p_forzar_pedido_nuevo bool)` — overload 2
Versión extendida del overload anterior. Acepta `p_pedido_id` como texto (admite código o ID) y `p_forzar_pedido_nuevo` para forzar que ningún pedido sea reutilizable. Retorna tabla con `id` como `varchar`.

---

### `fn_upsert_usuario_perfil(p_telefono, p_nombre, p_direccion, p_tipo_despacho) → TABLE`
Inserta o actualiza el perfil del cliente. Solo actualiza `nombre` si se provee uno. Solo actualiza `direccion_frecuente` si `tipo_despacho` es `delivery`/`domicilio` y se provee dirección. Retorna flags `updated_name` y `updated_address` para que el caller sepa qué cambió.

---

### `fn_set_pedido_codigo() → trigger`
Trigger before-insert en `pedidos`. Genera `pedido_codigo` con formato `YYMMDD-NNNN` usando advisory lock `pg_advisory_xact_lock` para protección contra concurrencia. No sobreescribe si ya viene un código. Es la implementación robusta.

---

### `trg_set_pedido_codigo() → trigger`
Segunda función trigger before-insert en `pedidos`. Llama a `fn_next_pedido_codigo` sin advisory lock. Parece ser la versión anterior (sin protección de concurrencia). Coexiste con `fn_set_pedido_codigo` — ambos están registrados como triggers en la tabla.

---

### `unaccent(regdictionary, text)`, `unaccent(text)`, `unaccent_init`, `unaccent_lexize`
Extensión estándar de PostgreSQL para eliminar tildes y diacríticos. Usada en `fn_menu_lookup`.

---

## Tablas sin discriminador de tenant

| Tabla | Situación |
|---|---|
| `menu_item_extra` | Sin `restaurante_id`. La tenencia se deriva de `menu_item.restaurante_id`. Es una tabla de relación pura. |
| `n8n_chat_histories` | Sin `restaurante_id`. Tabla acoplada a n8n, posiblemente global o identificada por convención en `session_id`. |
| `contexto` | Tiene `restaurante_id` con FK, pero **no tiene PK declarada** — riesgo de duplicados. |

---

## Tablas globales

Ninguna tabla está explícitamente definida como global. Sin embargo:

- **`n8n_chat_histories`** se comporta como global — su `session_id` puede codificar el tenant implícitamente por convención.
- **`unaccent`** es una extensión de PostgreSQL compartida a nivel de instancia.

---

## Observaciones de integridad

### Constraints y FKs faltantes en tablas de menú
Las tablas `delivery_zone`, `extra`, `menu_category`, `menu_variant` y `menu_item` tienen columna `restaurante_id` pero **no declaran FK hacia `restaurante(id)`**. Esto permite insertar registros huérfanos sin validación a nivel de BD.

### PK de `restaurante_config` no es multi-tenant
El PK es solo `config_key`. Si se escala a múltiples locales con la misma clave (ej: `cart_expiry_minutes`), habrá colisión. Migración requerida: PK compuesto `(config_key, restaurante_id)`.

### Unique index en `usuarios.telefono` sin `restaurante_id`
`usuarios_telefono_key UNIQUE (telefono)` impide que el mismo número de teléfono esté registrado en dos locales distintos. En multi-tenant, el unique debería ser `(telefono, restaurante_id)`.

### Doble trigger en `pedidos`
Existen dos triggers before-insert sobre `pedidos`:
- `trg_set_pedido_codigo` → llama a `fn_set_pedido_codigo()` (con advisory lock — versión robusta)
- `tg_set_pedido_codigo` → llama a `trg_set_pedido_codigo()` (sin advisory lock — versión legacy)

Ambos se ejecutan en orden alfabético. El segundo puede sobreescribir el código generado por el primero si no detecta que ya viene asignado. Riesgo de código duplicado o condición de carrera.

### `contexto` sin PK
La tabla `contexto` no tiene constraint `PRIMARY KEY` declarado. Solo tiene índices sobre `telefono`, `session_id` y `restaurante_id`. Esto permite filas duplicadas para el mismo teléfono/sesión.

### Secuencia `menu_id_seq` huérfana
Existe la secuencia `public.menu_id_seq` pero no hay tabla `public.menu` que la use. Artefacto de versión anterior.

### `menu_variant.menu_item_id` sin FK declarada
La columna `menu_item_id` en `menu_variant` referencia `menu_item` pero **no tiene constraint FK**. Esto permite variantes con `menu_item_id` apuntando a ítems inexistentes.

### `fn_upsert_usuario_perfil` hardcodea `restaurante_id = 1`
En el INSERT de la función, el campo `restaurante_id` se asigna con el valor literal `1`. Esto es incompatible con multi-tenant y deberá parametrizarse.
