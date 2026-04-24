---
workflow: [MVP] Despacho
archivo_fuente: docs/n8n/[MVP] Despacho.json
fecha_auditoria: 2026-04-20
estado: solo lectura — no se proponen cambios
---

## Propósito

Determinar y persistir el tipo de despacho de un pedido activo (retiro o delivery), validar zona y mínimo de delivery, actualizar la tabla `pedidos` y retornar una respuesta estructurada al workflow llamador.

---

## Trigger y entradas

**Tipo de trigger:** `executeWorkflowTrigger` — es invocado por otro workflow (no tiene trigger HTTP ni webhook propio).

**Campos de entrada esperados:**

| Campo            | Tipo     | Descripción                                      |
|------------------|----------|--------------------------------------------------|
| `tipo`           | string   | Tipo de despacho declarado por el cliente        |
| `direccion_texto`| string   | Dirección en texto libre (delivery)              |
| `codigo_postal`  | string   | Código postal (delivery)                         |
| `lat`            | number   | Latitud GPS (opcional, puede ser null)           |
| `lng`            | number   | Longitud GPS (opcional, puede ser null)          |
| `telefono`       | string   | Teléfono del cliente (ej: +56912345678)          |
| `session_id`     | string   | Identificador de sesión activa                   |
| `pedido_id`      | number   | ID del pedido sobre el que se opera             |

---

## Queries SQL embebidas

### 1. `Obtener Pedido Activo`
```sql
SELECT * FROM public.fn_select_pedido_reutilizable(
  :telefono,
  :session_id,
  :pedido_id,
  false
)
```
- **Tabla:** función `fn_select_pedido_reutilizable` (encapsula lógica sobre `pedidos`)
- **Operación:** SELECT
- **Observación:** la función recibe `pedido_id` como string escapado; no se conoce su definición interna desde este workflow

---

### 2. `Consultar Zona Delivery`
```sql
SELECT delivery_zone_id, zone_name, fee, min_order_amount,
       estimated_minutes_min, estimated_minutes_max, is_active
FROM public.delivery_zone
WHERE is_active = true
  AND (postal_code = :codigo_postal_extraido
       OR lower(zone_name) = lower(:zona_inferida))
LIMIT 1
```
- **Tabla:** `delivery_zone`
- **Operación:** SELECT
- **Observación:** extrae código postal con regex `\b\d{5}\b` desde `codigo_postal` o `direccion_texto`; infiere zona por palabras clave hardcodeadas (`arrecife`, `playa honda`, `taiche`). **Sin filtro `restaurant_id`.**

---

### 3. `Actualizar Pedido Delivery` (rama delivery, mínimo alcanzado)
```sql
UPDATE pedidos
SET
  tipo_despacho = 'delivery',
  direccion     = :direccion,
  lat           = :lat,
  lng           = :lng,
  costo_envio   = :fee,
  total         = :total,
  tiempo_estimado = COALESCE(
    NULLIF((SELECT trim(config_value) FROM public.restaurante_config WHERE config_key = 'delivery_eta_text' LIMIT 1), ''),
    (COALESCE(...'delivery_eta_min_minutes'...) || '-' || COALESCE(...'delivery_eta_max_minutes'...) || ' min')
  ),
  updated_at = NOW()
WHERE id = :pedido_id
RETURNING *
```
- **Tablas:** `pedidos`, `restaurante_config` (subquery)
- **Operación:** UPDATE + SELECT (subquery)
- **Observación:** `restaurante_config` se consulta con `LIMIT 1` **sin filtro `restaurant_id`**.

---

### 4. `Actualizar Pedido Retiro`
```sql
UPDATE pedidos
SET
  tipo_despacho   = 'retiro',
  direccion       = NULL,
  lat             = NULL,
  lng             = NULL,
  costo_envio     = 0,
  total           = subtotal,
  tiempo_estimado = COALESCE(
    NULLIF((SELECT trim(config_value) FROM public.restaurante_config WHERE config_key = 'pickup_eta_text' LIMIT 1), ''),
    (COALESCE(...'pickup_eta_minutes'...) || ' min')
  ),
  updated_at = NOW()
WHERE id = :pedido_id
RETURNING *
```
- **Tablas:** `pedidos`, `restaurante_config` (subquery)
- **Operación:** UPDATE + SELECT (subquery)
- **Observación:** misma dependencia de `restaurante_config` sin `restaurant_id`.

