# Revisión de Regresión — Diseño EasyOrder MVP (RESUELTA)
**Fecha:** 2026-04-21  
**Estado:** LISTA PARA IMPLEMENTACIÓN — todos los bloqueantes resueltos  
**Revisado con:** DDL + DML fuente de verdad + reglas de negocio

---

## Índice de resoluciones

| ID | Tipo | Título | Estado |
|---|---|---|---|
| B-1 | Bloqueante | Método `online` ausente en endpoint 4 | RESUELTO |
| B-2 | Bloqueante | No existe endpoint para zona de delivery | RESUELTO |
| B-3 | Bloqueante | `metodo_pago` no validado contra métodos del restaurante | RESUELTO |
| RC-1 | Riesgo crítico | Cambio de firmas SQL rompe flujo WhatsApp | RESUELTO |
| RC-2 | Riesgo crítico | UNIQUE(telefono) + Fases 5/6 desacopladas | RESUELTO |
| RC-3 | Riesgo crítico | PK en `contexto` puede fallar con duplicados | RESUELTO |
| RC-4 | Riesgo crítico | Pedido web vs pedido WhatsApp activo | RESUELTO |
| RN-1 | Regla negocio | Estado `pagado` ausente del dashboard | RESUELTO |
| RN-2 | Regla negocio | Turnos que cruzan medianoche en `is_open` | RESUELTO |
| RN-3 | Regla negocio | Discrepancia keys `tiempo_estimado` | RESUELTO |
| CB-1 | Caso borde | Double-submit del checkout | RESUELTO |
| CB-2 | Caso borde | Zona de delivery desde dirección libre | RESUELTO (unificado con B-2) |
| CB-3 | Caso borde | Customer lookup expone PII sin auth | RESUELTO |
| CB-4 | Caso borde | Local cierra entre pasos del checkout | RESUELTO |
| CB-5 | Caso borde | Extras de otro tenant en POST /orders | RESUELTO |
| CB-6 | Caso borde | Timezone en `pedido_codigo` | RESUELTO |
| NF-1 | **Nuevo hallazgo** | Doble trigger en `pedidos` anula advisory lock | **CRÍTICO — RESUELTO** |
| NF-2 | **Nuevo hallazgo** | `delivery_zone` UNIQUE solo en `postal_code` | **CRÍTICO — RESUELTO** |
| NF-3 | **Nuevo hallazgo** | `datos_bancarios` es NULL en el tenant activo | RESUELTO |
| NF-4 | **Nuevo hallazgo** | Conflicto de timezone en `restaurante_config` | RESUELTO |
| NF-5 | **Nuevo hallazgo** | Columna `payment_methods` no existe en el esquema | RESUELTO |

---

## Bloqueantes duros — RESUELTOS

### B-1 — Método de pago `online` ausente ✅

**Problema original:** El enum de `metodo_pago` en el contrato del endpoint `POST /public/:slug/orders` omitía `online`, violando la regla de negocio 6.

**Resolución:**  
- `online` se agrega al enum de valores válidos de `metodo_pago`.
- El estado inicial para `online` es **`pendiente_pago`** — igual que `transferencia`. El pago no es inmediato y requiere confirmación del operador.
- El contrato actualizado acepta: `"efectivo"`, `"tarjeta"`, `"transferencia"`, `"bizum"`, `"online"`.
- Lógica de estado en el endpoint:

```
metodo_pago IN ('transferencia', 'online') → estado = 'pendiente_pago'
metodo_pago IN ('efectivo', 'tarjeta', 'bizum') → estado = 'confirmado'
```

---

### B-2 — Flujo de zona de delivery: rediseño del paso de despacho ✅

**Problema original:** El checkout describe "dirección de texto libre" pero el sistema requiere `zona_id` (FK a `delivery_zone`). No existía endpoint público para resolver zona por dirección.

**Resolución — Cambio de UX en paso de despacho:**  
En lugar de validar texto libre contra zonas, el flujo usa **selección explícita de zona** más **campo de dirección exacta**:

**Paso de despacho actualizado para Delivery:**
1. El frontend llama a `GET /public/:slug/delivery/zones` (nuevo endpoint público, ver abajo).
2. Muestra un **selector de zona** (dropdown o cards) con las zonas activas del restaurante: nombre de zona, costo de envío, mínimo de pedido.
3. El cliente selecciona su zona (esto da `zona_id`).
4. Se muestra el campo "Dirección exacta" (texto libre, para el detalle de la entrega).
5. Si el cliente tiene `direccion_frecuente` guardada, se pre-carga en el campo de dirección exacta.

**Nuevo endpoint público añadido al inventario:**

