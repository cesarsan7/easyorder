---
workflow: [MVP] Pedidos Cliente
id: TeJyG2pvWSMkQbAw
auditado: 2026-04-20
estado: activo
---

## Propósito

Permite al agente consultar o resolver (identificar) pedidos modificables de un cliente por su teléfono, devolviendo el pedido activo o listando las opciones si hay varios.

---

## Trigger y entradas

**Tipo:** `executeWorkflowTrigger` — solo puede ser invocado por otro workflow, no tiene trigger externo propio.

**Inputs declarados:**

| Campo       | Tipo     | Descripción                                                    |
|-------------|----------|----------------------------------------------------------------|
| `accion`    | string   | `'resolver'` · `'consultar'` · cualquier otro valor = listar  |
| `telefono`  | string   | Número del cliente (usado como clave de búsqueda en DB)        |
| `referencia`| string   | Código de pedido (ej: `260418-1006`), requerido para resolver  |

---

## Queries SQL embebidas

### 1. `Listar Modificables`

```sql
SELECT *
FROM public.fn_listar_pedidos_modificables('{{ telefono }}')
WHERE es_modificable
ORDER BY updated_at DESC
LIMIT 5
```

| Tabla / Función                       | Operación | Qué hace                                                                  |
|---------------------------------------|-----------|---------------------------------------------------------------------------|
| `fn_listar_pedidos_modificables(tel)` | SELECT    | Devuelve pedidos del cliente aún dentro de la ventana de modificación     |

**Nota:** La función recibe solo `telefono`. No recibe `restaurant_id`.

---

### 2. `Resolver Pedido`

```sql
SELECT *
FROM public.fn_resolver_pedido_referencia(
  '{{ telefono }}',
  '{{ referencia }}'
)
```

| Tabla / Función                               | Operación | Qué hace                                                              |
|-----------------------------------------------|-----------|-----------------------------------------------------------------------|
| `fn_resolver_pedido_referencia(tel, ref)`     | SELECT    | Busca un pedido específico por teléfono + código de referencia        |

**Nota:** Igual que la anterior, no recibe `restaurant_id`.

---

## Lógica condicional crítica

### Nodo `¿Resolver?`

Evalúa si `accion` es `'resolver'` o `'consultar'`:

```
['resolver','consultar'].includes(accion || 'listar_modificables')
```

| Resultado | Rama | Siguiente nodo     |
|-----------|------|--------------------|
| `true`    | main[0] | `Resolver Pedido` (busca por referencia) |
| `false`   | main[1] | `Listar Modificables` (lista por teléfono) |

**Comportamiento por defecto:** si `accion` es nulo o vacío, el fallback `'listar_modificables'` hace que la condición sea `false` → va a listar.

---

### Nodo `Respuesta Resolver` (JS)

Evalúa el resultado de `fn_resolver_pedido_referencia`:

| Condición                        | Respuesta al agente                                                         |
|----------------------------------|-----------------------------------------------------------------------------|
| `pedido_id` ausente              | Error: "No pude identificar ese pedido. Envíame el código exacto..."        |
| `accion === 'consultar'`         | Detalle completo: ítems, estado, despacho, total, tiempo, pago              |
| `!es_modificable`                | Aviso: "ya no está dentro de la ventana de cambios"                         |
| `es_modificable === true`        | Confirmación: "trabajaré sobre el pedido {codigo}. ¿Qué cambio quieres hacer?" |

---

### Nodo `Respuesta Lista` (JS)

Evalúa el resultado de `fn_listar_pedidos_modificables`:

| Condición              | Respuesta al agente                                                       |
|------------------------|---------------------------------------------------------------------------|
| 0 resultados           | "No encontré pedidos modificables vigentes para tu número."               |
| 1 resultado            | Selecciona automáticamente: "Puedo modificar el pedido {codigo}. ¿Qué cambio quieres hacer?" |
| 2+ resultados          | Lista los códigos y pregunta: "¿Cuál quieres modificar?"                  |

---

## Subflujos que llama

Ninguno. Este workflow no invoca otros workflows. Es un subflujo terminal (leaf node).

---

## Mensajes al cliente

Los mensajes no se envían directamente al cliente desde aquí. Son devueltos en el campo `respuesta_agente` del JSON de salida, para que el workflow orquestador los envíe.

| Escenario                          | Texto devuelto en `respuesta_agente`                                                   |
|------------------------------------|----------------------------------------------------------------------------------------|
| Sin pedidos modificables           | "No encontré pedidos modificables vigentes para tu número."                            |
| Un pedido modificable              | "Puedo modificar el pedido {codigo}. ¿Qué cambio quieres hacer?"                      |
| Varios pedidos modificables        | "Tienes varios pedidos aún modificables: {lista}. ¿Cuál quieres modificar?"           |
| Pedido encontrado, no modificable  | "Encontré el pedido {codigo}, pero ya no está dentro de la ventana de cambios."        |
| Pedido encontrado, modificable     | "Perfecto, trabajaré sobre el pedido {codigo}. ¿Qué cambio quieres hacer?"            |
| Pedido no encontrado               | "No pude identificar ese pedido. Envíame el código exacto, por ejemplo 260418-1006."  |
| Consulta de pedido (accion=consultar) | Detalle: "{items}. Estado: {estado}. {despacho} Total: {total}. {tiempo} {pago}"    |

---

## Side effects sobre el pedido

**Ninguno.** Este workflow es de solo lectura. No ejecuta `INSERT`, `UPDATE` ni `DELETE`. No modifica el estado del pedido ni de ninguna tabla.

---

## Riesgos si se agrega multi-tenant

### 1. `fn_listar_pedidos_modificables(telefono)`

- Filtra solo por `telefono`, sin `restaurant_id`.
- Si un cliente tiene pedidos en múltiples restaurantes, el workflow devolverá pedidos de **todos los locales mezclados**.
- En multi-tenant, el agente podría mostrar al cliente un pedido de otro restaurante.

### 2. `fn_resolver_pedido_referencia(telefono, referencia)`

- Filtra por `telefono` + `referencia`, sin `restaurant_id`.
- El código de pedido (`260418-1006`) puede colisionar entre restaurantes si el formato es por fecha+secuencia sin prefijo de local.
- Un cliente podría resolver accidentalmente un pedido del restaurante B desde el contexto del restaurante A.

### 3. Ausencia de `restaurant_id` en los inputs del trigger

- El workflow no recibe `restaurant_id` como parámetro de entrada.
- Para soportar multi-tenant, el orquestador deberá pasarlo, y ambas funciones SQL deberán recibir y filtrar por ese valor.

### 4. Formato del código de referencia

- El formato `DDMMYY-HHMM` es temporal, no incluye identificador de local.
- En multi-tenant hay riesgo de colisión de códigos entre restaurantes si se mantiene ese formato.
