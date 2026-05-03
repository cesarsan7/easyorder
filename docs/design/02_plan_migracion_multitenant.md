# Plan de Migración Multi-Tenant — EasyOrder
**Fecha:** 2026-04-20  
**Fuente principal:** `docs/design/01_clasificacion_tablas_tenant.md` + auditorías `docs/audit/n8n_*.md`  
**Alcance:** Plan conceptual. Sin SQL todavía.

---

## Tablas que necesitan columna nueva `restaurante_id`

Solo una tabla cae en Categoría A (no tiene discriminador en absoluto):

| Tabla | Tipo de columna | Nullable al inicio | FK hacia | Índice necesario |
|---|---|---|---|---|
| `n8n_chat_histories` | `int4` | **Sí** — debe ser nullable hasta que n8n sea actualizado para popularlo en cada inserción | `restaurante(id)` | Sí — índice en `(restaurante_id, session_id)` para filtros de memoria por tenant |

**Justificación del nullable inicial:** la tabla es escrita directamente por el nodo LangChain de n8n. Forzar NOT NULL antes de actualizar el workflow rompería la inserción de mensajes en el único tenant productivo.

---

## Backfill de datos existentes

**Valor a usar:** `restaurante_id = 1`  
La Isla Pizzería es el único tenant activo. Su fila en la tabla `restaurante` tiene `id = 1` según el DML y el DDL fuente de verdad.

### Tablas que requieren backfill

| # | Tabla | Situación | Qué hacer en backfill |
|---|---|---|---|
| 1 | `n8n_chat_histories` | Columna nueva, todos los registros quedan en NULL | Asignar `restaurante_id = 1` a todos los registros existentes |
| 2 | `menu_category` | Columna existe pero es nullable (sin FK) | Poblar NULLs con `restaurante_id = 1` |
| 3 | `menu_item` | Ídem | Ídem |
| 4 | `menu_variant` | Ídem | Ídem |
| 5 | `extra` | Ídem | Ídem |
| 6 | `restaurante_config` | Ídem + PK rota | Poblar NULLs con `restaurante_id = 1` antes de cambiar la PK |

**Total de tablas que necesitan backfill: 6**

Las tablas de Categoría C1 (`pedidos`, `usuarios`, `horarios`, `faqs`, `config_operativa`, `contexto`) ya tienen `restaurante_id NOT NULL` con datos correctos — no necesitan backfill.

---

## Funciones SQL que necesitan recibir `restaurante_id` como parámetro

| # | Función | Firma actual | Firma nueva propuesta | Problema que resuelve |
|---|---|---|---|---|
| 1 | `fn_upsert_usuario_perfil` | `fn_upsert_usuario_perfil(p_telefono, p_nombre, p_direccion, p_tipo_despacho)` | `fn_upsert_usuario_perfil(p_telefono, p_nombre, p_direccion, p_tipo_despacho, p_restaurante_id int4)` | Hardcodea `restaurante_id = 1` en el INSERT de `usuarios` |
| 2 | `fn_menu_catalog` | `fn_menu_catalog()` | `fn_menu_catalog(p_restaurante_id int4)` | Devuelve catálogo de todos los restaurantes sin discriminar |
| 3 | `fn_menu_lookup` | `fn_menu_lookup(p_search text)` | `fn_menu_lookup(p_search text, p_restaurante_id int4)` | Búsqueda de ítems sin scope de tenant; recibe `NULL` desde n8n actualmente |
| 4 | `fn_get_rest_config_int` | `fn_get_rest_config_int(p_key text)` | `fn_get_rest_config_int(p_key text, p_restaurante_id int4)` | Lee `restaurante_config` sin filtrar por tenant |
| 5 | `fn_next_pedido_codigo` (o `fn_next_pedido_numero`) | `fn_next_pedido_numero()` | `fn_next_pedido_numero(p_restaurante_id int4)` | El correlativo es global; en multi-tenant el código debe ser secuencial por local |
| 6 | `fn_select_pedido_reutilizable` | `fn_select_pedido_reutilizable(p_telefono, p_session_id, p_pedido_id, p_forzar_nuevo)` | `fn_select_pedido_reutilizable(p_telefono, p_session_id, p_pedido_id, p_forzar_nuevo, p_restaurante_id int4)` | Puede retornar pedido de otro tenant si mismo teléfono tiene pedidos en múltiples locales |
| 7 | `fn_listar_pedidos_modificables` | `fn_listar_pedidos_modificables(p_telefono)` | `fn_listar_pedidos_modificables(p_telefono, p_restaurante_id int4)` | Lista pedidos de todos los restaurantes del cliente mezclados |
| 8 | `fn_resolver_pedido_referencia` | `fn_resolver_pedido_referencia(p_telefono, p_referencia)` | `fn_resolver_pedido_referencia(p_telefono, p_referencia, p_restaurante_id int4)` | El código de referencia puede colisionar entre tenants si no hay prefijo de local |

