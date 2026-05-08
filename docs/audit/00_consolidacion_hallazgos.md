# Consolidación de Hallazgos — EasyOrder MVP
**Fecha:** 2026-04-20  
**Fuentes:** auditorías de base de datos, datos semilla, infraestructura y 9 workflows n8n

---

## Brechas identificadas

Lo que le falta al sistema actual para convertirse en un SaaS multi-tenant.

### Aislamiento de tenant en n8n (crítico)

| Nodo / Workflow | Problema |
|---|---|
| `Pizzeria` → `Nuevo usuario` | `restaurante_id = 1` hardcodeado en INSERT a `contexto` |
| `Pizzeria` → `Obtener Config Restaurante` | `WHERE id = 1` hardcodeado — siempre carga restaurante 1 |
| `Pizzeria` → `Asegurar Usuario Maestro` | `restaurante_id = 1` hardcodeado en INSERT a `usuarios` |
| `Apertura` → `Crear Pedido Nuevo` | `restaurante_id = 1` hardcodeado en INSERT a `pedidos` |
| `Apertura` → `consultar_menu` | `fn_menu_lookup(NULL)` — sin filtro de tenant, devuelve todo el catálogo |
| `Apertura` → `Actualizar Pedido en DB` | `WHERE id = :pedido_id` sin `AND restaurante_id = :restaurante_id` |
| `Despacho` → `Consultar Zona Delivery` | `delivery_zone` sin filtro `restaurant_id` |
| `Despacho` → `restaurante_config` (3 nodos) | `LIMIT 1` sin `restaurant_id` — ETA de cualquier restaurante |
| `Despacho` → `Guardar Direccion Frecuente` | `WHERE telefono = :telefono` sin `restaurant_id` |
| `Pago` → `Obtener Datos Bancarios` | `WHERE id = 1` hardcodeado |
| `Preguntas` → FAQs | `WHERE restaurante_id = 1` hardcodeado |
| `Preguntas` → Horarios | `WHERE restaurante_id = 1` hardcodeado |
| `Preguntas` → Menú | `fn_menu_lookup(NULL)` sin filtro de tenant |
| `Contexto` → `Actualizar Contexto` | `WHERE telefono = $Telefono` sin `restaurant_id` |
| `Derivar Humano` → URL Chatwoot | URL de instancia Chatwoot hardcodeada |
| `Pizzeria` → `Validacion` (nodo JS) | Timezone `Atlantic/Canary` hardcodeada |
| `Pizzeria` → Redis buffer | Key `{telefono}_buffer` sin namespace de restaurante |
| `Pizzeria` → Memoria LangChain (`n8n_chat_histories`) | `session_key = conversation_id` — tabla **sin `restaurante_id`**, cruce de historial garantizado si dos tenants comparten instancia n8n |
| `Preguntas` → Memoria LangChain (`n8n_chat_histories`) | Mismo problema — nodo Memory usa `session_id` sin namespace de restaurante |
| `Pizzeria` → System prompt Director | Nombre `"La Isla Pizzería"` hardcodeado |
| `Pizzeria` → Horarios (DataTable n8n) | Horarios en DataTable interna de n8n, no parametrizable por tenant |

### Funciones SQL sin parámetro `restaurante_id`

| Función | Impacto |
|---|---|
| `fn_select_pedido_reutilizable(telefono, session_id, pedido_id, forzar)` | Puede devolver pedido de otro restaurante para el mismo teléfono |
| `fn_listar_pedidos_modificables(telefono)` | Lista pedidos de todos los restaurantes del cliente |
| `fn_resolver_pedido_referencia(telefono, referencia)` | Código de pedido puede colisionar entre locales |
| `fn_upsert_usuario_perfil(telefono, nombre, direccion, tipo)` | Hardcodea `restaurante_id = 1` en el INSERT |
| `fn_menu_lookup(search)` | Sin filtro de tenant — retorna catálogo global |
| `fn_menu_catalog()` | Sin filtro de tenant — retorna catálogo global |
| `fn_next_pedido_numero()` | Secuencia global sin scope por restaurante |

### Problemas de integridad en esquema PostgreSQL

- `restaurante_config`: PK es solo `config_key` — colisión garantizada en multi-tenant.
- `usuarios.telefono`: UNIQUE solo por teléfono — impide que el mismo número exista en dos locales.
- `contexto`: sin PK declarada — permite filas duplicadas.
- `menu_variant.menu_item_id`: sin FK declarada — permite variantes huérfanas.
- Tablas de menú (`menu_category`, `menu_item`, `menu_variant`, `extra`): `restaurante_id` nullable, sin FK hacia `restaurante`.
- `fn_upsert_usuario_perfil`: INSERT con `restaurante_id = 1` literal en el cuerpo de la función SQL.

