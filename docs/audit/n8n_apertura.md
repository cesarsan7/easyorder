# Audit: [MVP] Apertura

## Propósito
Buscar o crear un pedido activo, validar los productos solicitados contra el menú y ejecutar la acción (agregar / quitar / modificar / consultar) actualizando el pedido en base de datos.

---

## Trigger y entradas

- **Tipo**: `executeWorkflowTrigger` — es invocado por otro workflow (el Director central).
- **Entradas recibidas**:

| Campo              | Tipo     | Descripción                                               |
|--------------------|----------|-----------------------------------------------------------|
| `accion`           | string   | `agregar`, `quitar`, `modificar` o `consultar`            |
| `items`            | array    | Lista de productos solicitados por el cliente             |
| `telefono`         | string   | Número de teléfono del cliente                            |
| `session_id`       | string   | ID de sesión activa                                       |
| `pedido_id`        | string   | ID de pedido previo (puede ser vacío)                     |
| `usuario_id`       | string   | ID de usuario registrado (puede ser vacío)                |
| `forzar_pedido_nuevo` | bool  | Si `true`, ignora pedido reutilizable y crea uno nuevo    |

---

## Queries SQL embebidas

### 1. `Buscar Pedido Activo`
```sql
SELECT * FROM public.fn_select_pedido_reutilizable(
  :telefono, :session_id, :pedido_id, :forzar_pedido_nuevo
)
```
- **Tabla**: `pedidos` (vía función)
- **Operación**: SELECT
- **Qué hace**: busca un pedido en estado reutilizable (en_curso) para el teléfono y sesión dados. Si `forzar_pedido_nuevo = true`, la función no retorna resultado.

---

### 2. `Obtener Siguiente Número`
```sql
SELECT public.fn_next_pedido_numero() AS siguiente_numero
```
- **Tabla**: secuencia interna (presumiblemente `pedidos` o una secuencia dedicada)
- **Operación**: SELECT (función que avanza secuencia)
- **Qué hace**: genera el próximo número de pedido correlativo. Solo se ejecuta cuando no existe pedido reutilizable.

---

### 3. `Crear Pedido Nuevo`
```sql
INSERT INTO pedidos (
  restaurante_id, usuario_id, telefono, session_id, session_started_at,
  pedido_numero, items, subtotal, total, estado, created_at, updated_at
) VALUES (
  1,  -- restaurante_id HARDCODEADO
  COALESCE(:usuario_id_limpio, (SELECT id FROM usuarios WHERE telefono = :telefono LIMIT 1)),
  :telefono, :session_id, NOW(), :siguiente_numero,
  '[]'::jsonb, 0, 0, 'en_curso', NOW(), NOW()
) RETURNING *
```
- **Tablas**: `pedidos`, `usuarios`
- **Operación**: INSERT + SELECT interno
- **Qué hace**: crea un pedido nuevo vacío en estado `en_curso`.  
  ⚠️ `restaurante_id = 1` está **hardcodeado**.

---

### 4. `consultar_menu`
```sql
SELECT categoria, producto, descripcion, variante, precio,
       extras_disponibles, disponible, tags, is_pizza,
       producto_display AS nombre
FROM public.fn_menu_lookup(NULL)
ORDER BY categoria, producto, precio
```
- **Tabla**: `menu_item`, `menu_variant`, `menu_category` (vía función)
- **Operación**: SELECT
- **Qué hace**: obtiene todo el catálogo de productos para validar los ítems solicitados.  
  ⚠️ El parámetro es `NULL` — devuelve el menú de **todos los restaurantes** sin filtro.

---

### 5. `Actualizar Pedido en DB`
```sql
UPDATE pedidos p
SET
  items    = :items_actualizados::jsonb,
  subtotal = :subtotal,
  total    = CASE WHEN tipo_despacho = 'delivery' THEN :subtotal + COALESCE(costo_envio, 0) ELSE :subtotal END,
  usuario_id = COALESCE(p.usuario_id, :usuario_id),
  estado   = CASE WHEN estado IN ('confirmado','pendiente_pago','pagado','paid') THEN 'en_curso' ELSE COALESCE(estado,'en_curso') END,
  updated_at = NOW()
WHERE p.id = :pedido_id
  AND :mutar_db = true
RETURNING p.*
```
- **Tabla**: `pedidos`
- **Operación**: UPDATE condicional (solo si `mutar_db = true`)
- **Qué hace**: persiste los ítems actualizados, recalcula totales y protege pedidos ya confirmados revirtiéndolos a `en_curso` si se modifican.  
  ⚠️ El filtro es solo `WHERE id = :pedido_id` — sin `restaurante_id`.

---

## Lógica condicional crítica

