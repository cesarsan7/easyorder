---
workflow: [MVP] Derivar Humano
source: docs/n8n/[MVP] Derivar Humano.json
workflow_id: pySGUs18QoDJf4Ie
auditado: 2026-04-20
---

## Propósito

Recibe un caso sensible o reclamo del Director, genera un mensaje de derivación con LLM, apaga el bot en Chatwoot y actualiza el contexto de la conversación.

---

## Trigger y entradas

**Tipo de trigger:** `executeWorkflowTrigger` — solo se activa cuando otro workflow lo llama explícitamente.

**Entradas declaradas:**

| Campo | Descripción |
|---|---|
| `problema` | Descripción del caso o último mensaje del cliente que motivó la derivación |
| `telefono` | Teléfono del cliente |
| `account_id` | ID de cuenta en Chatwoot |
| `conversation_id` | ID de conversación en Chatwoot |
| `contact_id` | ID de contacto en Chatwoot |
| `contexto_actual` | Contexto estructurado del cliente (estado, pedido, tono, etc.) |

---

## Queries SQL embebidas

**Ninguna.** Este workflow no tiene ninguna consulta SQL. No accede directamente a PostgreSQL.

---

## Lógica condicional crítica

No hay nodos `IF` ni ramas condicionales en este workflow. El flujo es completamente lineal:

```
Trigger → Resuelve Problemas (LLM) → Variables → Limit → Apagar bot → Crear Contexto1
```

El único nodo con lógica implícita es el **prompt del agente LLM**, que distingue dos casos:
- Si el cliente está molesto o reclama → empieza con disculpa breve.
- Si pide humano explícitamente → lo confirma con claridad.

Ambos caminos producen un mensaje de texto plano de máximo 2 frases; no hay bifurcación de flujo.

---

## Subflujos que llama

| Workflow | ID | Cuándo | Qué recibe |
|---|---|---|---|
| `[MVP] Contexto` | `MKeEjy4NbORRNCvP` | Al final, siempre | Contexto actual, mensaje del cliente, respuesta del agente, teléfono, conversation_id, timestamp |

---

## Mensajes al cliente

El nodo **Resuelve Problemas** (GPT-4.1-mini) genera el único mensaje hacia el cliente.

**System prompt resumido:**
- Rol: agente de derivación humana del restaurante.
- Máximo 2 frases. Texto plano. Sin emojis. Sin prometer tiempos.
- Si molesto → disculpa breve.
- Si pide humano → confirmarlo con claridad.

**Ejemplos embebidos en el prompt:**
- "Entendido. Te paso con el encargado para revisarlo."
- "Claro. Te paso con una persona del equipo."
- "Disculpa la molestia. Te paso con el encargado para ayudarte."

El mensaje generado se mapea en el nodo **Variables** como campo `mensaje`, pero **no se observa un nodo de envío explícito al cliente dentro de este workflow**. El envío real es responsabilidad del flujo llamador o del workflow `[MVP] Contexto`.

---

## Side effects sobre el pedido

### 1. Apagar bot en Chatwoot (activo)

**Nodo:** `Apagar bot`  
**Método:** `PUT`  
**URL:** `https://n8nlearning-chatwoot.avtsif.easypanel.host/api/v1/accounts/{account_id}/contacts/{contact_id}`  
**Body:**
```json
{
  "custom_attributes": {
    "bot": "Off"
  }
}
```
Efecto: desactiva el bot para ese contacto en Chatwoot. El agente humano queda habilitado para tomar la conversación.

### 2. Notificación a Supabase (deshabilitado)

**Nodo:** `noti lovable` — **DISABLED**  
**Método:** `POST`  
**URL:** `https://srqnltqkppzoxgxlfuye.supabase.co/functions/v1/webhook-intervention`  
**Body:** teléfono del cliente, mensaje del problema, URL de conversación en Chatwoot.  
Este nodo existe pero no ejecuta. No tiene efecto en producción actualmente.

### 3. Actualización de contexto

Llama a `[MVP] Contexto` con la respuesta del agente y el mensaje del cliente, lo que persiste el turno en el historial de contexto (probablemente en PostgreSQL, según la implementación de ese subflujo).

**No modifica directamente ninguna tabla de pedidos.** No cambia el estado del pedido (`estado`, `fase_pedido`, etc.).

---

## Riesgos si se agrega multi-tenant

### Riesgo 1 — URL de Chatwoot hardcodeada por instancia

El nodo `Apagar bot` usa una URL con dominio fijo:
```
https://n8nlearning-chatwoot.avtsif.easypanel.host/...
```
En un entorno multi-tenant con múltiples instancias de Chatwoot (o múltiples cuentas), esta URL debe ser dinámica por restaurante. Si se comparte una sola instancia de Chatwoot con múltiples `account_id`, el `account_id` ya parametrizado podría ser suficiente; pero si cada tenant tiene su propio dominio Chatwoot, la URL base también debe parametrizarse.

### Riesgo 2 — `account_id` y `contact_id` sin validación de pertenencia a tenant

El workflow acepta `account_id` y `contact_id` como entradas directas y los usa en la API sin verificar que correspondan al tenant correcto. Un Director de un tenant podría (por error de configuración) apagar el bot de un contacto de otro tenant.

### Riesgo 3 — `[MVP] Contexto` sin `restaurant_id`

El subflujo `Crear Contexto1` recibe `telefono` y `conversation_id` pero no recibe `restaurant_id`. Si el subflujo Contexto persiste datos en PostgreSQL sin filtrar por tenant, el contexto de un cliente podría mezclarse entre restaurantes con el mismo número de teléfono.

### Riesgo 4 — Nodo `noti lovable` apunta a Supabase de instancia única

Aunque deshabilitado, la URL embebida (`srqnltqkppzoxgxlfuye.supabase.co`) es de un proyecto Supabase específico. Si se reactiva sin adaptar, enviará notificaciones de todos los tenants al mismo destino.

### Sin riesgo SQL directo

Como este workflow no tiene queries SQL propias, no hay filtros `WHERE` faltantes. El riesgo de contaminación de datos a nivel base de datos viene exclusivamente de los subflujos que llama (especialmente `[MVP] Contexto`).
