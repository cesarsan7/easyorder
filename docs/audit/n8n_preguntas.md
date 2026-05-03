# Audit: [MVP] Preguntas

**Archivo fuente:** `docs/n8n/[MVP] Preguntas.json`  
**ID workflow:** `pZNufuNN7dzq46Os`  
**Estado:** activo

---

## Propósito

Subflujo de respuesta a preguntas frecuentes: resuelve consultas sobre menú, precios, FAQs y horarios del restaurante sin tomar pedidos.

---

## Trigger y entradas

**Tipo de trigger:** `executeWorkflowTrigger` — solo se activa cuando otro workflow lo llama explícitamente.

**Parámetros de entrada:**

| Campo | Descripción |
|---|---|
| `pregunta` | Texto de la pregunta del cliente |
| `telefono` | Identificador del cliente (usado como session key de memoria) |
| `session_id` | ID de sesión (recibido pero no se usa directamente en los nodos visibles) |

---

## Queries SQL embebidas

### Tool: `Preguntas`
```sql
SELECT pregunta, respuesta
FROM public.faqs
WHERE restaurante_id = 1
ORDER BY COALESCE(orden, 0), pregunta
```
- **Tabla:** `public.faqs`
- **Operación:** SELECT
- **Qué hace:** Trae todas las FAQs del restaurante filtradas por `restaurante_id = 1` (hardcodeado), ordenadas por prioridad y alfabéticamente.

---

### Tool: `Menu`
```sql
SELECT categoria, producto, descripcion, variante AS tamano, precio,
       extras_disponibles, disponible, tags, is_pizza, producto_display
FROM public.fn_menu_lookup(NULL)
ORDER BY categoria, producto, precio
```
- **Tabla/Función:** `public.fn_menu_lookup(NULL)` (función SQL)
- **Operación:** SELECT (via función)
- **Qué hace:** Devuelve el catálogo completo con categorías, variantes, precios, extras y disponibilidad. El argumento `NULL` probablemente indica sin filtro de categoría.

---

### Tool: `Horarios`
```sql
SELECT dia, disponible, apertura_1, cierre_1, apertura_2, cierre_2
FROM public.horarios
WHERE restaurante_id = 1
ORDER BY CASE lower(dia)
  WHEN 'lunes'     THEN 1
  WHEN 'martes'    THEN 2
  WHEN 'miércoles' THEN 3
  WHEN 'miercoles' THEN 3
  WHEN 'jueves'    THEN 4
  WHEN 'viernes'   THEN 5
  WHEN 'sábado'    THEN 6
  WHEN 'sabado'    THEN 6
  WHEN 'domingo'   THEN 7
  ELSE 99
END
```
- **Tabla:** `public.horarios`
- **Operación:** SELECT
- **Qué hace:** Trae el horario semanal del local (dos turnos por día: apertura/cierre 1 y 2) filtrado por `restaurante_id = 1` (hardcodeado). Ordena por día de la semana con lógica CASE manual.

---

## Lógica condicional crítica

Este workflow **no tiene nodos condicionales (`IF`, `Switch`)** propios. Toda la lógica de decisión está delegada al LLM (`Agente Preguntas`) mediante reglas en el system prompt:

| Condición | Acción del agente |
|---|---|
| Pregunta sobre menú, categorías, variantes, extras | Usar tool `Menu` |
| Pregunta sobre delivery, pago, FAQs, cómo pedir | Usar tool `Preguntas` |
| Pregunta sobre horarios o apertura | Usar tool `Horarios` |
| No hay información exacta disponible | Responder con honestidad, no inventar |
| Cliente quiere hacer un pedido | Redirigir al chat principal, no procesar pedido |
| Pregunta ambigua | Hacer una sola pregunta aclaratoria |

**Temperatura del modelo:** 0.2 (respuestas conservadoras y consistentes).

---

## Subflujos que llama

Este workflow **no llama a ningún otro subflujo**. Es un nodo terminal: recibe, procesa y responde. El resultado retorna al workflow padre que lo invocó.

---

## Mensajes al cliente

El agente genera la respuesta directamente como output del nodo `Agente Preguntas`. Las reglas de formato definidas en el system prompt son:

- Español claro y breve, máximo 4 frases
- Texto plano
- Bullets con `•` si enumera opciones
- Si el cliente quiere pedir: `"En el chat principal te ayudo con el pedido."`
- Si no hay información: respuesta honesta, sin inventar datos

El mensaje generado es devuelto al workflow padre — este subflujo no envía mensajes directamente a Chatwoot/WhatsApp.

---

## Side effects sobre el pedido

**No modifica ningún pedido ni tabla de negocio.**

El único efecto secundario es:
- Escritura/lectura en la memoria de conversación (`Postgres Chat Memory`) usando `telefono` como session key, con ventana de 10 mensajes.
- La tabla de memoria es gestionada automáticamente por el nodo `memoryPostgresChat` de n8n (tabla interna de n8n, no tabla de negocio).

---

## Riesgos si se agrega multi-tenant

| Query / Componente | Riesgo |
|---|---|
| `faqs WHERE restaurante_id = 1` | **Hardcodeado.** Todos los tenants verían solo las FAQs del restaurante 1. |
| `horarios WHERE restaurante_id = 1` | **Hardcodeado.** Todos los tenants verían el horario del restaurante 1. |
| `fn_menu_lookup(NULL)` | **Sin filtro de tenant.** La función recibe `NULL` — depende de si la función internamente filtra por `restaurante_id` o no. Requiere inspeccionar el DDL de `fn_menu_lookup`. |
| `Postgres Chat Memory` con key `telefono` | **Sin aislamiento por tenant.** Si dos restaurantes tienen un cliente con el mismo teléfono, compartirían historial de conversación. La key debería ser `restaurante_id + telefono`. |
| `session_id` recibido como input | No se usa en ningún nodo visible — posible campo muerto o preparado para uso futuro. |

**Tablas afectadas que necesitan filtro por `restaurant_id` en multi-tenant:**
- `public.faqs` — filtro hardcodeado en `= 1`
- `public.horarios` — filtro hardcodeado en `= 1`
- `public.fn_menu_lookup()` — requiere auditar DDL de la función