```
GET /public/:slug/delivery/zones
```

**Auth:** Ninguna  
**Response 200:**
```json
{
  "zones": [
    {
      "delivery_zone_id": 1,
      "zone_name": "ARRECIFE",
      "fee": 2.50,
      "min_order_amount": 20.00,
      "is_active": true
    },
    {
      "delivery_zone_id": 2,
      "zone_name": "PLAYA HONDA",
      "fee": 1.30,
      "min_order_amount": 20.00,
      "is_active": true
    }
  ]
}
```

**Query:** `SELECT delivery_zone_id, zone_name, fee, min_order_amount FROM delivery_zone WHERE restaurante_id = $restaurante_id AND is_active = true ORDER BY zone_name ASC`

**Nota:** `postal_code` NO se expone en la respuesta pública — es un dato de configuración interna del operador, no relevante para el cliente.

**Impacto en el contrato de `POST /public/:slug/orders`:**  
El body ya incluía `zona_id`. Con este rediseño, el cliente siempre envía `zona_id` (campo requerido para delivery). La dirección exacta va en `direccion` (texto libre). Sin cambios en la estructura del body.

---

### B-3 — Validar `metodo_pago` contra métodos activos del restaurante ✅

**Problema original:** El campo `payment_methods` no existe en la tabla `restaurante`. El contrato no validaba el método contra la configuración del local.

**Resolución (ver también NF-5):**  
Se agrega la columna `payment_methods` a `restaurante` como JSONB. El endpoint `POST /public/:slug/orders` valida que `metodo_pago` esté dentro del array de métodos habilitados del local.

**Migración:**
```sql
ALTER TABLE public.restaurante 
ADD COLUMN payment_methods JSONB DEFAULT '["efectivo","transferencia","tarjeta","bizum","online"]'::jsonb;

UPDATE public.restaurante 
SET payment_methods = '["efectivo","transferencia"]'::jsonb 
WHERE id = 1;
```

**Lógica en el endpoint:**
```
restaurante = resolver slug
si metodo_pago NOT IN restaurante.payment_methods → 422 con reason: "payment_method_not_accepted"
```

**Endpoint `GET /public/:slug/restaurant`** incluye `payment_methods` en la respuesta para que el frontend muestre solo los métodos habilitados (ya definido en doc 09).

---

## Riesgos críticos — RESUELTOS

### RC-1 — Cambio de firmas SQL y flujo WhatsApp ✅

**Problema original:** Cambiar firmas de 8 funciones SQL antes de actualizar n8n rompe el flujo WhatsApp silenciosamente.

**Resolución — Protocolo de renombrado con gate de corte:**

**Regla:** Toda función modificada se crea como `{nombre}_v2`. La función original permanece activa. El renombrado a nombre definitivo ocurre **solo** después de que el workflow n8n correspondiente haya sido actualizado, desplegado y validado en un test funcional de flujo completo.

**Gate de corte definido:**
Para cada función, el paso de renombrado queda habilitado cuando:
1. El nodo n8n que llama a la función ha sido actualizado en el JSON del workflow.
2. Se ejecutó una prueba de flujo completo (WhatsApp → Apertura → Despacho → Pago) sin errores.
3. El log de n8n no muestra errores de "function does not exist" en las últimas 24 horas.

**Funciones de mayor riesgo y su criticidad:**

| Función | Workflow(s) afectados | Criticidad |
|---|---|---|
| `fn_select_pedido_reutilizable` | Apertura, Despacho, Pago | MÁXIMA — rompe todo el flujo |
| `fn_next_pedido_numero` | Apertura | ALTA — sin código de pedido |
| `fn_upsert_usuario_perfil` | Apertura | ALTA — sin usuario creado |
| `fn_menu_lookup` | Preguntas, Apertura | MEDIA — menú no disponible |
| `fn_listar_pedidos_modificables` | Pedidos Cliente | MEDIA |
| `fn_resolver_pedido_referencia` | Pedidos Cliente | MEDIA |
| `fn_menu_catalog` | Apertura | MEDIA |
| `fn_get_rest_config_int` | Múltiples | BAJA — tiene default fallback |

---

### RC-2 — Fases 5 y 6 deben ejecutarse juntas ✅

**Problema original:** Cambiar `UNIQUE(telefono)` a `UNIQUE(telefono, restaurante_id)` sin actualizar `fn_upsert_usuario_perfil` simultáneamente rompe el ON CONFLICT de la función.

**Resolución:**  
Fases 5 y 6 se fusionan en una única **ventana de mantenimiento atómica**. El orden exacto dentro de la ventana:

1. Preflight: verificar duplicados en `usuarios` y `contexto` (queries abajo).
2. Aplicar Fase 5 (constraints): `UNIQUE(telefono, restaurante_id)` en `usuarios`, PK en `contexto`.
3. Aplicar Fase 6 (funciones): crear `fn_upsert_usuario_perfil_v2` con `p_restaurante_id`.
4. Aplicar cambios en n8n que usan `fn_upsert_usuario_perfil`.
5. Validar flujo completo.
6. Renombrar funciones `_v2` → nombre definitivo.

**Queries de preflight obligatorias:**
```sql
-- Verificar duplicados en usuarios antes de cambiar UNIQUE
SELECT telefono, COUNT(*) 
FROM public.usuarios 
GROUP BY telefono 
HAVING COUNT(*) > 1;

-- Verificar duplicados en contexto antes de agregar PK
SELECT telefono, restaurante_id, COUNT(*) 
FROM public.contexto 
GROUP BY telefono, restaurante_id 
HAVING COUNT(*) > 1;
```
Si alguna query devuelve filas, se deben consolidar manualmente antes de continuar.

---

### RC-3 — Duplicados en `contexto` ✅

**Resolución:** Incluida en RC-2. La query de preflight detecta el problema antes de intentar agregar la PK. Si hay duplicados: mantener la fila con el `timestamp` más reciente y eliminar las demás.

```sql
DELETE FROM public.contexto c
WHERE ctid NOT IN (
  SELECT DISTINCT ON (telefono, restaurante_id) ctid
  FROM public.contexto
  ORDER BY telefono, restaurante_id, "timestamp" DESC
);
```

---

### RC-4 — Pedido web vs pedido WhatsApp activo ✅

**Problema original:** Si el mismo teléfono tiene un pedido `en_curso` en WhatsApp y crea uno nuevo por web, el bot podría seguir trabajando sobre el WhatsApp ignorando el web confirmado.

**Resolución — Decisión de diseño:**  
Los dos canales son intencionalmente independientes en MVP. No se bloquean mutuamente.

**Fundamento:** 
- Los pedidos web se crean directamente en estado `confirmado` o `pendiente_pago`, nunca en `en_curso`.
- `fn_select_pedido_reutilizable` prioriza pedidos `en_curso` (score 0 en el ORDER BY). Un pedido web `confirmado` tiene menor prioridad.
- El bot de WhatsApp continuará sobre el pedido `en_curso` del canal WhatsApp. El pedido web ya está confirmado y visible en el dashboard del operador.

**Situación controlada, no un bug:** El operador ve ambos pedidos en el dashboard. El cliente tiene dos pedidos distintos con códigos distintos. No hay corrupción de datos.

**Documentado para el operador:** El dashboard mostrará los pedidos web (`canal: 'web'`) diferenciados de los pedidos WhatsApp. Para esto, agregar columna `canal` a `pedidos`:

```sql
ALTER TABLE public.pedidos 
ADD COLUMN canal VARCHAR(20) DEFAULT 'whatsapp' NOT NULL;
```

Los pedidos creados por `POST /public/:slug/orders` se insertan con `canal = 'web'`.

---

## Reglas de negocio — RESUELTAS

### RN-1 — Estado `pagado` en el modelo de transiciones ✅

**Problema original:** Las reglas de negocio incluyen `pagado/paid` como estado observable, pero el contrato del endpoint 7 no lo contempla.

**Hallazgo del DDL:** Las funciones `fn_select_pedido_reutilizable` y `fn_resolver_pedido_referencia` ya manejan `pagado` y `paid` como estados válidos dentro de la ventana de modificación. Es un estado real del sistema.

**Resolución — Tabla de transiciones actualizada:**

| Estado actual | Transiciones permitidas desde dashboard | Quién lo usa |
|---|---|---|
| `en_curso` | `confirmado`, `cancelado` | Bot WhatsApp solamente |
| `pendiente_pago` | `pagado`, `confirmado`, `cancelado` | Bot WhatsApp + Dashboard |
| `confirmado` | `en_preparacion`, `cancelado` | Dashboard |
| `pagado` | `en_preparacion`, `cancelado` | Dashboard |
| `en_preparacion` | `listo`, `cancelado` | Dashboard |
| `listo` | `en_camino` (si delivery), `entregado` (si retiro), `cancelado` | Dashboard |
| `en_camino` | `entregado`, `cancelado` | Dashboard |
| `entregado` | — (terminal) | Dashboard |
| `cancelado` | — (terminal) | Dashboard |

**Nota:** `pagado` es el estado que asigna el bot WhatsApp cuando el cliente confirma la transferencia en el subflujo Pago. El dashboard permite que el operador lo mueva manualmente a `confirmado` (si quiere saltarse el paso `pagado`) o a `en_preparacion` directamente.