**Nota de compatibilidad:** al cambiar firmas, los workflows n8n deben actualizarse en el mismo ciclo. Dado que el agente está en fase de pruebas (no en producción), la ruptura es aceptable. Aún así, conviene hacerlo en el mismo paso de despliegue.

---

## Queries en n8n que necesitan agregar filtro por `restaurante_id`

### Workflow: `[MVP] Pizzeria` (Orquestador)

| Nodo | Query / operación | Problema | Cambio requerido |
|---|---|---|---|
| `Obtener Config Restaurante` | `SELECT * FROM restaurante WHERE id = 1` | `id = 1` hardcodeado | Parametrizar con `restaurante_id` recibido del webhook o config |
| `Nuevo usuario` (INSERT contexto) | `INSERT INTO contexto (..., restaurante_id) VALUES (..., 1)` | `restaurante_id = 1` hardcodeado | Tomar `restaurante_id` del contexto del webhook |
| `Asegurar Usuario Maestro` | `INSERT INTO usuarios (..., restaurante_id) VALUES (..., 1)` | `restaurante_id = 1` hardcodeado | Parametrizar |
| `Obtener registros` (SELECT contexto) | `SELECT ... FROM contexto WHERE telefono = :telefono` | Sin filtro de tenant | Agregar `AND restaurante_id = :restaurante_id` |
| Redis buffer key | `{telefono}_buffer` | Sin namespace por restaurante — colisión si dos locales atienden el mismo número | Cambiar key a `{restaurante_id}_{telefono}_buffer` |
| LangChain Memory (`n8n_chat_histories`) | Usa `conversation_id` como session key | Sin `restaurante_id` en la tabla | Agregar `restaurante_id` en cada escritura a `n8n_chat_histories` |

### Workflow: `[MVP] Apertura`

| Nodo | Query | Problema | Cambio requerido |
|---|---|---|---|
| `Crear Pedido Nuevo` | `INSERT INTO pedidos (..., restaurante_id=1, ...)` | `restaurante_id = 1` hardcodeado | Recibir `restaurante_id` como parámetro de entrada del workflow |
| `consultar_menu` | `fn_menu_lookup(NULL)` | Sin filtro de tenant | Cambiar a `fn_menu_lookup(NULL, :restaurante_id)` |
| `Actualizar Pedido en DB` | `UPDATE pedidos WHERE id = :pedido_id` | Sin validación de tenant | Agregar `AND restaurante_id = :restaurante_id` |
| `Buscar Pedido Activo` | `fn_select_pedido_reutilizable(:telefono, :session_id, :pedido_id, :forzar)` | Función sin `restaurante_id` | Cambiar a firma nueva con `p_restaurante_id` |
| `Obtener Siguiente Número` | `fn_next_pedido_numero()` | Correlativo global | Cambiar a `fn_next_pedido_numero(:restaurante_id)` |
| `Crear Pedido Nuevo` (subquery usuarios) | `SELECT id FROM usuarios WHERE telefono = :telefono LIMIT 1` | Sin filtro de tenant | Agregar `AND restaurante_id = :restaurante_id` |

### Workflow: `[MVP] Despacho`