| Nodo              | Condición                                    | Rama TRUE                        | Rama FALSE               |
|-------------------|----------------------------------------------|----------------------------------|--------------------------|
| **If**            | `fn_select_pedido_reutilizable` devuelve `id > 0` | Usar pedido existente → Merge  | Crear pedido nuevo → Merge |
| **Agente Validador** | `accion === 'consultar'`               | Retorna sin validar ítems        | Ejecuta scoring de menú  |
| **Agente Validador** | Ítem es categoría ambigua (ej: "pizza") | Marca `necesita_aclaracion = true` | Continúa con scoring  |
| **Agente Validador** | Score del mejor candidato < 25          | `no_existe` → item problemático  | Resuelve ítem            |
| **Agente Validador** | Producto tiene variantes y el cliente no especificó | Pide aclaración de variante | Usa variante preferida |
| **Agente Validador** | Dos candidatos con score similar (diferencia ≤ 8) | Marca `ambiguo` → pide confirmación | Usa el mejor    |
| **Ejecutar Acción** | `items_validados.length === 0`          | `mutar_db = false`, devuelve error | Aplica acción sobre items |
| **Actualizar Pedido en DB** | `mutar_db === true`           | Ejecuta UPDATE                   | Devuelve pedido sin cambios |

---

## Subflujos que llama
Ninguno. Este workflow **es** un subflujo; es invocado desde el Director central y no delega a otros workflows.

---

## Mensajes al cliente

El nodo `Generar Respuesta Final` construye el campo `respuesta_agente` (string) que el workflow retorna al Director. No envía a Chatwoot/WhatsApp directamente.

Patrones de mensaje generados:

| Situación                          | Ejemplo de mensaje                                                                                     |
|------------------------------------|--------------------------------------------------------------------------------------------------------|
| Consultar pedido con ítems         | `Tu pedido #A1 lleva 2x Pizza Barbacoa (€18,00). Retiro en el local. Pago: efectivo.`                 |
| Consultar pedido vacío             | `Tu pedido #A1 está vacío por ahora.`                                                                  |
| Agregar ítem exitoso               | `Listo, tu pedido #A1 ahora lleva 1x Pizza Barbacoa, 1x Coca-Cola. Subtotal: €13,50.`                 |
| Quitar ítem exitoso                | `Listo, actualicé tu pedido #A1 ahora lleva ...`                                                       |
| Ítem no encontrado                 | `No encontré "milanesa" en el menú.`                                                                   |
| Categoría ambigua                  | `Qué pizza quieres? Puedo ofrecerte Lanzarote, Barbacoa, ...`                                          |
| Variante requerida                 | `Para Coca-Cola necesito el tamaño o variante. Opciones: Lata, Botella 500ml, Botella 1.5L.`          |
| Producto ambiguo entre dos         | `Quiero confirmar "barbacoa". ¿Te refieres a Pizza Barbacoa o Pizza Barbacoa Pollo?`                   |
| Extras opcionales disponibles      | `Para Pizza Barbacoa puedes agregar extras: Queso extra (1,50€). ¿Quieres añadir alguno?`             |

---

## Side effects sobre el pedido

| Acción                   | Tabla afectada | Operación   | Condición                      |
|--------------------------|----------------|-------------|--------------------------------|
| Crear pedido             | `pedidos`      | INSERT      | Cuando no existe pedido reutilizable |
| Actualizar ítems/totales | `pedidos`      | UPDATE      | Cuando `mutar_db = true`       |
| Revertir estado a en_curso | `pedidos`   | UPDATE      | Si el pedido estaba confirmado/pagado y se modifica |
| Asignar usuario_id       | `pedidos`      | UPDATE      | Si el pedido no tenía usuario_id y se puede resolver |

El workflow **no** modifica `tipo_despacho`, `direccion`, `metodo_pago` ni `costo_envio` — esos campos son gestionados por otros subflujos (Despacho, Pago).

---

## Riesgos si se agrega multi-tenant

### 1. `restaurante_id = 1` hardcodeado en INSERT
**Nodo**: `Crear Pedido Nuevo`  
Todos los pedidos nuevos se crean para el restaurante 1. En un entorno multi-tenant esto asignaría pedidos de otros locales al tenant equivocado.

### 2. `fn_menu_lookup(NULL)` sin filtro de restaurante
**Nodo**: `consultar_menu`  
La función recibe `NULL` como `restaurant_id`. El validador de ítems (`Agente Validador`) compara contra el catálogo completo de todos los restaurantes. Un cliente de "Local B" podría pedir ítems del menú de "Local A".

### 3. UPDATE sin filtro de `restaurante_id`
**Nodo**: `Actualizar Pedido en DB`  
`WHERE p.id = :pedido_id` no incluye `AND p.restaurante_id = :restaurante_id`. Si el `pedido_id` es predecible o se filtra incorrectamente, podría mutarse un pedido de otro tenant.

### 4. `fn_select_pedido_reutilizable` sin `restaurant_id`
**Nodo**: `Buscar Pedido Activo`  
La firma de la función no incluye `restaurant_id`. Un mismo teléfono con pedidos en múltiples restaurantes podría recibir el pedido del restaurante incorrecto como "reutilizable".

### 5. Subquery de `usuarios` sin `restaurante_id`
**Nodo**: `Crear Pedido Nuevo` (línea `SELECT id FROM usuarios WHERE telefono = :telefono`)  
Si la tabla `usuarios` es compartida entre tenants, `LIMIT 1` podría retornar el `usuario_id` de otro tenant.

---

*Auditado el 2026-04-20. Solo mapeo de lo existente — sin propuesta de cambios.*