**La columna `estado` en `pedidos` no tiene CHECK constraint** (es `text NULL`), por lo que no requiere migración de enum para agregar `pagado`. Ya existe en el sistema.

---

### RN-2 — Turnos que cruzan medianoche ✅

**Problema original:** La lógica `hora >= apertura AND hora <= cierre` falla cuando `cierre < apertura` (ej: abre 22:00, cierra 02:00).

**Hallazgo del DML:** Los horarios actuales de La Isla Pizzería cierran a las 23:00/23:30/22:00. No hay turnos que crucen medianoche en los datos actuales. Sin embargo, la regla de negocio 9 lo exige.

**Resolución — Especificación exacta del algoritmo `is_open`:**

```
función calcular_is_open(hora_local, horario):
  si not horario.disponible → retorna false
  
  turno_activo = false
  
  si horario.apertura_1 y horario.cierre_1:
    si horario.cierre_1 >= horario.apertura_1:
      # Turno normal (ej: 12:00-15:30)
      turno_activo = (hora_local >= apertura_1 AND hora_local < cierre_1)
    sino:
      # Turno que cruza medianoche (ej: 22:00-02:00)
      turno_activo = (hora_local >= apertura_1 OR hora_local < cierre_1)
  
  si no turno_activo y horario.apertura_2 y horario.cierre_2:
    si horario.cierre_2 >= horario.apertura_2:
      # Turno normal
      turno_activo = (hora_local >= apertura_2 AND hora_local < cierre_2)
    sino:
      # Turno que cruza medianoche
      turno_activo = (hora_local >= apertura_2 OR hora_local < cierre_2)
  
  retorna turno_activo
```

**Implementación en PostgreSQL (reutilizable en API y en n8n):**
```sql
CREATE OR REPLACE FUNCTION public.fn_is_in_shift(
  p_hora time,
  p_apertura time,
  p_cierre time
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_apertura IS NULL OR p_cierre IS NULL THEN false
    WHEN p_cierre >= p_apertura THEN p_hora >= p_apertura AND p_hora < p_cierre
    ELSE p_hora >= p_apertura OR p_hora < p_cierre
  END
$$;
```

Esta función se usa tanto en el API REST como puede referenciarse desde n8n si se necesita consistencia.

---

### RN-3 — Discrepancia de keys en `restaurante_config` ✅

**Problema original:** El plan de migración mencionaba `delivery_eta_text` como key existente en n8n, pero el contrato usaba `delivery_eta_min_minutes` y `delivery_eta_max_minutes`.

**Resolución — Confirmado por DML (fuente de verdad):**

Las keys que realmente existen en `restaurante_config` para el tenant activo (id=1):

| `config_key` | `config_value` | Significado |
|---|---|---|
| `pickup_eta_minutes` | `20` | Minutos estimados para retiro |
| `delivery_eta_min_minutes` | `30` | Mínimo estimado delivery |
| `delivery_eta_max_minutes` | `45` | Máximo estimado delivery |
| `cart_expiry_minutes` | `60` | Expiración del carrito |
| `modify_window_minutes` | `10` | Ventana de modificación post-confirmación |

**El contrato del endpoint 4 es CORRECTO.** Las keys `delivery_eta_min_minutes` y `delivery_eta_max_minutes` existen. La referencia a `delivery_eta_text` en el plan de migración era de un nodo n8n anterior que ya no aplica.

**Lógica de `tiempo_estimado` para el endpoint 4 (definitiva):**
```
Para delivery:
  si delivery_zone.estimated_minutes_min IS NOT NULL:
    tiempo_estimado = "{min}-{max} min" usando los valores de la zona
  sino:
    min = restaurante_config['delivery_eta_min_minutes'] (default: 30)
    max = restaurante_config['delivery_eta_max_minutes'] (default: 45)
    tiempo_estimado = "{min}-{max} min"

Para retiro:
  minutos = restaurante_config['pickup_eta_minutes'] (default: 20)
  tiempo_estimado = "{minutos} min"
```

---

## Casos borde — RESUELTOS

### CB-1 — Double-submit del checkout ✅

**Resolución:**  
El frontend implementa **deshabilitación del botón** tras el primer click (standard UX). El backend implementa **deduplicación por ventana de tiempo**:

Al recibir `POST /public/:slug/orders`, antes de insertar, verificar:
```sql
SELECT id FROM pedidos 
WHERE telefono = $telefono 
  AND restaurante_id = $restaurante_id 
  AND estado NOT IN ('cancelado')
  AND created_at >= NOW() - INTERVAL '30 seconds'
LIMIT 1;
```
Si existe un pedido creado en los últimos 30 segundos para el mismo teléfono en el mismo restaurante, retornar `409 Conflict` con el `pedido_codigo` del pedido existente. El frontend lo trata como éxito y redirige al tracking.