| Nodo | Query | Problema | Cambio requerido |
|---|---|---|---|
| `Consultar Zona Delivery` | `SELECT ... FROM delivery_zone WHERE is_active = true AND postal_code = ...` | Sin filtro de restaurante | Agregar `AND restaurante_id = :restaurante_id` |
| `Actualizar Pedido Delivery` (subquery) | `SELECT config_value FROM restaurante_config WHERE config_key = 'delivery_eta_text' LIMIT 1` | Sin filtro de tenant | Agregar `AND restaurante_id = :restaurante_id` |
| `Actualizar Pedido Retiro` (subquery) | Idem para `pickup_eta_text`, `pickup_eta_minutes` | Idem | Idem |
| `Persistir Delivery Pendiente` (subquery) | Idem | Idem | Idem |
| `Guardar Direccion Frecuente` | `UPDATE usuarios SET direccion_frecuente WHERE telefono = :telefono` | Sin filtro de tenant | Agregar `AND restaurante_id = :restaurante_id` |
| `Guardar Direccion Frecuente Pendiente` | Idem | Idem | Idem |
| `Obtener Pedido Activo` | `fn_select_pedido_reutilizable(...)` | Función sin `restaurante_id` | Actualizar a firma nueva |

### Workflow: `[MVP] Pago`

| Nodo | Query | Problema | Cambio requerido |
|---|---|---|---|
| `Obtener Datos Bancarios` | `SELECT datos_bancarios, direccion, moneda FROM restaurante WHERE id = 1` | `id = 1` hardcodeado | Parametrizar con `restaurante_id` |
| `Registrar Método y Estado` | `UPDATE pedidos WHERE id = :pedido_id` | Sin filtro de tenant | Agregar `AND restaurante_id = :restaurante_id` |
| `Obtener Pedido con Total` | `fn_select_pedido_reutilizable(...)` | Función sin `restaurante_id` | Actualizar a firma nueva |

### Workflow: `[MVP] Preguntas`

| Nodo | Query | Problema | Cambio requerido |
|---|---|---|---|
| Tool `Preguntas` | `SELECT ... FROM faqs WHERE restaurante_id = 1` | `restaurante_id = 1` hardcodeado | Parametrizar |
| Tool `Horarios` | `SELECT ... FROM horarios WHERE restaurante_id = 1` | `restaurante_id = 1` hardcodeado | Parametrizar |
| Tool `Menu` | `fn_menu_lookup(NULL)` | Sin filtro de tenant | Cambiar a `fn_menu_lookup(NULL, :restaurante_id)` |
| `Postgres Chat Memory` | Key de sesión: `telefono` | Sin aislamiento por tenant | Cambiar key a `{restaurante_id}_{telefono}` |

### Workflow: `[MVP] Contexto`

| Nodo | Query | Problema | Cambio requerido |
|---|---|---|---|
| `Actualizar Contexto` | `UPDATE contexto WHERE telefono = :telefono` | Sin filtro de tenant | Agregar `AND restaurante_id = :restaurante_id` |

### Workflow: `[MVP] Pedidos Cliente`

| Nodo | Query | Problema | Cambio requerido |
|---|---|---|---|
| `Listar Modificables` | `fn_listar_pedidos_modificables(:telefono)` | Sin `restaurante_id` | Actualizar a firma nueva con `p_restaurante_id` |
| `Resolver Pedido` | `fn_resolver_pedido_referencia(:telefono, :referencia)` | Sin `restaurante_id` | Actualizar a firma nueva con `p_restaurante_id` |
| Trigger del workflow | No recibe `restaurante_id` como input | El orquestador no lo pasa | Agregar `restaurante_id` a los inputs declarados del trigger |

### Workflow: `[MVP] Perfil Cliente`

| Nodo | Query | Problema | Cambio requerido |
|---|---|---|---|
| `Guardar Perfil` | `fn_upsert_usuario_perfil(:telefono, :nombre, :direccion, :tipo_despacho)` | Sin `restaurante_id` — busca usuario solo por teléfono | Actualizar a firma nueva con `p_restaurante_id` |
| Trigger del workflow | No recibe `restaurante_id` como input | El orquestador no lo pasa | Agregar `restaurante_id` a los inputs declarados del trigger |

---

## Orden seguro de migración

El orden respeta las dependencias: primero se estabilizan las tablas, luego los constraints, luego las funciones, y por último los workflows de n8n.

### Fase 1 — Backfill previo (sin cambio de constraints)
**Objetivo:** poblar todos los NULLs existentes antes de endurecer la estructura. Sin esto, los ALTER TABLE a NOT NULL fallarán.

