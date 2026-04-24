# Auditoría: [MVP] Pizzeria

> Fuente: `docs/n8n/[MVP] Pizzeria.json`
> Solo mapeo de lo existente. Sin propuestas de cambio.

---

## Propósito

Orquestador principal del agente de WhatsApp para La Isla Pizzería: recibe mensajes de Chatwoot, los normaliza (texto/audio/imagen/ubicación), gestiona el buffer de mensajes, valida horario de apertura, resuelve el contexto del cliente y delega al agente Director o al agente Cerrado.

---

## Trigger y entradas

**Trigger:** Webhook POST en la ruta `/chatwootnew`  
**Activado por:** Chatwoot cuando llega un mensaje entrante (evento `message_created`)

**Datos de entrada usados:**
| Campo | Origen en el payload |
|---|---|
| `telefono` | `body.sender.phone_number` |
| `account_id` | `body.account.id` |
| `contact_id` | `body.conversation.contact_inbox.contact_id` |
| `conversation_id` | `body.conversation.id` |
| `bot_status` | `body.conversation.messages[0].sender.custom_attributes.bot` |
| `message_type` | `body.conversation.messages[0].content_type` |
| `body` (texto) | `body.conversation.messages[0].content` |
| `file_type` | `body.conversation.messages[0].attachments[0].file_type` |
| `data_url` | `body.conversation.messages[0].attachments[0].data_url` |
| `moneda` | `body.moneda` (fallback `'€'`) |

**Validación de bot:** Nodo `Bot` (Switch) — si `bot_status = "on"` continúa; si `bot_status = "Off"` termina sin procesar.

---

## Queries SQL embebidas

| Nodo | Tabla | Tipo | Descripción |
|---|---|---|---|
| `Obtener registros` | `public.contexto` | SELECT | Obtiene el último contexto del cliente por `telefono`, incluyendo `session_id`, `session_started_at`, `restaurante_id`. Ordenado por `timestamp DESC LIMIT 1`. |
| `Nuevo usuario` | `public.contexto` | INSERT | Inserta fila de contexto inicial para clientes nuevos (`contexto = "El usuario es un cliente nuevo…"`, `restaurante_id = 1` hardcodeado). |
| `Obtener Config Restaurante` | `public.restaurante` | SELECT | `SELECT * FROM restaurante WHERE id = 1` — `id = 1` hardcodeado, no parametrizado. |
| `Asegurar Usuario Maestro` | `public.usuarios` | INSERT … ON CONFLICT | Upsert del usuario por `telefono`. Inserta con `restaurante_id = 1` hardcodeado. Al conflicto actualiza solo `updated_at`. Retorna `id, telefono, nombre, direccion_frecuente, lat_frecuente, long_frecuente`. |

**Memoria conversacional (implícita):** El nodo `Memory` usa `@n8n/n8n-nodes-langchain.memoryPostgresChat` con `session_key = conversation_id` y ventana de 8 turnos. Escribe y lee en PostgreSQL (tabla `n8n_chat_histories` o equivalente gestionada por LangChain).

---

## Lógica condicional crítica

### 1. Filtro bot activo (`Bot`)
- `bot_status = "on"` → sigue el flujo
- `bot_status = "Off"` → termina

### 2. Tipo de adjunto (`Switch`)
- `file_type = "location"` → extrae lat/long como texto
- `file_type = "audio"` → descarga audio → transcribe con OpenAI Whisper (español)
- `file_type = "image"` → descarga imagen → analiza con Gemini 2.5 Flash (**nodo deshabilitado**)
- Sin adjunto (fallback) → extrae texto del mensaje

### 3. Buffer de mensajes (`Switch2`)
Evalúa dos condiciones sobre el buffer en Redis:
- Si el último mensaje en buffer **≠** input actual → rama "No hacer nada" (NoOp)
- Si el `created_at` del webhook es **anterior** a `now - 1s` → rama "Seguir" (procesa)
- Si ninguna → rama "Esperar" (Wait 1 segundo, reintenta)

Cuando continúa: borra la key `{telefono}_buffer` de Redis.

### 4. Validación de disponibilidad (`Validacion`)
Código JS que:
- Lee horarios desde n8n DataTable (no desde PostgreSQL)
- Evalúa en zona horaria `Atlantic/Canary`
- Soporta dos turnos por día (`apertura_1/cierre_1`, `apertura_2/cierre_2`)
- Soporta turnos que cruzan medianoche
- Retorna `estado: "Abierto"` o `estado: "Cerrado"` con tipo (`Hora` / `Dia`) y mensaje humano

### 5. Disponible (`If`)
- `estado = "Abierto"` → **Director** (agente activo)
- `estado = "Cerrado"` → **Agente Cerrado**

### 6. Existencia de usuario (`If`)
- `telefono` existe en `contexto` → usa contexto existente
- No existe → inserta en `contexto` y en `usuarios` con `restaurante_id = 1`

### 7. Sesión (`Session Manager`)
Código JS que:
- Lee `session_id` y `session_started_at` de la fila de contexto
- Si no existe o expiró (> 30 minutos) → genera nuevo UUID y timestamp
- Propaga `session_id`, `session_is_new`, `session_razon` (primera_vez / timeout / activa)

---

## Subflujos que llama

El workflow llama subflujos de dos formas: como **tools del agente LLM** (invocadas autónomamente por el Director) y como **executeWorkflow** (llamadas directas).