### Componentes web inexistentes (EasyOrder como producto)

- No existe frontend web (menú digital, carrito, checkout).
- No existe backend API REST separado de n8n.
- No existe dashboard operativo del local.
- No existe sistema de autenticación para locales.
- No existe onboarding de tenants.
- No existe subdominio dedicado para EasyOrder en el DNS.
- No existe panel de métricas ni reportes.

### Inconsistencias en datos semilla (restaurante 1)

- Coordenadas apuntan a Santiago de Chile, no a Lanzarote.
- `restaurante_config.timezone = 'America/New_York'` vs `restaurante.zona_horaria = 'Atlantic/Canary'`.
- FAQs insertadas 3 veces (18 registros, solo 6 únicos).
- FAQs contienen dirección y precios de un local distinto.
- `menu_category`: sort_order solapados entre dos cargas distintas.
- Items 1 y 2 tienen variante `is_default = true` de dos cargas distintas (conflicto).

---

## Componentes reutilizables confirmados

Lo que puede usarse directamente sin cambios en EasyOrder.

### Infraestructura
- **VPS Hostinger + EasyPanel**: ya aloja todos los servicios. No requiere nuevo servidor.
- **PostgreSQL** (`n8learning_postgres`): base de datos principal con schema completo del negocio.
- **n8n** (`n8learning_n8n`): flujo WhatsApp operativo con 70 979 ejecuciones.
- **Chatwoot** (`n8learning_chatwoot`): canal WhatsApp activo e integrado.
- **Redis**: buffer de mensajes ya operativo.
- **Qdrant**: disponible para búsqueda semántica (ya desplegado).
- **Supabase** (`n8learning_supabase_kong`): disponible para Auth y PostgREST.
- **Dominio `ai2nomous.com`**: DNS ya apuntado al VPS. Se pueden crear subdominios sin registrar nada nuevo.

### Base de datos (tablas y estructura)
- Todas las tablas del modelo de menú: `menu_category`, `menu_item`, `menu_variant`, `extra`, `menu_item_extra`.
- Tablas de negocio: `pedidos`, `usuarios`, `horarios`, `faqs`, `delivery_zone`, `config_operativa`.
- Tablas de configuración: `restaurante`, `restaurante_config`.
- Tablas de sesión: `contexto`, `n8n_chat_histories`.
- Funciones SQL de consulta (con modificaciones menores): `fn_menu_lookup`, `fn_menu_catalog`, `fn_next_pedido_codigo`, `fn_resolver_pedido_referencia`, `fn_listar_pedidos_modificables`.
- Trigger `fn_set_pedido_codigo` con advisory lock (versión robusta).
- Extensión `unaccent` para búsqueda normalizada.

### Workflows n8n (lógica de negocio WhatsApp)
- Lógica de buffer de mensajes.
- Validación de disponibilidad del local (horarios + timezone).
- Gestión de sesión (30 min timeout, UUID).
- Flujo completo Apertura → Despacho → Pago.
- Validador de ítems con scoring semántico (Agente Validador en Apertura).
- Lógica de reutilización de pedidos.
- Subflujos: Perfil Cliente, Pedidos Cliente, Preguntas, Contexto, Derivar Humano.
- Memoria conversacional LangChain (PostgreSQL).
- Integración con OpenAI Whisper para audio.

---

## Componentes que necesitan evolución

Lo que existe pero debe modificarse para soportar multi-tenant.

### Funciones SQL (modificaciones quirúrgicas)

| Función | Cambio necesario |
|---|---|
| `fn_select_pedido_reutilizable` | Agregar parámetro `p_restaurante_id` y filtro `WHERE restaurante_id = p_restaurante_id` |
| `fn_listar_pedidos_modificables` | Agregar parámetro `p_restaurante_id` |
| `fn_resolver_pedido_referencia` | Agregar parámetro `p_restaurante_id` |
| `fn_upsert_usuario_perfil` | Reemplazar `restaurante_id = 1` literal por parámetro `p_restaurante_id` |
| `fn_menu_lookup` | Agregar parámetro `p_restaurante_id` para filtrar catálogo por tenant |
| `fn_menu_catalog` | Ídem |
| `fn_next_pedido_numero` | Acotar secuencia por `restaurante_id` |

### Migraciones de esquema PostgreSQL

