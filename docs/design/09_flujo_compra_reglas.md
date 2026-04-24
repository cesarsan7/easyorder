# Flujo de compra — Reglas aplicadas al checkout público EasyOrder

Fuente de verdad: `reglas_negocio_la_isla.md` + `08_arbol_pantallas_publico.md`  
Alcance: frontend público `/:slug/checkout/*`

---

## Paso 5.2 — Tipo de despacho (`/:slug/checkout/despacho`)

### ¿Qué campos muestra para retiro?
- Dos cards visuales: **Retiro en local** / **Delivery**
- Al seleccionar Retiro: solo se confirma la selección. **No aparece campo de dirección.** (regla 5: "Para retiro, nunca pedir dirección")
- Muestra: "Sin costo de envío"

### ¿Qué campos muestra para delivery?
- Al seleccionar Delivery: aparece campo de dirección de texto libre
- Si el cliente tiene dirección frecuente guardada (lookup por teléfono ingresado en paso anterior), se pre-carga
- Muestra: costo de envío calculado para la zona
- Muestra: monto mínimo requerido y monto actual del carrito

### ¿Qué validaciones hace antes de continuar?

| Condición | Comportamiento |
|---|---|
| Retiro seleccionado | Permite avanzar sin más validaciones |
| Delivery seleccionado + dirección vacía | Bloquea avance, campo marcado como obligatorio |
| Delivery seleccionado + dirección fuera de zona | Muestra aviso "Sin cobertura en esta zona", bloquea avance |
| Delivery seleccionado + monto < mínimo de delivery | Muestra aviso con monto faltante, bloquea avance (ver siguiente punto) |

### ¿Qué pasa si el mínimo de delivery no se alcanza?
- **No se confirma el pedido** (regla 7)
- **No se cambia a retiro de forma silenciosa** (regla 10)
- Se mantiene la intención de delivery seleccionada
- Se muestra aviso: "Te faltan $X para el mínimo de delivery"
- Se ofrecen dos acciones explícitas:
  - "Agregar más productos" → regresa a `/:slug/menu`
  - "Cambiar a Retiro" → acción explícita del usuario, no automática
- No se puede avanzar al siguiente paso hasta resolver la condición

---

## Paso 5.1 — Datos del cliente (`/:slug/checkout/datos`)

### ¿Qué campos son obligatorios?
- **Nombre** — obligatorio (regla de negocio: pedir "a nombre de quién" antes de confirmar)
- **Teléfono** — obligatorio (necesario para asociar el pedido y construir el link de WhatsApp)

### ¿Cuáles son opcionales?
- Ninguno en MVP. Ambos campos son requeridos para avanzar.

### ¿Qué pasa si el cliente ya tiene nombre guardado?
- Si el teléfono ingresado coincide con un registro en `customers`, se pre-cargan `name` y la última `address` frecuente
- El cliente puede confirmar o editar los valores pre-cargados
- Si modifica el nombre, el nuevo valor se guarda en perfil al confirmar el pedido
- Si usa delivery con una dirección nueva (distinta a la pre-cargada), esa dirección se guarda como dirección frecuente

---

## Paso 5.3 — Método de pago (`/:slug/checkout/pago`)

### ¿Qué opciones muestra?
Solo los métodos habilitados por el local en `businesses.payment_methods`. Los métodos válidos son:
- Efectivo
- Tarjeta
- Transferencia
- Bizum
- Online

Se muestran como cards o radio buttons. Solo se renderizan los que el local tiene activos.

### ¿Puede asumir alguna por defecto?
**No.** El sistema no asume ningún método de pago. (regla 8: "No asumir método de pago")  
El botón "Continuar" permanece deshabilitado hasta que el usuario seleccione uno explícitamente.

### ¿Qué pasa si elige transferencia?
- El flujo continúa normalmente hacia la pantalla de confirmación
- Al crear el registro de pedido en base de datos, el estado queda como `pendiente_pago` (regla 9)
- En la pantalla de estado del pedido (`/:slug/pedido/estado`), se muestran las instrucciones de transferencia del local
- En otros métodos de pago el estado queda como `confirmado`

---

## Paso 5.4 — Confirmación (`/:slug/checkout/confirmar`)

### ¿Qué muestra en el resumen final?
- Lista de ítems con: nombre, variante seleccionada, extras, cantidad, precio unitario
- Nombre del cliente
- Tipo de despacho (Retiro / Delivery)
- Dirección (solo si es Delivery)
- Método de pago seleccionado
- Subtotal
- Costo de envío (0 si es Retiro)
- **Total**
- Aviso: "Se abrirá WhatsApp con tu pedido. Solo toca enviar."

### ¿Qué acción dispara hacia el negocio?
El botón "Enviar pedido por WhatsApp" construye un link `wa.me/{whatsapp_number}?text={mensaje_codificado}` con el pedido pre-armado.

El mensaje incluye:
- Nombre y teléfono del cliente
- Ítems con variantes y extras
- Tipo de despacho
- Dirección (si aplica)
- Método de pago
- Total

Al mismo tiempo (o antes de abrir WhatsApp) se crea el registro del pedido en base de datos:
- Estado: `confirmado` (o `pendiente_pago` si el método es Transferencia)
- Se guarda dirección frecuente si es delivery con dirección nueva
- Se guarda nombre en perfil si es nuevo o fue modificado

### ¿A dónde va después de confirmar?
Después de abrir WhatsApp, el cliente es redirigido a:
`/:slug/pedido/estado?id={order_id}`

Donde puede ver:
- Código o ID del pedido
- Estado actual (inicial: Recibido)
- Resumen de ítems y despacho
- Instrucciones de transferencia si aplica

---

## Restricciones de seguridad transversales del flujo

| Regla | Aplicación en frontend |
|---|---|
| No confirmar sin pasar por Pago | La ruta `/:slug/checkout/confirmar` solo es accesible si los pasos anteriores completaron su estado en sesión |
| No cambiar delivery→retiro sin acción explícita | El cambio de tipo de despacho es siempre acción del usuario, nunca automático |
| No inventar métodos de pago | Solo se renderizan los métodos de `businesses.payment_methods` |
| No confirmar si no alcanza mínimo de delivery | Validación bloqueante en paso de despacho, no en confirmación |
| Local cerrado | Si `is_open = false` al cargar el checkout, mostrar banner y bloquear el botón final de confirmación |

---

## Estado de sesión requerido por paso

El flujo acumula estado en `sessionStorage` o contexto de React. Cada paso depende del anterior:

```
carrito (ítems + precios)
  └─ datos (nombre + teléfono)
       └─ despacho (tipo + dirección + costo_envio)
            └─ pago (método)
                 └─ confirmar (todo lo anterior + order_id generado)
```

Si el usuario llega a un paso sin el estado previo (navegación directa por URL), debe ser redirigido al primer paso incompleto.