### Tools del agente Director (invocadas por LLM)
| Tool | Workflow | ID | Descripción |
|---|---|---|---|
| `Apertura` | `[MVP] Apertura` | `jLxdQv7jxYY7ooly` | Agregar/quitar/modificar/consultar productos en el pedido |
| `Despacho` | `[MVP] Despacho` | `iYQLJpXpfzSHYlZK` | Define tipo de entrega (delivery/retiro), valida zona y mínimo |
| `Pago` | `[MVP] Pago` | `jFW1YsNrvXG92BDG` | Registra método de pago y confirma el pedido |
| `Perfil Cliente` | `[MVP] Perfil Cliente` | `WgxXy1ciOAaKd0X7` | Actualiza nombre y dirección frecuente del cliente |
| `Pedidos Cliente` | `[MVP] Pedidos Cliente` | `TeJyG2pvWSMkQbAw` | Resuelve o lista pedidos por código/referencia |
| `Preguntas` | `[MVP] Preguntas` | `pZNufuNN7dzq46Os` | FAQs: menú, precios, horarios, cobertura, etc. |
| `Derivar Humano` | `[MVP] Derivar Humano` | `pySGUs18QoDJf4Ie` | Escala la conversación a un operador humano |

### Tools del agente Cerrado (subconjunto)
| Tool | Workflow |
|---|---|
| `Preguntas` | `[MVP] Preguntas` |
| `Derivar Humano` | `[MVP] Derivar Humano` |

### Llamadas directas (`executeWorkflow`)
| Nodo | Workflow | Momento |
|---|---|---|
| `Crear Contexto` | `[MVP] Despacho` | Después de que el Director emite la respuesta — actualiza el contexto persistido |

---

## Mensajes al cliente

Los mensajes son generados por los agentes LLM y enviados a través de la API de Chatwoot:

**Endpoint:** `POST https://{chatwoot_host}/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages`

**Limpieza previa (nodo `Seteo respuesta`):**
- Elimina comillas al inicio/fin
- Elimina `¿` y `¡`
- Colapsa múltiples saltos de línea en uno
- Colapsa espacios múltiples

**Agente Cerrado** genera: mensaje informando que el local está cerrado, cuándo abre, y responde consultas informativas. Máximo 2 frases.

**Agente Director** genera: respuestas operativas para el flujo completo (Apertura → Despacho → Pago). Sistema prompt de 41 reglas explícitas. Usa `gpt-4.1-mini` con contexto de ventana de 8 turnos.

**Envío paginado:** Si la respuesta tiene múltiples segmentos, pasa por `Loop Over Items` con `Wait 2s` entre mensajes.

---

## Side effects sobre el pedido

Este workflow orquestador **no modifica directamente** el estado del pedido. Todos los side effects sobre pedidos ocurren en los subflujos delegados (`Apertura`, `Despacho`, `Pago`).

Lo que **sí modifica** directamente:

| Tabla | Operación | Cuándo |
|---|---|---|
| `public.contexto` | INSERT | Si el cliente es nuevo (no tiene fila) |
| `public.usuarios` | INSERT / UPDATE (`updated_at`) | En cada mensaje — upsert por `telefono` |
| Redis `{telefono}_buffer` | PUSH / DELETE | Push al recibir mensaje; DELETE al procesar |
| `n8n_chat_histories` (LangChain) | Lectura y escritura | En cada turno del Director, por el nodo `Memory` |

---

## Riesgos si se agrega multi-tenant

### Queries con `restaurante_id` hardcodeado

| Nodo | Problema |
|---|---|
| `Nuevo usuario` (INSERT contexto) | `restaurante_id = 1` hardcodeado — todos los clientes nuevos quedan asignados al restaurante 1 |
| `Obtener Config Restaurante` (SELECT restaurante) | `WHERE id = 1` hardcodeado — siempre carga la config del restaurante 1 |
| `Asegurar Usuario Maestro` (INSERT usuarios) | `restaurante_id = 1` hardcodeado — usuarios de todos los locales quedan en restaurante 1 |

### Timezone hardcodeada

El nodo `Validacion` usa `Atlantic/Canary` como zona horaria fija. Si hay restaurantes en otras zonas (Argentina, Chile, España continental), la apertura/cierre se calcularía incorrectamente.

### Horarios en DataTable (no en PostgreSQL)

Los horarios se leen desde un DataTable de n8n (`id: 5XwGS8YQg9E10VtW`), que es una tabla de configuración interna de n8n, no versionable ni multi-tenant. Un restaurante diferente requeriría una DataTable separada o migrar los horarios a PostgreSQL con `restaurante_id`.

### Prompt del LLM con nombre hardcodeado

El system prompt del Director y del Agente Cerrado contienen `"La Isla Pizzería"` como nombre fijo. En multi-tenant, el nombre del local debería inyectarse dinámicamente desde la config del restaurante.

### Redis buffer sin namespace por restaurante

La key de Redis es `{telefono}_buffer`. Si dos restaurantes tienen el mismo cliente (mismo número de teléfono), sus buffers colisionarían.

### Memoria LangChain sin aislamiento por restaurante

El nodo `Memory` usa `conversation_id` como clave de sesión. Como `conversation_id` viene de Chatwoot y cada cuenta de Chatwoot tiene su propio namespace, este punto tiene aislamiento implícito por cuenta — pero solo si cada restaurante usa su propia cuenta de Chatwoot. Si comparten cuenta, habría colisión.

### `moneda` sin vínculo con restaurante

La moneda se lee del payload con fallback `'€'`. No hay vínculo con el campo de moneda del restaurante en PostgreSQL.
