---
workflow: [MVP] Perfil Cliente
archivo_fuente: docs/n8n/[MVP] Perfil Cliente.json
auditado: 2026-04-20
---

## Propósito

Guardar o actualizar el perfil del cliente (nombre y/o dirección frecuente) en base a los datos que el Director central le pasa, y devolver un mensaje de confirmación al agente.

---

## Trigger y entradas

**Tipo de trigger:** `executeWorkflowTrigger` — solo se activa cuando otro workflow lo llama explícitamente.

**Entradas declaradas:**

| Campo         | Tipo   | Descripción                                      |
|---------------|--------|--------------------------------------------------|
| `accion`      | string | Acción solicitada (declarado pero no usado en lógica) |
| `telefono`    | string | Identificador del cliente (clave de búsqueda)    |
| `nombre`      | string | Nombre del cliente a guardar (puede ser NULL)    |
| `direccion`   | string | Dirección a guardar como frecuente (puede ser NULL) |
| `tipo_despacho` | string | `delivery` / `domicilio` / `retiro` — condiciona el mensaje |

---

## Queries SQL embebidas

### 1. `Guardar Perfil` — función PostgreSQL

```sql
SELECT * FROM public.fn_upsert_usuario_perfil(
  '<telefono>',
  <nombre | NULL>,
  <direccion | NULL>,
  <tipo_despacho | NULL>
)
```

| Atributo     | Detalle                                                                 |
|--------------|-------------------------------------------------------------------------|
| Tabla tocada | Indirecto via función `fn_upsert_usuario_perfil` (tabla `usuario` o similar) |
| Operación    | UPSERT — crea el cliente si no existe, actualiza si existe              |
| Resultado    | Retorna la fila actualizada, incluyendo `id`, `nombre`, `direccion_frecuente`, `updated_name`, `updated_address` |

> No hay SELECT, INSERT ni UPDATE directos en el workflow — toda la lógica SQL está encapsulada en la función `fn_upsert_usuario_perfil`.

---

## Lógica condicional crítica

Toda la lógica condicional está en el nodo **`Respuesta Perfil`** (código JS), que decide el mensaje de respuesta:

| Condición                                                        | Mensaje generado                                                                 |
|------------------------------------------------------------------|----------------------------------------------------------------------------------|
| `nombre` presente + `direccion` presente + tipo es delivery/domicilio | `"Perfecto, lo dejo a nombre de {nombre} y guardo esta dirección para futuras entregas."` |
| Solo `nombre` presente                                           | `"Perfecto, lo dejo a nombre de {nombre}."`                                      |
| Solo `direccion` presente                                        | `"Perfecto, guardo esta dirección para futuras entregas."`                        |
| Ninguno presente                                                 | `"Perfil actualizado."` (fallback genérico)                                      |

El campo `accion` está declarado como entrada pero **no se usa en ninguna condición** del workflow.

---

## Subflujos que llama

Ninguno. Este workflow es un nodo hoja: recibe datos, guarda y responde. No delega a otros workflows.

---

## Mensajes al cliente

Este workflow **no envía mensajes directamente** al cliente (no tiene nodo Chatwoot ni WhatsApp). Devuelve el campo `respuesta_agente` en su output JSON, y es el workflow llamante (Director o subflujo de Despacho) quien decide si y cómo enviarlo.

**Campos devueltos al caller:**

```json
{
  "success": true,
  "respuesta_agente": "<mensaje de confirmación>",
  "id": "<id del usuario>",
  "nombre": "<nombre guardado>",
  "direccion_frecuente": "<dirección guardada>",
  "updated_name": true | false,
  "updated_address": true | false
}
```

---

## Side effects sobre el pedido

Este workflow **no modifica el pedido directamente**. Su efecto es sobre la tabla de perfil del cliente (`usuario` o equivalente):

- Actualiza `nombre` si se proveyó uno nuevo.
- Actualiza `direccion_frecuente` si se proveyó una nueva.
- El campo `updated_name` y `updated_address` en el resultado indica si hubo cambio real.

---

## Riesgos si se agrega multi-tenant

| Elemento                         | Riesgo                                                                                      |
|----------------------------------|---------------------------------------------------------------------------------------------|
| `fn_upsert_usuario_perfil`       | La función busca al usuario **solo por `telefono`**. Si un mismo número existe en dos locales (multi-tenant), el upsert podría sobrescribir datos del cliente del local incorrecto. |
| Tabla `usuario` (implícita)      | Si la tabla no tiene columna `restaurant_id`, todos los locales compartirán el mismo perfil por teléfono. Esto puede ser intencional (cliente global) o un bug de aislamiento. |
| Dirección frecuente              | Una dirección guardada para local A sería visible y reutilizable en local B si no hay aislamiento por tenant. |
| Nombre del cliente               | Mismo riesgo que dirección: un cambio de nombre desde un local afectaría a todos los locales. |
| Campo `accion` ignorado          | Si en multi-tenant se necesita diferenciar acciones (ej. guardar dirección solo para este local), el campo `accion` está disponible pero actualmente sin uso — habría que implementar su lógica. |

**Decisión de diseño a validar:** ¿el cliente es global (mismo perfil en todos los locales) o es por tenant (perfil independiente por local)? Esta decisión determina si `fn_upsert_usuario_perfil` necesita o no un parámetro `restaurant_id`.