Esta ventana de 30 segundos es suficiente para cubrir el double-click sin bloquear pedidos legítimos consecutivos.

---

### CB-3 — Customer lookup expone PII ✅

**Resolución — Dos capas de protección:**

1. **Rate limiting en la capa API:** Máximo 5 requests por IP por minuto para `GET /public/:slug/customer/lookup`. Responder `429 Too Many Requests` si se excede.

2. **Respuesta limitada:** El endpoint NO devuelve nombre completo ni dirección. Devuelve solo:
```json
{
  "found": true,
  "nombre": "Carlos",
  "direccion_frecuente": "Calle Mayor 12, Arrecife"
}
```

El nombre puede ser un primer nombre. Si no se encontró: `{"found": false}` — siempre `200`, nunca `404`, para no confirmar la existencia o no del teléfono.

3. **Alcance limitado al tenant:** La query siempre filtra por `restaurante_id` resuelto desde el slug. Un mismo teléfono en otro tenant no es visible.

---

### CB-4 — Local cierra entre pasos del checkout ✅

**Resolución:**  
El endpoint 4 re-verifica `is_open` en el momento de la inserción (ya documentado en el contrato). Si el local cerró: `422` con `reason: "local_closed"`.

**Definición de respuesta del frontend para este caso:**
```json
{
  "error": "local_closed",
  "message": "Lo sentimos, el local cerró mientras completabas tu pedido. Puedes intentarlo nuevamente cuando volvamos a abrir.",
  "horario_hoy": { ... }
}
```

El frontend muestra este mensaje con el horario del día (incluido en la respuesta de error) para que el cliente sepa cuándo puede volver.

---

### CB-5 — Extras de otro tenant en POST /orders ✅

**Resolución:**  
El endpoint 4 valida cada `menu_variant_id` y cada `extra_id` contra el tenant del slug antes de insertar. La validación usa una query única:

```sql
-- Validar variantes
SELECT menu_variant_id 
FROM menu_variant mv
JOIN menu_item mi ON mi.menu_item_id = mv.menu_item_id
WHERE mv.menu_variant_id = ANY($variant_ids)
  AND mi.restaurante_id = $restaurante_id
  AND mv.is_active = true;

-- Si el COUNT de la query != cantidad de variant_ids enviados → 422 "invalid_items"

-- Validar extras
SELECT extra_id 
FROM extra 
WHERE extra_id = ANY($extra_ids)
  AND restaurante_id = $restaurante_id
  AND is_active = true;
```

El endpoint 4 NO confía en el resultado del endpoint 3 (validate). La validación se repite de forma independiente.

---

### CB-6 — Timezone en `pedido_codigo` ✅

**Resolución — Confirmado correcto por DDL:**

La función `fn_set_pedido_codigo` usa `'Atlantic/Canary'` hardcodeado:
```sql
v_prefix := to_char((COALESCE(NEW.created_at, NOW()) AT TIME ZONE 'Atlantic/Canary')::date, 'YYMMDD');
```

Esto es consistente con `restaurante.zona_horaria = 'Atlantic/Canary'`. El prefijo de fecha se calcula en la zona horaria local del restaurante. **No requiere cambio.**

En MVP con un único tenant en `Atlantic/Canary`, el hardcoding es aceptable. En multi-tenant con diferentes zonas horarias, se deberá parametrizar la función, pero eso es post-MVP.

---

## Nuevos hallazgos del DDL — CRÍTICOS

### NF-1 — Doble trigger en `pedidos` anula el advisory lock ✅ CRÍTICO

**Hallazgo:** El DDL define DOS triggers BEFORE INSERT sobre `pedidos`:

```sql
-- Trigger 1: tg_set_pedido_codigo (llama a trg_set_pedido_codigo() - SIN lock)
create trigger tg_set_pedido_codigo before insert on public.pedidos 
  for each row execute function trg_set_pedido_codigo();

-- Trigger 2: trg_set_pedido_codigo (llama a fn_set_pedido_codigo() - CON lock)  
create trigger trg_set_pedido_codigo before insert on public.pedidos 
  for each row execute function fn_set_pedido_codigo();
```

**El problema:** PostgreSQL ejecuta triggers BEFORE en orden alfabético por nombre. `tg_` (t→g) precede a `trg_` (t→r→g) alfabéticamente. Por tanto:

1. `tg_set_pedido_codigo` dispara primero → llama `trg_set_pedido_codigo()` → asigna `pedido_codigo` via `fn_next_pedido_codigo()` **sin advisory lock**.
2. `trg_set_pedido_codigo` dispara segundo → llama `fn_set_pedido_codigo()` → ve `pedido_codigo IS NOT NULL` → **retorna sin hacer nada**.

**El advisory lock nunca se adquiere.** Bajo inserción concurrente, dos requests simultáneos pueden asignar el mismo `pedido_codigo`.

**Resolución:**
```sql
-- Eliminar el trigger sin lock (el que dispara primero y gana incorrectamente)
DROP TRIGGER tg_set_pedido_codigo ON public.pedidos;

-- Verificar que trg_set_pedido_codigo (con advisory lock) queda activo
SELECT tgname, tgfoid::regproc 
FROM pg_trigger 
WHERE tgrelid = 'public.pedidos'::regclass 
  AND tgname LIKE '%pedido_codigo%';
```

Después del DROP, solo queda `trg_set_pedido_codigo` que llama a `fn_set_pedido_codigo()` con el advisory lock correcto.

**Esta migración debe aplicarse en Fase 2 (antes de cualquier endpoint de creación de pedidos).**

---

### NF-2 — `delivery_zone` UNIQUE solo en `postal_code`, sin tenant ✅ CRÍTICO

**Hallazgo del DDL:**
```sql
CONSTRAINT delivery_zone_postal_code_key UNIQUE (postal_code)
```

En multi-tenant, dos restaurantes en la misma ciudad comparten códigos postales. Con este constraint, solo un restaurante puede registrar el código postal `35500`. El segundo tendrá error de unique violation al intentar crear su zona de delivery.

**Resolución:**
```sql
-- Eliminar constraint actual
ALTER TABLE public.delivery_zone DROP CONSTRAINT delivery_zone_postal_code_key;

-- Crear constraint multi-tenant
ALTER TABLE public.delivery_zone 
ADD CONSTRAINT delivery_zone_postal_restaurante_key UNIQUE (postal_code, restaurante_id);
```

**Esta migración va en Fase 3 del plan, junto con el resto de constraints de tenant.**

---

### NF-3 — `datos_bancarios` es NULL en el tenant activo ✅

**Hallazgo del DML:**
```sql
INSERT INTO public.restaurante (..., datos_bancarios, ...) VALUES (..., NULL, '€');
```

**Impacto:** El endpoint 5 (`GET /public/:slug/orders/:pedido_codigo`) devuelve `datos_transferencia` solo si `metodo_pago = 'transferencia'`. Con `datos_bancarios = NULL`, el campo se omite o devuelve `null` — el cliente que pagó por transferencia no ve las instrucciones bancarias.

**Resolución:**
```sql
UPDATE public.restaurante 
SET datos_bancarios = '{
  "banco": "CaixaBank",
  "titular": "La Isla S.L.",
  "iban": "ES12 3456 7890 1234 5678 90",
  "concepto": "Pedido {pedido_codigo}"
}'::jsonb
WHERE id = 1;
```

**Acción requerida antes de implementar el endpoint 5:** Confirmar con el cliente los datos bancarios reales y actualizar este registro. El campo `datos_bancarios` en la respuesta pública debe incluir el campo `concepto` formateado con el `pedido_codigo` para facilitar la reconciliación del operador.

---

### NF-4 — Conflicto de timezone entre `restaurante` y `restaurante_config` ✅

**Hallazgo del DML:**
```
restaurante.zona_horaria = 'Atlantic/Canary'
restaurante_config (config_key='timezone', config_value='America/New_York')
```

**Hay dos fuentes de timezone en conflicto.** La función `fn_set_pedido_codigo` usa `'Atlantic/Canary'` hardcodeado. La API de `is_open` debe usar `restaurante.zona_horaria`.

**Resolución — Fuente de verdad única:**  
La columna `restaurante.zona_horaria` es la fuente de verdad para timezone. La key `timezone` en `restaurante_config` es un residuo de configuración incorrecta y debe eliminarse.

```sql
-- Eliminar la key conflictiva
DELETE FROM public.restaurante_config 
WHERE config_key = 'timezone';

-- Confirmar que restaurante.zona_horaria es correcto
SELECT id, nombre, zona_horaria FROM public.restaurante;
-- Esperado: Atlantic/Canary
```

**La API de `is_open` en todos los endpoints siempre lee `restaurante.zona_horaria`, nunca `restaurante_config.timezone`.**

---

### NF-5 — Columna `payment_methods` no existe en el esquema ✅