| Cambio | Tabla | Tipo de migración |
|---|---|---|
| PK compuesto `(config_key, restaurante_id)` | `restaurante_config` | DDL — requiere DROP + RECREATE del PK |
| UNIQUE `(telefono, restaurante_id)` | `usuarios` | DDL — DROP + CREATE de índice único |
| Agregar PK (`telefono`, `session_id`, `restaurante_id`) | `contexto` | DDL — sin datos de producción, riesgo bajo |
| Agregar FK `menu_variant.menu_item_id → menu_item` | `menu_variant` | DDL — requiere validar integridad antes |
| Agregar FK `restaurante_id → restaurante` en tablas de menú | `menu_category`, `menu_item`, `menu_variant`, `extra` | DDL — nullable → validación diferida |
| DROP trigger legacy `tg_set_pedido_codigo` | `pedidos` | DDL — eliminar versión sin advisory lock |

### Workflows n8n (nuevas versiones, no modificar producción)

| Cambio | Workflows afectados |
|---|---|
| Propagar `restaurante_id` desde el webhook de entrada | `Pizzeria` (orquestador) |
| Reemplazar `WHERE id = 1` por variable dinámica | `Pizzeria`, `Pago` |
| Filtrar `fn_menu_lookup` por `restaurante_id` | `Apertura`, `Preguntas` |
| Agregar `restaurante_id` a `fn_select_pedido_reutilizable` | `Apertura`, `Despacho`, `Pago` |
| Agregar `restaurante_id` al INSERT de pedidos | `Apertura` |
| Agregar `restaurante_id` al UPDATE de contexto | `Contexto` |
| Leer timezone desde `restaurante.zona_horaria` | `Pizzeria` (nodo Validacion) |
| Migrar horarios de DataTable a `SELECT FROM horarios` | `Pizzeria` (nodo Validacion) |
| Inyectar nombre del local dinámicamente en el system prompt | `Pizzeria` (Director + Cerrado) |
| Namespace Redis: `{restaurante_id}_{telefono}_buffer` | `Pizzeria` |
| Parametrizar URL base de Chatwoot por tenant | `Derivar Humano` |

### Limpieza de datos semilla

- Corregir coordenadas de `restaurante` (lat/long → Lanzarote).
- Unificar `timezone` entre `restaurante.zona_horaria` y `restaurante_config.timezone`.
- Eliminar 12 registros duplicados de `faqs` (dejar 6 únicos).
- Actualizar contenido de FAQs (dirección, precios).
- Limpiar variante "Única" duplicada en items 1 y 2 (Margarita, Pepperoni).
- Ordenar `sort_order` de `menu_category` sin solapamientos.
- Corregir código postal de PLAYA HONDA (`3509` → `35509`).

---

## Componentes nuevos necesarios

Lo que hay que construir desde cero.

### Frontend web — menú digital público (MVP)
- Página de menú por local (`/[slug-local]`): categorías, productos, variantes, extras.
- Carrito de compras con cálculo de subtotal.
- Flujo de checkout: tipo de despacho, dirección (delivery), método de pago.
- Envío estructurado del pedido por WhatsApp vía link `wa.me` o API.
- Diseño responsivo (mobile-first).
- URL por local (subdominio o path).

### Backend API EasyOrder (MVP o post-MVP según decisión arquitectural)
- Endpoints REST o PostgREST para: catálogo de menú por tenant, creación de pedidos, configuración del local.
- Alternativamente: exponer datos vía Supabase PostgREST (ya disponible) sin nuevo servicio.

### Autenticación y dashboard operativo (post-MVP)
- Autenticación de propietarios de local con Supabase Auth.
- Dashboard: vista de pedidos en tiempo real, cambio de estado.
- Configuración del local: horarios, zonas de delivery, menú, FAQs.
- Métricas básicas: pedidos del día, ingresos, productos más pedidos.

### Infraestructura de despliegue
- Subdominio dedicado (ej: `order.ai2nomous.com` o `app.ai2nomous.com`).
- Entrada DNS en Namecheap + certificado SSL en EasyPanel.
- Contenedor del frontend en EasyPanel.
- Contenedor del backend API (si se decide separar de n8n y PostgREST).

### Sistema multi-tenant de onboarding
- Tabla o proceso para registrar nuevos locales (`restaurante`).
- Seed inicial por tenant: horarios, config_operativa, restaurante_config defaults.
- Mecanismo para asociar webhook n8n con `restaurante_id` correcto.

---

## Riesgos de regresión identificados

Cambios futuros que podrían romper el sistema actual si no se manejan con cuidado.

