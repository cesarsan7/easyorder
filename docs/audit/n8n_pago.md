# Auditoría: [MVP] Pago

## Propósito
Registrar el método de pago del cliente, actualizar el estado del pedido (confirmado o pendiente_pago) y devolver al orquestador un resumen final del pedido para enviarlo por WhatsApp.

---

## Trigger y entradas

- **Tipo:** `executeWorkflowTrigger` — es invocado por otro workflow (el Director/Orquestador).
- **Entradas esperadas (JSON):**

| Campo | Tipo | Descripción |
|---|---|---|
| `metodo` | string | Método de pago elegido por el cliente (ej. "transferencia", "efectivo") |
| `telefono` | string | Teléfono del cliente (ej. "+56912345678") |
| `session_id` | string | ID de sesión activa |
| `pedido_id` | number/string | ID del pedido en curso |

---

## Queries SQL embebidas

### 1. `Obtener Pedido con Total`
```sql
SELECT *
FROM public.fn_select_pedido_reutilizable(
  '{{ telefono }}',
  '{{ session_id }}',
  '{{ pedido_id }}',
  false
)
```
- **Tabla/objeto:** función `fn_select_pedido_reutilizable` (accede a `pedidos` y probablemente a `pedido_items`)
- **Operación:** SELECT
- **Qué hace:** recupera el pedido activo del cliente con todos sus datos y totales calculados.

---

### 2. `Obtener Datos Bancarios`
```sql
SELECT datos_bancarios, direccion, moneda
FROM restaurante
WHERE id = 1
LIMIT 1
```
- **Tabla:** `restaurante`
- **Operación:** SELECT
- **Qué hace:** obtiene los datos bancarios del restaurante para incluirlos en el mensaje de transferencia.
- **Riesgo crítico:** `id = 1` está hardcodeado.

---

### 3. `Registrar Método y Estado`
```sql
UPDATE pedidos
SET
  metodo_pago = '<metodo_normalizado>',
  estado = '<confirmado | pendiente_pago>',
  updated_at = NOW()
WHERE id = {{ Obtener Pedido con Total.first().json.id }}
RETURNING *
```
- **Tabla:** `pedidos`
- **Operación:** UPDATE
- **Qué hace:** persiste el método de pago y cambia el estado del pedido.
- **Lógica de estado:** si el método contiene "transfer" → `pendiente_pago`; cualquier otro método → `confirmado`.

---

## Lógica condicional crítica

### Condición 1: `¿Pedido Válido?`
- **Evalúa:** si `$json.id` (del resultado de `fn_select_pedido_reutilizable`) no está vacío.
- **Rama TRUE:** continúa hacia `¿Es Transferencia?`
- **Rama FALSE:** devuelve error "No encontré un pedido activo para tu número."

### Condición 2: `¿Es Transferencia?`
- **Evalúa:** si el método de pago está en `['transferencia', 'transfer', 'bizum', 'online', 'pago online']`
- **Rama TRUE (es pago online/transferencia):** primero va a `Obtener Datos Bancarios`, luego a `Registrar Método y Estado`
- **Rama FALSE (efectivo/tarjeta):** va directo a `Registrar Método y Estado` sin obtener datos bancarios
- **Nota:** el nombre del nodo dice "¿Es Transferencia?" pero en realidad cubre todos los métodos de pago no presenciales (bizum, online, pago online).

### Lógica de normalización de método (en `Registrar Método y Estado` y `Generar Resumen Final`)
El método crudo del trigger se normaliza con esta jerarquía:
1. contiene "transfer" → `transferencia`
2. contiene "bizum" → `bizum`
3. contiene "online" → `online`
4. contiene "tarjeta" o "card" → `tarjeta`
5. default → `efectivo`

---

## Subflujos que llama
Ninguno. Este workflow no delega a otros workflows. Es un nodo terminal del flujo principal.

---

## Mensajes al cliente

Generado en el nodo `Generar Resumen Final` (código JS). El mensaje incluye:

- Código del pedido (si existe)
- Lista de ítems: `Nx Nombre`
- Tipo de despacho:
  - Delivery: dirección + costo de envío + tiempo estimado
  - Retiro: dirección del local + tiempo estimado
- Método de pago
- Subtotal y Total
- Instrucción final según método:
  - Transferencia: "Realiza la transferencia por $X y envíanos el comprobante."
  - Efectivo: "Pagarás en efectivo por $X."
  - Tarjeta: "El pago será con tarjeta por $X."
  - Bizum: "El pago será por Bizum por $X."
  - Online: "El pago será online por $X."

**Error path:** "No encontré un pedido activo para tu número. ¿Quieres hacer un pedido nuevo?"

---

## Side effects sobre el pedido

| Tabla | Campos modificados | Condición |
|---|---|---|
| `pedidos` | `metodo_pago`, `estado`, `updated_at` | Siempre que el pedido sea válido |

- Si método = transferencia → `estado = 'pendiente_pago'`
- Cualquier otro método → `estado = 'confirmado'`

Este workflow es el único punto donde el pedido queda **confirmado** en la base de datos.

---

## Riesgos si se agrega multi-tenant

| Nodo | Query / Lógica | Riesgo |
|---|---|---|
| `Obtener Datos Bancarios` | `WHERE id = 1` hardcodeado | Todos los locales devolverían los datos bancarios del restaurante ID 1. **Crítico.** |
| `fn_select_pedido_reutilizable` | No recibe `restaurant_id` | Si la función no filtra por restaurante internamente, podría cruzar pedidos entre locales. Requiere auditar la función SQL. |
| `Registrar Método y Estado` | `WHERE id = {{ pedido_id }}` | No filtra por `restaurant_id`. Un pedido_id de otro local podría ser confirmado. **Crítico en escenario multi-tenant.** |
| `Generar Resumen Final` | Usa `pedidoDB.direccion` del restaurante | Si viene de `Obtener Datos Bancarios` con ID hardcodeado, la dirección de retiro siempre sería la del local 1. |
| Moneda | `moneda` se obtiene de `restaurante WHERE id = 1` | Todos los locales usarían la moneda del restaurante 1. |