**Hallazgo del DDL:** La tabla `restaurante` no tiene columna `payment_methods`. El documento `09_flujo_compra_reglas.md` referenciaba `businesses.payment_methods` (nombre de otra plataforma), pero la tabla real se llama `restaurante`.

**Resolución (ya incluida en B-3):**
```sql
ALTER TABLE public.restaurante 
ADD COLUMN payment_methods JSONB DEFAULT '["efectivo","transferencia","tarjeta","bizum","online"]'::jsonb;

-- Poblar el tenant activo con sus métodos reales
-- (La Isla acepta efectivo y transferencia según sus FAQs)
UPDATE public.restaurante 
SET payment_methods = '["efectivo","transferencia"]'::jsonb 
WHERE id = 1;
```

---

## Migraciones adicionales requeridas (consolidado)

Todas las migraciones pendientes incluyendo las nuevas:

| # | Migración | Fase | Prioridad |
|---|---|---|---|
| M-1 | `DROP TRIGGER tg_set_pedido_codigo` | **Nueva — Fase 2** | **CRÍTICA** |
| M-2 | Columna `slug VARCHAR(100) UNIQUE NOT NULL` en `restaurante` | Fase 1 (global) | CRÍTICA |
| M-3 | Columna `payment_methods JSONB` en `restaurante` | Fase 1 | CRÍTICA |
| M-4 | Columna `canal VARCHAR(20) DEFAULT 'whatsapp'` en `pedidos` | Fase 1 | ALTA |
| M-5 | DELETE `restaurante_config` WHERE `config_key = 'timezone'` | Fase 1 | ALTA |
| M-6 | UPDATE `restaurante.datos_bancarios` con datos reales | Fase 1 (datos) | ALTA |
| M-7 | Backfill `restaurante_id = 1` en tablas C2 | Fase 1 | ALTA |
| M-8 | Columna nullable `restaurante_id` en `n8n_chat_histories` + índice | Fase 2 | MEDIA |
| M-9 | DROP UNIQUE `delivery_zone_postal_code_key` + ADD UNIQUE `(postal_code, restaurante_id)` | Fase 3 | MEDIA |
| M-10 | NOT NULL + FK en `menu_category`, `menu_item`, `menu_variant`, `extra` | Fase 3 | MEDIA |
| M-11 | PK compuesta `(config_key, restaurante_id)` en `restaurante_config` | Fase 4 | ALTA |
| M-12 | UNIQUE `(telefono, restaurante_id)` en `usuarios` | Fase 5 | ALTA |
| M-13 | PK `(telefono, restaurante_id)` en `contexto` | Fase 5 | ALTA |

---

## Contratos de endpoints actualizados (delta)

### Endpoint `POST /public/:slug/orders` — cambios respecto a versión anterior

**Validaciones adicionales:**
1. Verificar que `metodo_pago` está en `restaurante.payment_methods`. Error: `422 payment_method_not_accepted`.
2. Verificar cada `menu_variant_id` y `extra_id` contra el tenant (validación independiente, no confiar en `/cart/validate`).
3. Verificar double-submit: si existe pedido del mismo teléfono en los últimos 30 segundos → `409` con el `pedido_codigo` existente.
4. Insertar con `canal = 'web'`.

**Estado inicial actualizado:**
```
metodo_pago IN ('transferencia', 'online') → estado = 'pendiente_pago'
metodo_pago IN ('efectivo', 'tarjeta', 'bizum') → estado = 'confirmado'
```

**Body — campo `metodo_pago` actualizado:**
Valores válidos: `"efectivo"`, `"tarjeta"`, `"transferencia"`, `"bizum"`, `"online"`

---

### Endpoint `GET /public/:slug/restaurant` — campos adicionales

Agregar en la respuesta:
```json
{
  "payment_methods": ["efectivo", "transferencia"]
}
```

---

### Endpoint `PATCH /dashboard/:slug/orders/:id/status` — tabla de transiciones actualizada

Tabla completa con `pagado`:

| Estado actual | Transiciones permitidas |
|---|---|
| `en_curso` | `confirmado`, `cancelado` |
| `pendiente_pago` | `pagado`, `confirmado`, `cancelado` |
| `confirmado` | `en_preparacion`, `cancelado` |
| `pagado` | `en_preparacion`, `cancelado` |
| `en_preparacion` | `listo`, `cancelado` |
| `listo` | `en_camino` (si delivery), `entregado` (si retiro), `cancelado` |
| `en_camino` | `entregado`, `cancelado` |
| `entregado` | — |
| `cancelado` | — |

---

### Nuevo endpoint `GET /public/:slug/delivery/zones`