1. Backfill `menu_category.restaurante_id = 1` donde es NULL
2. Backfill `menu_item.restaurante_id = 1` donde es NULL
3. Backfill `menu_variant.restaurante_id = 1` donde es NULL
4. Backfill `extra.restaurante_id = 1` donde es NULL
5. Backfill `restaurante_config.restaurante_id = 1` donde es NULL

**Riesgo fase 1:** Bajo. Solo UPDATEs sobre datos existentes del único tenant.

---

### Fase 2 — Agregar columna en `n8n_chat_histories`
**Objetivo:** agregar el campo sin romper n8n.

6. `ALTER TABLE n8n_chat_histories ADD COLUMN restaurante_id int4 NULL REFERENCES restaurante(id)`
7. Crear índice en `(restaurante_id, session_id)`
8. Backfill `n8n_chat_histories.restaurante_id = 1` en todos los registros existentes

**Riesgo fase 2:** Bajo. La columna es nullable; n8n sigue funcionando aunque no la popule todavía.

---

### Fase 3 — Endurecer tablas de catálogo (C2 → C1)
**Prerequisito:** Fase 1 completada (todos los NULLs ya poblados).

9. `menu_category`: agregar FK `restaurante_id → restaurante(id)` + cambiar a NOT NULL
10. `menu_item`: ídem
11. `menu_variant`: ídem
12. `extra`: ídem

**Riesgo fase 3:** Medio. Si el backfill de Fase 1 tuvo algún NULL sin poblar, el ALTER fallará — verificar antes de ejecutar.

---

### Fase 4 — Corregir `restaurante_config` (PK rota)
**Esta es la operación de mayor riesgo — cambio de PK.**

13. Verificar que no existen duplicados `(config_key, restaurante_id)` en `restaurante_config`
14. Eliminar PK actual (solo `config_key`)
15. Agregar FK `restaurante_id → restaurante(id)` + cambiar a NOT NULL
16. Crear nueva PK compuesta `(config_key, restaurante_id)`

**Riesgo fase 4:** Alto. Cambiar PK puede afectar índices, constraints y cualquier JOIN existente que use la PK vieja. Ejecutar en ventana de mantenimiento.

---

### Fase 5 — Corregir constraints en tablas operativas (C1 débiles)

17. `usuarios`: eliminar `UNIQUE(telefono)` y crear `UNIQUE(telefono, restaurante_id)`
18. `contexto`: declarar PK compuesta `(telefono, restaurante_id)` (la tabla actualmente no tiene PK)

**Riesgo fase 5:** Alto para `usuarios` — rompe el constraint existente. Verificar antes que no haya duplicados `(telefono, restaurante_id)`. Para `contexto`, riesgo medio si hay filas duplicadas.

---

### Fase 6 — Modificar funciones SQL
**Prerequisito:** Fases 3–5 completadas. Las funciones nuevas deben ser compatibles con la estructura de tablas ya endurecida.

19. `fn_upsert_usuario_perfil` → agregar parámetro `p_restaurante_id`
20. `fn_menu_catalog` → agregar parámetro `p_restaurante_id`
21. `fn_menu_lookup` → agregar parámetro `p_restaurante_id`
22. `fn_get_rest_config_int` → agregar parámetro `p_restaurante_id`
23. `fn_next_pedido_numero` → agregar parámetro `p_restaurante_id`
24. `fn_select_pedido_reutilizable` → agregar parámetro `p_restaurante_id`
25. `fn_listar_pedidos_modificables` → agregar parámetro `p_restaurante_id`
26. `fn_resolver_pedido_referencia` → agregar parámetro `p_restaurante_id`

**Estrategia de compatibilidad:** crear cada función nueva con nombre temporal (ej. `fn_menu_lookup_v2`) y renombrar solo cuando n8n esté actualizado. Esto evita romper el flujo existente si la actualización de n8n se retrasa.

---

### Fase 7 — Actualizar workflows n8n
**Prerequisito:** Fase 6 completada. Actualizar todos los workflows en un único despliegue coordinado.