---

### 5. `Guardar Direccion Frecuente`
```sql
UPDATE public.usuarios
SET direccion_frecuente = :direccion_texto,
    updated_at = NOW()
WHERE telefono = :telefono
  AND lower(:tipo) IN ('delivery','domicilio')
RETURNING id, telefono, nombre, direccion_frecuente
```
- **Tabla:** `usuarios`
- **Operación:** UPDATE
- **Observación:** se ejecuta en paralelo con `Respuesta Delivery OK` (rama mínimo OK). **Sin filtro `restaurant_id`.**

---

### 6. `Persistir Delivery Pendiente` (rama mínimo no alcanzado)
```sql
UPDATE pedidos
SET
  tipo_despacho = 'delivery',
  direccion     = :direccion,
  lat           = :lat,
  lng           = :lng,
  costo_envio   = :fee,
  total         = :total,
  tiempo_estimado = COALESCE(...restaurante_config...),
  updated_at = NOW()
WHERE id = :pedido_id
RETURNING *
```
- **Tablas:** `pedidos`, `restaurante_config` (subquery)
- **Operación:** UPDATE + SELECT (subquery)
- **Observación:** idéntica estructura al nodo `Actualizar Pedido Delivery`, pero el pedido no avanza al flujo de Pago.

---

### 7. `Guardar Direccion Frecuente Pendiente`
- Idéntica query al nodo `Guardar Direccion Frecuente`.
- Se ejecuta en paralelo con `Respuesta Mínimo Delivery`.

---

## Lógica condicional crítica

| Nodo                       | Condición evaluada                                                                                      | Rama TRUE                          | Rama FALSE                         |
|----------------------------|---------------------------------------------------------------------------------------------------------|------------------------------------|------------------------------------|
| `¿Es Retiro?`              | `tipo` pertenece a `['retiro','retirar','recoger','local','para llevar','pickup']` (case-insensitive)   | Flujo retiro                       | Flujo delivery                     |
| `¿Zona Encontrada?`        | `delivery_zone_id` no está vacío                                                                        | Validar mínimo y calcular total    | Respuesta fuera de cobertura       |
| `¿Puede Continuar?`        | `puede_continuar === true` (subtotal >= minimo)                                                         | Actualizar pedido delivery         | Persistir delivery pendiente       |

**Detalle de `Validar Mínimo y Calcular Total` (nodo Code):**
- Calcula `subtotal`, `fee`, `total = subtotal + fee`.
- Si `subtotal < minimo`: `puede_continuar = false`, `motivo = 'minimo_no_alcanzado'`.
- Si `subtotal >= minimo`: `puede_continuar = true`.
- Los valores monetarios se formatean como `€X,XX`.

---

## Subflujos que llama

Este workflow **no llama a ningún otro workflow**. Es un subflujo terminal: recibe entrada, procesa y retorna resultado estructurado al llamador vía `Merge Respuesta Final`.

---

## Mensajes al cliente

Los mensajes se generan en nodos Code y se exponen en el campo `respuesta_agente` del output. El workflow llamador es responsable de enviarlos al cliente.

### Retiro (éxito)
```
Perfecto, tu pedido {pedido_codigo} será para retiro en el local.
Tiempo estimado: {tiempo_estimado}.
El subtotal es €{subtotal}. ¿Cómo quieres pagar?
```

### Delivery OK (éxito)
```
Perfecto, mantengo delivery a {direccion}.
El envío tiene un costo de €{fee} y el tiempo estimado es {tiempo}.
El total con despacho es €{total}. ¿Cómo quieres pagar?
```

### Fuera de cobertura (fallo)
```
Lo siento, por ahora no llegamos a esa dirección [o al código postal {codigo_postal}].
¿Te gustaría pasar a retiro en el local?
```