**Auth:** Ninguna  
**Query:** `SELECT delivery_zone_id, zone_name, fee, min_order_amount FROM delivery_zone WHERE restaurante_id = $id AND is_active = true ORDER BY zone_name ASC`  
**Response 200:**
```json
{
  "zones": [
    { "delivery_zone_id": 1, "zone_name": "ARRECIFE", "fee": 2.50, "min_order_amount": 20.00 },
    { "delivery_zone_id": 2, "zone_name": "PLAYA HONDA", "fee": 1.30, "min_order_amount": 20.00 },
    { "delivery_zone_id": 3, "zone_name": "TAICHE", "fee": 3.60, "min_order_amount": 20.00 }
  ]
}
```
**Errores:** `404` si slug no existe.

---

## Orden de implementación — Fase 7

Las migraciones y endpoints están listos para implementar en este orden exacto:

### Bloque 0 — Migraciones críticas (sin estas, nada funciona)
```
1. DROP TRIGGER tg_set_pedido_codigo (NF-1 — CRÍTICO)
2. ALTER TABLE restaurante ADD COLUMN slug
3. UPDATE restaurante SET slug = 'la-isla' WHERE id = 1
4. ALTER TABLE restaurante ADD COLUMN payment_methods JSONB
5. UPDATE restaurante SET payment_methods = '["efectivo","transferencia"]' WHERE id = 1
6. ALTER TABLE pedidos ADD COLUMN canal VARCHAR(20) DEFAULT 'whatsapp'
7. DELETE FROM restaurante_config WHERE config_key = 'timezone'
8. UPDATE restaurante SET datos_bancarios = {...} WHERE id = 1 (datos reales)
```

### Bloque 1 — Endpoints de solo lectura (sin riesgo, sin dependencias de migración pendiente)
```
9.  GET /public/:slug/restaurant
10. GET /public/:slug/menu
11. GET /public/:slug/delivery/zones  (nuevo)
12. GET /public/:slug/hours
13. GET /dashboard/:slug/restaurant/status
14. GET /dashboard/:slug/home/metrics
15. GET /dashboard/:slug/orders
```

### Bloque 2 — Flujo público completo
```
16. GET /public/:slug/customer/lookup
17. POST /public/:slug/cart/validate
18. POST /public/:slug/orders
19. GET /public/:slug/orders/:pedido_codigo
```

### Bloque 3 — Operaciones de dashboard
```
20. PATCH /dashboard/:slug/orders/:id/status
21. PATCH /dashboard/:slug/restaurant/status  (requiere M-11 primero)
22. PATCH /dashboard/:slug/settings           (requiere M-11 primero)
```

### Bloque 4 — CRUD de menú y configuración
```
23-40. Resto de endpoints CRUD (categorías, ítems, variantes, extras, zonas, horarios)
       Todos requieren que Fase 3 del plan de migración esté completa (NOT NULL + FK)
```

---

## Checklist de implementación por endpoint

Para cada endpoint, antes de marcar como listo:

- [ ] Slug resuelve a `restaurante_id` correctamente (404 si no existe)
- [ ] Todas las queries tienen `WHERE restaurante_id = $id`
- [ ] Ningún parámetro externo sobreescribe `restaurante_id`
- [ ] Endpoints de dashboard validan JWT y acceso al slug
- [ ] Endpoints públicos tienen rate limiting donde aplica
- [ ] `metodo_pago` validado contra `restaurante.payment_methods` (endpoint 4)
- [ ] `canal = 'web'` en INSERT de pedidos
- [ ] `is_open` usa `restaurante.zona_horaria` (no `restaurante_config.timezone`)
- [ ] Algoritmo de turno medianoche implementado correctamente

---

## Resumen — El diseño está listo para implementación

**Todos los bloqueantes están resueltos.** Los cambios respecto al diseño anterior son:

1. `metodo_pago` acepta `online` → estado `pendiente_pago`.
2. Zona de delivery se selecciona por zona (dropdown), no por validación de dirección libre.
3. Nuevo endpoint público `GET /public/:slug/delivery/zones`.
4. Columna `payment_methods JSONB` en `restaurante` + validación en endpoint 4.
5. Estado `pagado` incluido en tabla de transiciones del dashboard.
6. Algoritmo `is_open` especificado para turnos que cruzan medianoche.
7. Keys de `tiempo_estimado` confirmadas del DML — el contrato era correcto.
8. **DROP TRIGGER `tg_set_pedido_codigo`** — bug crítico que anulaba el advisory lock.
9. Migración de `delivery_zone` UNIQUE `(postal_code, restaurante_id)`.
10. Eliminar `restaurante_config.timezone` — fuente de verdad es `restaurante.zona_horaria`.
11. Columna `canal` en `pedidos` para diferenciar pedidos web de WhatsApp.