| Riesgo | Origen | Nivel | Mitigación |
|---|---|---|---|
| Modificar workflows n8n en producción | n8n tiene 70 979 ejecuciones activas | **Crítico** | Crear versiones nuevas de cada workflow; no editar los activos |
| Cambiar PK de `restaurante_config` | Todas las queries que leen por `config_key` dejarán de funcionar | **Alto** | Migración en transacción; auditar cada consumer antes |
| Cambiar UNIQUE de `usuarios.telefono` | Las queries de upsert por teléfono dejarán de funcionar correctamente | **Alto** | Migración con validación previa de duplicados en datos |
| Modificar firmas de funciones SQL usadas en n8n | Los nodos SQL existentes rompen si los parámetros cambian | **Alto** | Crear versiones nuevas (`fn_menu_lookup_v2`); deprecar gradualmente |
| Agregar FK en tablas de menú | Inserción de datos existentes sin `restaurante_id` declarará error | **Medio** | Backfill de `restaurante_id` antes de declarar FK; usar `DEFERRABLE` |
| Eliminar trigger legacy `tg_set_pedido_codigo` | Si la lógica de precedencia no es la esperada, puede afectar generación de `pedido_codigo` | **Medio** | Verificar orden de ejecución actual en producción antes de eliminar |
| Migrar horarios de DataTable a PostgreSQL | El nodo `Validacion` deja de funcionar si la migración es incompleta | **Medio** | Cargar datos en tabla `horarios` y verificar en staging antes de cambiar el nodo |
| Vencimiento del VPS (2026-05-10) | Todo cae: n8n, PostgreSQL, Chatwoot, pedidos en curso | **Urgente** | Confirmar renovación antes de 2026-05-10 |
| Cambios en `fn_upsert_usuario_perfil` | Llamada desde n8n `Perfil Cliente` — si la firma cambia, el nodo falla | **Medio** | Mantener overload compatible o actualizar nodo en mismo deploy |
| Modificar `contexto` (agregar PK) | Si hay duplicados en producción, la migración falla | **Bajo** | Deduplicar antes; la tabla es regenerable desde sesiones activas |

---

## Preguntas que necesitan validación manual

Lo que no puede responderse sin acceso al sistema real o al equipo operativo.

### Infraestructura
1. **¿Redis está en el VPS `n8learning`?** No aparece listado como servicio visible en EasyPanel. El flujo de buffer lo usa — ¿está en un contenedor no documentado o en un servicio externo?
2. **¿La renovación del VPS (vence 2026-05-10) está confirmada?** Riesgo crítico si no se renueva antes de esa fecha.
3. **¿Cuánta capacidad libre tiene el VPS?** No hay métricas de CPU/RAM/disco disponibles. Con frontend + backend nuevos, ¿hay margen suficiente?
4. **¿Existe entorno de staging?** ¿O todo desarrollo se prueba directo en el VPS de producción?
5. **¿Existe backup automatizado de PostgreSQL?** No está documentado.

### Supabase
6. **¿Supabase Auth, PostgREST y Storage están activos?** Solo se documenta el Kong (gateway). ¿Se puede usar Supabase Auth para los locales sin conflicto con el esquema PostgreSQL actual?
7. **¿El proyecto Supabase es el del VPS propio o un proyecto cloud externo?** Importante para decidir cómo se usa.

### Dominio y producto
8. **¿El dominio de EasyOrder será `ai2nomous.com` (subdominio) o un dominio separado?** Afecta la arquitectura de rutas y el modelo de tenant URL.
9. **¿Cada local tendrá su propio subdominio (`localA.easyorder.com`) o una ruta (`easyorder.com/localA`)?** Decisión de arquitectura de tenant que afecta DNS, routing y cookies.

### Modelo de datos y negocio
10. **¿`fn_menu_lookup(NULL)` filtra internamente por `restaurante_id`?** El DDL auditado muestra la función sin ese filtro, pero requiere ejecutarla para confirmar el comportamiento real.
11. **¿El cliente es global o por tenant?** ¿Un mismo número de teléfono debe tener un perfil unificado entre todos los locales, o perfiles independientes por local? Esto determina si `usuarios` se mantiene con UNIQUE `(telefono)` o cambia a `(telefono, restaurante_id)`.
12. **`n8n_chat_histories` NO tiene `restaurante_id` — CONFIRMADO GAP.** ✅ La tabla es global. El aislamiento no existe a nivel de schema. Fix: M-17 (columna `restaurante_id` + índice) + prefijo `{restaurante_id}_{session_id}` en nodos Memory de Pizzeria y Preguntas.
13. **¿El proyecto `learningliz` tiene dependencia operativa activa con `n8learning`?** Comparten VPS — ¿comparten también base de datos o configuración?
14. **¿Hay algún proceso de codificación de `restaurante_id` en el `session_id` de Chatwoot?** Podría ser la fuente de aislamiento implícita que falta documentar.
