---
workflow: "[MVP] Contexto"
workflow_id: MKeEjy4NbORRNCvP
auditado: 2026-04-20
---

## Propósito
Regenera y persiste el bloque de contexto conversacional de un cliente luego de cada turno de conversación, usando LLM para sintetizar el estado actualizado.

---

## Trigger y entradas

- **Trigger:** `executeWorkflowTrigger` — solo se activa cuando otro workflow lo llama explícitamente.
- **Entradas recibidas:**

| Campo | Descripción |
|---|---|
| `Contexto Actual` | Bloque de contexto previo del cliente (texto estructurado) |
| `Mensaje del Cliente` | Último mensaje enviado por el cliente en este turno |
| `Respuesta del Agente` | Lo que el agente respondió en este turno |
| `Telefono` | Teléfono del cliente, usado como clave de búsqueda en PostgreSQL |

---

## Queries SQL embebidas

El workflow no contiene SQL en texto libre. Usa el nodo Postgres en modo `update` (ORM de n8n):

| Nodo | Tabla | Operación | Condición | Campos escritos |
|---|---|---|---|---|
| `Actualizar Contexto` | `public.contexto` | UPDATE | `WHERE telefono = $Telefono` | `contexto` (texto generado por LLM) |

Campos ignorados en el update (marcados como `removed: true`): `nombre`, `estado`, `direccion`, `timestamp`.

---

## Lógica condicional crítica

**No existe lógica condicional.** El flujo es lineal:

```
Trigger → Generar contexto (LLM) → Actualizar Contexto (Postgres UPDATE)
```

Toda la "lógica" reside en el prompt enviado al LLM (reglas de actualización de contexto).

---

## Subflujos que llama

Ninguno. Este workflow es un subflujo terminal — es llamado pero no llama a otros.

---

## Mensajes al cliente

**Ninguno.** Este workflow no genera ni envía mensajes al cliente. Es puramente de persistencia interna.

---

## Side effects sobre el pedido

- **No modifica el estado del pedido directamente.**
- **Sí modifica** el campo `contexto` de la tabla `contexto` para el teléfono dado.
- El contexto actualizado incluye `FASE_PEDIDO`, `PEDIDO_ACTUAL`, `DESPACHO`, `METODO_PAGO` y otros campos de estado del pedido como texto dentro del bloque — pero no actualiza las tablas `pedido`, `pedido_item` ni ninguna tabla transaccional.

---

## Estructura del bloque de contexto generado

El LLM produce un bloque de texto con formato fijo (no JSON):

```
CLIENTE: [nombre o "no definido"]
ESTADO: [nuevo | recurrente | frecuente]
ULTIMA_INTERACCION: [fecha hora]
PEDIDO_ACTUAL: [sin pedido | en curso (...) | confirmado | entregado]
FASE_PEDIDO: [sin pedido | armando_items | esperando_nombre | esperando_despacho | esperando_direccion | esperando_pago | esperando_confirmacion | confirmado]
DESPACHO: [no definido | delivery (...) | retiro]
METODO_PAGO: [no definido | efectivo | transferencia | tarjeta | bizum | online]
DIRECCION_CONOCIDA: [si/no + detalle]
UBICACION_RECIBIDA: [si/no + detalle]
PREFERENCIAS: [resumen]
HISTORIAL_BREVE: [máx 2 líneas]
TONO_CLIENTE: [neutral | amigable | apurado | molesto | confundido]
ULTIMA_ACCION: [qué pasó en este turno]
PENDIENTE: [qué debe hacer el cliente]
SESSION_ID: [id o "no definido"]
SESSION_STARTED: [timestamp o "no definido"]
```

- Modelo LLM utilizado: **gpt-4.1-mini**

---

## Riesgos si se agrega multi-tenant

| Riesgo | Descripción | Severidad |
|---|---|---|
| **Sin filtro por `restaurant_id`** | El UPDATE busca por `telefono` únicamente. Si dos locales distintos atienden al mismo número de teléfono, el contexto del cliente se sobreescribe entre tenants sin distinción. | **Alta** |
| **Tabla `contexto` sin columna `restaurant_id`** | La tabla no tiene columna de tenant visible en el DDL usado aquí. Agregar multi-tenant requiere añadir `restaurant_id` a la tabla y al `matchingColumns` del nodo. | **Alta** |
| **`SESSION_ID` como mitigación parcial** | El bloque incluye `SESSION_ID`, pero no se usa en el WHERE del UPDATE — solo se persiste dentro del texto del contexto, sin valor como clave de aislamiento. | **Media** |
| **Contexto es texto libre, no JSON** | El bloque generado es texto con formato propio (no JSON estructurado). Parsear o filtrar por tenant en consultas futuras requiere extracción de texto frágil. | **Media** |
| **`FECHA Y HORA ACTUAL` desde `$now`** | Se usa la hora del servidor n8n, sin zona horaria del local. Con multi-tenant y locales en distintas zonas horarias, `ULTIMA_INTERACCION` puede quedar desfasada. | **Baja** |