27. Agregar `restaurante_id` como input a todos los sub-workflows que hoy no lo reciben
28. Actualizar todas las queries con `restaurante_id = 1` hardcodeado para usar el parámetro
29. Actualizar todas las llamadas a funciones SQL a las firmas nuevas
30. Actualizar key de Redis de `{telefono}_buffer` a `{restaurante_id}_{telefono}_buffer`
31. Actualizar session key de LangChain Memory de `{telefono}` a `{restaurante_id}_{telefono}`
32. Convertir `n8n_chat_histories.restaurante_id` de NULL a NOT NULL (después de verificar que n8n popula el campo correctamente)

**Riesgo fase 7:** Medio. El agente está en fase de pruebas, no en producción. Aun así, el despliegue debe ser atómico: activar todos los workflows actualizados a la vez para evitar estado inconsistente entre el orquestador y los subflujos.

---

## Estrategia de rollback

### Rollback Fase 1 (Backfill de NULLs)
- Acción: `UPDATE tabla SET restaurante_id = NULL WHERE restaurante_id = 1`
- Condición de uso: si se detecta que el backfill pobló filas incorrectas
- Impacto: bajo — solo revierte datos, no estructura

### Rollback Fase 2 (columna nueva en `n8n_chat_histories`)
- Acción: `ALTER TABLE n8n_chat_histories DROP COLUMN restaurante_id`
- Condición de uso: si la columna causa problemas inesperados con LangChain
- Impacto: bajo — columna era nullable, su eliminación no rompe n8n

### Rollback Fase 3 (FK + NOT NULL en tablas de catálogo)
- Acción por tabla: eliminar FK constraint + `ALTER COLUMN restaurante_id DROP NOT NULL`
- Condición de uso: si alguna query de n8n falla por NOT NULL violation
- Impacto: medio — hay que revertir 4 tablas en orden inverso a las dependencias: `extra`, `menu_variant`, `menu_item`, `menu_category`

### Rollback Fase 4 (PK `restaurante_config`)
- Acción: eliminar PK compuesta + eliminar FK + eliminar NOT NULL + recrear PK original en `config_key`
- Condición de uso: si algún sistema externo depende de la PK original
- Impacto: alto — requiere ventana de mantenimiento; el orden importa (primero eliminar nueva PK, luego recrear antigua)

### Rollback Fase 5 (constraints en `usuarios` y `contexto`)
- `usuarios`: eliminar `UNIQUE(telefono, restaurante_id)` + recrear `UNIQUE(telefono)`
- `contexto`: eliminar PK compuesta (la tabla vuelve a estar sin PK)
- Condición de uso: si hay inserción de usuarios que falla con el nuevo constraint
- Impacto: alto para `usuarios` en producción; bajo en entorno de pruebas actual

### Rollback Fase 6 (funciones SQL)
- Acción: si se usó la estrategia de nombre temporal (`fn_menu_lookup_v2`), simplemente no renombrar y dejar la versión original activa
- Si ya se renombró: restaurar el DDL original desde el archivo `docs/db/DDL_restaurante_mvp.sql`
- Impacto: bajo si se usó nombre temporal; medio si ya se renombró

### Rollback Fase 7 (workflows n8n)
- Acción: en n8n, cada workflow tiene historial de versiones. Activar la versión anterior del JSON para cada workflow afectado
- Los JSONs originales están en `docs/n8n/` — pueden reimportarse directamente
- Condición de uso: si los workflows actualizados producen errores en pruebas funcionales
- Impacto: bajo — restaurar un workflow en n8n es inmediato y atómico

---

## Resumen visual del plan

```
Fase 1  → Backfill NULLs (menu_category, menu_item, menu_variant, extra, restaurante_config)
Fase 2  → Agregar columna nullable en n8n_chat_histories + backfill
Fase 3  → NOT NULL + FK en tablas de catálogo (depende de Fase 1)
Fase 4  → PK compuesta en restaurante_config (depende de Fase 3, alto riesgo)
Fase 5  → Unique y PK en usuarios y contexto (depende de Fases 3–4)
Fase 6  → Nuevas firmas de funciones SQL (depende de Fases 3–5)
Fase 7  → Actualizar workflows n8n + convertir n8n_chat_histories a NOT NULL (depende de Fase 6)
```

Cada fase puede detenerse y revertirse sin afectar las fases anteriores ya completadas, excepto Fase 4 que requiere ventana de mantenimiento por el cambio de PK.