### Mínimo no alcanzado (bloqueo parcial)
```
Mantengo delivery a {direccion}.
Tu pedido va en €{subtotal} y el mínimo para esa zona es €{minimo}.
Si llegas al mínimo, el total estimado con envío será €{total_estimado}
y el tiempo estimado será {tiempo}.
¿Quieres agregar algo más o prefieres pasar a retiro?
```

---

## Side effects sobre el pedido

| Acción                                | Tabla      | Condición de ejecución                          |
|---------------------------------------|------------|-------------------------------------------------|
| UPDATE tipo_despacho, direccion, fee, total, tiempo_estimado | `pedidos` | Siempre que el flujo no termine en fuera de cobertura |
| UPDATE direccion_frecuente            | `usuarios` | Solo si `tipo` es delivery/domicilio            |

**Estados resultantes del pedido:**

- **Retiro confirmado:** `tipo_despacho = 'retiro'`, `costo_envio = 0`, `total = subtotal`, `direccion = NULL`.
- **Delivery confirmado:** `tipo_despacho = 'delivery'`, `costo_envio = fee`, `total = subtotal + fee`, `tiempo_estimado` desde config o zona.
- **Delivery pendiente mínimo:** mismos campos delivery actualizados, pero `success = false` — el pedido **no avanza a Pago**.
- **Fuera de cobertura:** el pedido **no se modifica**.

---

## Riesgos si se agrega multi-tenant

### 1. `delivery_zone` — sin `restaurant_id`
```sql
-- Query actual
WHERE is_active = true AND (postal_code = '...' OR lower(zone_name) = lower('...'))
-- Riesgo: devuelve la primera zona activa de CUALQUIER restaurante
```
Con multi-tenant, un pedido de restaurante A podría resolverse con la zona de restaurante B si comparten códigos postales o nombres de zona.

### 2. `restaurante_config` — LIMIT 1 sin `restaurant_id`
```sql
SELECT trim(config_value) FROM public.restaurante_config
WHERE config_key = 'delivery_eta_text' LIMIT 1
```
Aparece como subquery incrustada en los tres UPDATE de `pedidos`. Con múltiples tenants, el ETA aplicado al pedido dependería del orden de inserción en la tabla, no del restaurante correcto.

### 3. `usuarios` — sin `restaurant_id`
```sql
UPDATE public.usuarios SET direccion_frecuente = '...'
WHERE telefono = '...'
```
Si un mismo número de teléfono pertenece a clientes de distintos restaurantes (registros separados), el UPDATE afectaría a todos los registros que coincidan con ese teléfono.

### 4. `fn_select_pedido_reutilizable` — lógica interna desconocida
La función recibe `telefono`, `session_id` y `pedido_id`. Si internamente no filtra por `restaurant_id`, podría recuperar un pedido de otro restaurante que coincida en teléfono o sesión.

### 5. `UPDATE pedidos WHERE id = :pedido_id` — sin validación de tenant
Los tres nodos de UPDATE sobre `pedidos` solo filtran por `id`. Si un `pedido_id` malformado o reutilizado apunta a un pedido de otro restaurante, se actualizaría sin restricción.

### Resumen de tabla de riesgos

| Query / Nodo                        | Tabla             | ¿Tiene restaurant_id? | Riesgo multi-tenant |
|-------------------------------------|-------------------|-----------------------|---------------------|
| Consultar Zona Delivery             | `delivery_zone`   | No                    | Alto — zona incorrecta |
| Actualizar Pedido Delivery (subq.)  | `restaurante_config` | No                 | Alto — ETA incorrecto |
| Actualizar Pedido Retiro (subq.)    | `restaurante_config` | No                 | Alto — ETA incorrecto |
| Persistir Delivery Pendiente (subq.)| `restaurante_config` | No                 | Alto — ETA incorrecto |
| Guardar Direccion Frecuente         | `usuarios`        | No                    | Medio — UPDATE cruzado |
| Obtener Pedido Activo               | `fn_select_pedido_reutilizable` | Desconocido | Pendiente de auditar la función |
| UPDATE pedidos (3 nodos)            | `pedidos`         | No (solo por id)      | Bajo si id es único global; medio si no |
