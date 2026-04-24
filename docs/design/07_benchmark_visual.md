# Benchmark Visual — EasyOrder

Plataforma analizada: Pedifast (pedifast.app)
Todas las capturas provienen de una misma plataforma competidora directa: SaaS multi-tenant para locales de comida rápida con pedidos por WhatsApp. El análisis se hace como referencia visual y funcional, no como fuente de verdad operativa.

---

## Capturas analizadas

| Archivo | Descripcion |
|---|---|
| 2mJNnipSOO.png | Dashboard — pantalla Inicio con metricas resumidas del negocio |
| 5yVlBbp3Av.png | Landing publica de Pedifast — propuesta de valor y planes de precio |
| 8RyhoylPlV.png | Menu publico del local — vista del cliente con categorias y carrito lateral |
| C7QfzPq0m5.png | Dashboard — Ajustes, pestana WhatsApp con link y plantilla de auto-respuesta |
| DSc5J1Nby7.png | Checkout publico — paso de datos del cliente (nombre y telefono) |
| IC6ZvSkhOC.png | Landing publica — seccion "Como funciona" con 3 pasos ilustrados |
| Kkb0SeLyow.png | Checkout publico — pantalla de resumen final con boton Abrir WhatsApp |
| RqU2BLxsQb.png | Landing publica — seccion de planes de precios (LOCAL, NEGOCIO, PRO) |
| YH0UkiNMOf.png | Onboarding del negocio — pantalla de confirmacion "Tu carta esta lista" con instrucciones WhatsApp |
| bAZ0ueIFCx.png | Checkout publico — paso de tipo de entrega (Despacho / Retiro) y metodo de pago |
| dUVR6t6AWH.png | Onboarding del negocio — pantalla identica a YH0UkiNMOf (version movil) |
| gaG1Kus0oZ.png | Menu publico del local — vista completa con header del local, categorias en tabs y carrito lateral |
| hwGNY6iQnn.png | Landing publica — seccion de funcionalidades (grid de 6 cards) |
| i7TaaXtHfk.png | Onboarding del negocio — paso 1 de 3, configuracion de marca (nombre, logo, paleta de colores) con preview en vivo |
| kw8dyW0AsW.png | Dashboard — Ajustes, pestana Horarios con control manual y horario semanal por dia |
| m0wUPwvnZt.png | Dashboard — Seccion Menu con lista de categorias y productos con toggle activo/inactivo |
| og2a01XZDm.png | Checkout publico — resumen final del pedido (variante de Kkb0SeLyow) |
| pDwZCqpSCx.png | Checkout publico — paso de datos del cliente, version reducida |
| ueGC8UtoQL.png | Landing publica — hero principal con mockup de WhatsApp |
| yUNqmpAYzx.png | Dashboard — Ajustes, pestana Configuracion (numero WhatsApp, direccion, metodos de pago, tipo de servicio, precio despacho) |
| yZIL6uMi0f.png | Landing publica — seccion comparativa "sin Pedifast vs con Pedifast" mostrando el pedido estructurado en WhatsApp |
| ye5m4jwjjy.png | Onboarding del negocio — paso 2 de 3, configuracion del local (ubicacion en mapa, WhatsApp de recepcion, zona de despacho) |

---

## Patrones observados en capturas (confirmado visualmente)

### Dashboard administrativo

**Navegacion lateral**
[CONFIRMADO POR CAPTURA] Sidebar izquierdo fijo con 4 items: Inicio, Pedidos, Menu, Ajustes. El logo y nombre del local aparecen en la parte superior del sidebar. En la parte inferior hay accesos directos: "Ver mi carta" y "Cerrar sesion".

[CONFIRMADO POR CAPTURA] El nombre del local muestra un indicador de estado en linea ("En linea" en verde) directamente debajo del nombre en el sidebar. Esto permite al operador ver el estado sin navegar a otra seccion.

[CONFIRMADO POR CAPTURA] El sidebar es colapsable (hay un boton de colapso visible en la esquina superior derecha del sidebar).

**Pantalla Inicio (resumen operativo)**
[CONFIRMADO POR CAPTURA] Cuatro acciones rapidas en la parte superior del dashboard: "Copiar carta" (boton primario naranja), "Estado: Abierto", "Abrir - Recibes pedidos", "Cerrar - No recibes pedidos", "Auto - Segun tus horarios". Estos son controles de estado del local accesibles desde el home.

[CONFIRMADO POR CAPTURA] Cuatro tarjetas de metricas en fila: Pedidos hoy, Ingresos del mes, Ticket promedio, En preparacion. Cada una con numero grande como valor principal y texto secundario de contexto.

[CONFIRMADO POR CAPTURA] Grafico de barras de pedidos de los ultimos 7 dias con dias de la semana como eje X.

[CONFIRMADO POR CAPTURA] Dos bloques de analisis basico: "Mas vendidos del mes" con barra de progreso por producto, y "Hora con mas pedidos" con grafico de distribucion horaria.

[CONFIRMADO POR CAPTURA] Seccion "Pedidos recientes" al final del home con nombre del cliente, cantidad de productos, tiempo relativo y precio con estado. Tiene enlace "Ver todos".

**Seccion Menu (dashboard)**
[CONFIRMADO POR CAPTURA] Layout de dos columnas: columna izquierda con lista de categorias (nombre + contador de productos), columna derecha con lista de productos de la categoria seleccionada.

[CONFIRMADO POR CAPTURA] Cada producto en la lista muestra: imagen miniatura, nombre, descripcion corta, precio en naranja, toggle de activo/inactivo, boton de edicion (lapiz) y boton de eliminar (X).

[CONFIRMADO POR CAPTURA] Boton "+ Producto" en la esquina superior derecha de la lista de productos. Boton "+ Categoria" al final de la lista de categorias.

[CONFIRMADO POR CAPTURA] Tabs en la parte superior: "Productos" y "Promos", lo que indica soporte para promociones separado del menu regular.

**Seccion Ajustes — Configuracion**
[CONFIRMADO POR CAPTURA] Pestanas horizontales dentro de Ajustes: Branding, Configuracion, Horarios, WhatsApp, Suscripcion.

[CONFIRMADO POR CAPTURA] En Configuracion: campo de numero de WhatsApp con selector de codigo de pais, campo de direccion del local con geocodificacion automatica (muestra coordenadas guardadas), seleccion de metodos de pago activos como toggle cards (Efectivo, Transferencia, WebPay/Transbank, MercadoPago), seleccion del tipo de servicio (Delivery / Retiro / Ambos) como opciones exclusivas, seleccion del precio de despacho (Gratis / Tarifa fija / Por zonas).

**Seccion Ajustes — Horarios**
[CONFIRMADO POR CAPTURA] Banner de estado actual ("Abierto ahora — Control manual activado") con tres botones de accion inmediata: "Abrir ahora", "Por horario", "Cerrar ahora".

[CONFIRMADO POR CAPTURA] Tabla de horario semanal con un toggle on/off por dia y campos "Desde" — "Hasta" para cada dia de la semana (Lunes a Domingo).

[CONFIRMADO POR CAPTURA] Accesos rapidos para configurar el horario: "Copiar lunes a todos", "Horario comercial (9-22)", "24/7".

**Seccion Ajustes — WhatsApp**
[CONFIRMADO POR CAPTURA] Campo con el link del local para compartir, con boton de copia directa y boton "Abrir".

[CONFIRMADO POR CAPTURA] Plantilla de auto-respuesta para WhatsApp Business editable con boton "Copiar mensaje". La plantilla incluye saludo, link del local y CTA.

[CONFIRMADO POR CAPTURA] Instrucciones paso a paso numeradas para configurar el mensaje de bienvenida en WhatsApp Business (4 pasos con acciones concretas).

### Menu publico del local (frontend cliente)

**Header del local**
[CONFIRMADO POR CAPTURA] Header con fondo de color de marca, logo/avatar del local, nombre del local en grande, descripcion breve, indicador de estado (abierto/cerrado), y etiquetas de tipo de entrega disponible (Despacho a domicilio, Retiro en local, Pago en efectivo, etc.).

[CONFIRMADO POR CAPTURA] Navegacion de categorias como tabs horizontales con scroll, visibles debajo del header. Permite saltar directamente a una categoria del menu.

**Grid de productos**
[CONFIRMADO POR CAPTURA] Products mostrados en grid de cards. Cada card tiene imagen del producto, nombre, precio y boton de agregar (+). La seccion "Destacados" aparece primero con cards mas grandes.

[CONFIRMADO POR CAPTURA] Las categorias se repiten como titulos de seccion con enlace "Ver todos" al costado, dentro del scroll vertical del menu.

**Carrito lateral (sidebar)**
[CONFIRMADO POR CAPTURA] El carrito aparece como un panel lateral a la derecha en desktop. Muestra titulo "Tu pedido", contador de items, lista de productos con controles de cantidad (+/-) y precio, y boton de accion principal ("Continuar").

[CONFIRMADO POR CAPTURA] El carrito vacio muestra un estado empty con ilustracion y texto explicativo.

### Checkout publico (flujo de pedido)

**Indicador de progreso**
[CONFIRMADO POR CAPTURA] Barra de progreso por pasos visible en la parte superior del panel de checkout. Los pasos completados se muestran en color solido, el paso actual destacado, los pendientes en gris.

**Paso: Datos del cliente**
[CONFIRMADO POR CAPTURA] Pantalla dedicada con pregunta directa al cliente ("A nombre de quien va el pedido?"). Campos: Nombre (texto) y Telefono (con selector de codigo de pais). Boton "Continuar" al final.

**Paso: Tipo de entrega y metodo de pago**
[CONFIRMADO POR CAPTURA] Seleccion de tipo de entrega como dos opciones visuales tipo card con icono: "Despacho" y "Retiro en local". La opcion seleccionada tiene borde destacado y checkmark.

[CONFIRMADO POR CAPTURA] Seleccion de metodo de pago como lista de opciones con radio button: Efectivo, Transferencia, Pago online.

[CONFIRMADO POR CAPTURA] Total visible al pie del paso como barra fija antes del boton de accion. Boton "Ver resumen del pedido".

**Paso: Resumen final**
[CONFIRMADO POR CAPTURA] Pantalla de resumen con titulo "Revisa tu pedido". Muestra lista de productos con controles de cantidad, datos del cliente (nombre, telefono), tipo de entrega y metodo de pago. Total destacado en grande.

[CONFIRMADO POR CAPTURA] Aviso explicativo del paso final: "Ultimo paso: enviar el mensaje. Se abrira WhatsApp con tu pedido escrito. Solo toca el boton verde de enviar para que el local reciba tu pedido."

[CONFIRMADO POR CAPTURA] Boton final: "Abrir WhatsApp para enviar" con icono de WhatsApp, en color verde.

### Onboarding del negocio

**Flujo de 3 pasos**
[CONFIRMADO POR CAPTURA] Onboarding estructurado en 3 pasos con navegacion lateral izquierda: 1. Tu marca (nombre, logo, colores), 2. Tu local (ubicacion, pagos, despacho), 3. Tu carta (productos y categorias).

[CONFIRMADO POR CAPTURA] Paso 1 incluye: campo de nombre del local, subida de logo (PNG/JPG/SVG max 2MB), seleccion de paleta de colores predefinidos (5-6 opciones con nombre: Pedifast, Cafe, Carmel, Mostaza, Bosque, Oceano) y campos de color primario y secundario con codigo hex editable.

[CONFIRMADO POR CAPTURA] El paso 1 tiene una preview en vivo del telefono a la derecha que se actualiza en tiempo real segun los cambios del formulario.

[CONFIRMADO POR CAPTURA] Paso 2 incluye: campo de numero de WhatsApp de recepcion de pedidos, mapa interactivo para marcar la ubicacion del local y configurar zona de despacho, campo de direccion.

[CONFIRMADO POR CAPTURA] Pantalla final del onboarding muestra el link del local listo para compartir, instrucciones para configurar WhatsApp Business y boton "Ir al dashboard".

---

## Patrones que propongo adaptar para EasyOrder

**1. Sidebar de 4 items con estado del local visible**
[CONFIRMADO POR CAPTURA] El sidebar de Inicio / Pedidos / Menu / Ajustes es suficiente para el MVP. No hace falta mas que eso en la primera version. El indicador de estado en el nombre del local evita que el operador tenga que navegar para saber si esta abierto.
Adaptacion para EasyOrder: replicar este modelo exacto para el MVP, agregando unicamente la seccion Clientes si queda en scope.

**2. Controles de estado del local en el home del dashboard**
[CONFIRMADO POR CAPTURA] Tener los botones Abrir / Cerrar / Por horario en el home acelera la operacion diaria. El operador abre el panel y lo primero que ve es si el local esta recibiendo pedidos.
Adaptacion para EasyOrder: implementar estos controles como acciones primarias del home, mapeadas al campo `is_open` y al modo `auto` de la tabla `businesses`.

**3. Cuatro metricas clave en tarjetas**
[CONFIRMADO POR CAPTURA] Pedidos hoy, Ingresos del mes, Ticket promedio, En preparacion. Son exactamente las metricas accionables que necesita un operador de comida rapida. Sin sobrediseno.
Adaptacion para EasyOrder: estas cuatro metricas son el MVP exacto de la seccion de metricas. Se calculan desde la tabla `orders` con filtros por `business_id` y rango de fecha.

**4. Carrito lateral en desktop, sheet en mobile**
[CONFIRMADO POR CAPTURA] El carrito como sidebar en desktop es el patron correcto: el cliente ve el menu y el pedido al mismo tiempo sin cambiar de pantalla.
Adaptacion para EasyOrder: en mobile el carrito debe ser un bottom sheet o una pantalla separada accesible desde un boton flotante con contador de items. En desktop, sidebar fijo.

**5. Checkout en panel lateral sobre el menu**
[CONFIRMADO POR CAPTURA] El checkout no reemplaza la pantalla completa: aparece como un panel a la derecha sobre el fondo del menu, que queda oscurecido. Esto mantiene el contexto visual del local y reduce la sensacion de abandono del flujo.
Adaptacion para EasyOrder: usar este patron de panel deslizante desde la derecha para el checkout completo en mobile y desktop.

**6. Indicador de pasos en el checkout**
[CONFIRMADO POR CAPTURA] La barra de progreso de pasos reduce la ansiedad del usuario al mostrar cuanto falta para completar el pedido.
Adaptacion para EasyOrder: implementar indicador de 3 pasos: Datos > Despacho y Pago > Confirmar. El paso activo destacado, los completados con checkmark.

**7. Seleccion de tipo de entrega como cards visuales**
[CONFIRMADO POR CAPTURA] Las opciones Despacho / Retiro como cards con icono grande son mas claras que un radio button de texto.
Adaptacion para EasyOrder: usar este patron manteniendo la regla de negocio: si el cliente selecciona Retiro, el paso de direccion no aparece. Si selecciona Despacho, se agrega el paso de direccion y validacion de zona.

**8. Boton final en verde con icono de WhatsApp**
[CONFIRMADO POR CAPTURA] El boton "Abrir WhatsApp para enviar" en verde con icono de WhatsApp es el CTA correcto para este tipo de flujo. El cliente entiende exactamente que va a pasar.
Adaptacion para EasyOrder: usar este boton identico en la pantalla de confirmacion. El mensaje pre-armado ya debe estar completo en ese punto, el cliente solo lo envia.

**9. Layout del menu administrativo en dos columnas (categorias + productos)**
[CONFIRMADO POR CAPTURA] La columna de categorias a la izquierda como navegacion y los productos de la categoria seleccionada a la derecha es el patron mas eficiente para editar un menu.
Adaptacion para EasyOrder: replicar este layout con soporte para reordenar categorias por drag-and-drop y toggle de visibilidad por producto.

**10. Onboarding de 3 pasos con preview en vivo**
[CONFIRMADO POR CAPTURA] El onboarding guiado con preview del telefono en tiempo real en el paso de branding reduce la barrera de entrada para locales sin experiencia tecnica.
Adaptacion para EasyOrder: implementar un onboarding similar para nuevos locales: Marca > Local y configuracion > Carta. La preview en vivo es un detalle de alto impacto para la percepcion de calidad del producto.

**11. Horarios con control manual + tabla semanal**
[CONFIRMADO POR CAPTURA] El patron de control manual (Abrir ahora / Cerrar ahora) mas horario semanal configurable es exactamente lo que necesita un local. El control manual permite sobrescribir el horario para dias especiales sin borrar la configuracion regular.
Adaptacion para EasyOrder: mapear a los campos `opening_hours` de la tabla `businesses` mas un flag de override manual (`manual_override`, `is_open`).

---

## Patrones que NO aplican a EasyOrder

**1. Seleccion de metodo de pago en el paso de despacho sin validacion previa del tipo**
[CONFIRMADO POR CAPTURA] En Pedifast, el metodo de pago aparece en el mismo paso que el tipo de entrega, sin validar primero si aplica delivery. En EasyOrder la regla es: si se elige delivery, primero se valida zona y minimo antes de llegar al paso de pago.
Por que no aplica: si el cliente selecciona delivery y no esta en zona o no llega al minimo, no puede avanzar al pago. El orden de los pasos debe ser: Datos > Tipo de entrega (+ direccion si aplica + validacion de zona) > Pago > Confirmar. No se puede comprimir tipo de entrega y pago en un mismo paso.

**2. Confirmar pedido sin pasar por el paso de pago**
[INFERIDO] En la captura de resumen (Kkb0SeLyow.png), el flujo muestra el boton de WhatsApp directamente. No es claro si se puede saltar el paso de pago.
Por que no aplica: en EasyOrder la regla es explicita: no confirmar un pedido sin pasar por Pago. La pantalla de resumen solo debe ser accesible si el metodo de pago fue seleccionado en el paso anterior.

**3. Campo de telefono con codigo de pais internacional por defecto**
[CONFIRMADO POR CAPTURA] Pedifast usa selector de codigo de pais con ES +34 como default (orientado a Espana).
Por que no aplica directamente: EasyOrder opera en Chile. El default debe ser CL +56. El componente es reutilizable pero el default debe configurarse por pais del negocio.

**4. Planes de precio publicos en la landing del SaaS**
[CONFIRMADO POR CAPTURA] Pedifast muestra sus planes en la landing publica (LOCAL US$19, NEGOCIO US$47, PRO US$100).
Por que no aplica en este contexto: EasyOrder en MVP opera con un solo cliente (La Isla Pizzeria). La landing publica del SaaS y los planes de membresia no son parte del MVP del frontend publico del local ni del dashboard operativo. Es un modulo post-MVP.

**5. Seccion "Promos" en el menu del dashboard**
[CONFIRMADO POR CAPTURA] El dashboard de Pedifast tiene una pestana "Promos" separada dentro del menu.
Por que no aplica en MVP: EasyOrder no tiene un sistema de promociones implementado en el backend actual. Agregar esta seccion en el frontend sin backend seria inutil. Es post-MVP.

**6. Exportacion de pedidos en CSV y PDF**
[INFERIDO desde captura de planes] Se menciona en el plan NEGOCIO como feature.
Por que no aplica en MVP: el dashboard MVP no necesita exportacion. Los pedidos llegan por WhatsApp y se gestionan en el panel. La exportacion es una necesidad de escala, no del primer local.

---

## Recomendaciones propias (no observadas en capturas)

**1. Estado del pedido visible para el cliente despues de enviar por WhatsApp**
[RECOMENDACION PROPIA] Pedifast termina el flujo del cliente en el boton de WhatsApp. No hay pantalla de seguimiento del estado del pedido. Para EasyOrder, una vez enviado el pedido, mostrar una pantalla de confirmacion con numero de pedido y estado actual (Recibido > En preparacion > Listo para retiro/En camino) agrega valor real al cliente sin requerir app.
Dependencia: requiere endpoint de consulta de estado por `order_id` o `phone`.

**2. Bloqueo claro del menu cuando el local esta cerrado**
[RECOMENDACION PROPIA] No se observo en las capturas un estado de menu cerrado para el cliente. EasyOrder debe mostrar una pantalla o banner claro cuando el local esta cerrado, indicando el proximo horario de apertura. No debe permitir agregar al carrito si el local esta cerrado.
Dependencia: logica de horario ya existe en el backend n8n; debe exponerse via API al frontend.

**3. Validacion visible del minimo de delivery antes de llegar al checkout**
[RECOMENDACION PROPIA] Si el cliente elige delivery y el carrito no alcanza el minimo, mostrar un aviso inline en el carrito ("Te faltan $X para llegar al minimo de delivery") en lugar de bloquear al final del checkout. Esto reduce abandono y orienta al cliente a agregar mas productos.
Dependencia: el minimo de delivery existe en la configuracion del negocio (`delivery_min_order` en la tabla `businesses` o equivalente).

**4. Direccion de delivery guardada para clientes recurrentes**
[RECOMENDACION PROPIA] Si el cliente ya hizo un pedido anterior con su numero de telefono, pre-cargar su ultima direccion de delivery en el campo de direccion del checkout. Reduccion de friccion directa.
Dependencia: tabla `customers` con `address` ya existe en el esquema actual.

**5. Indicador de tiempo estimado en la confirmacion**
[RECOMENDACION PROPIA] Despues de enviar el pedido, mostrar el tiempo estimado de preparacion o delivery configurado por el local. Gestiona expectativas sin requerir mensajes adicionales por WhatsApp.
Dependencia: campo `tiempo_estimado` ya existe en el flujo de delivery del agente n8n.

**6. Acceso directo al menu desde el dashboard sin salir del panel**
[RECOMENDACION PROPIA] El link "Ver mi carta" en el sidebar de Pedifast es un buen patron, pero deberia abrirse en una pestana nueva para no interrumpir el flujo de trabajo del operador. En EasyOrder, el link al menu publico debe estar visible pero abrirse siempre en nueva pestana.

**7. Notificacion sonora y visual de pedido nuevo en el dashboard**
[INFERIDO desde descripcion de planes de Pedifast] Se menciona "Notificacion con sonido en cada pedido" como feature del plan LOCAL. No se ve implementado en las capturas.
Recomendacion para EasyOrder: implementar via WebSocket o polling corto. Cuando llega un pedido nuevo, mostrar un toast con el nombre del cliente y el total, y reproducir un sonido. Esto es critico para operacion en tiempo real y debe estar en el MVP del dashboard.

**8. Separacion clara entre configuracion del local y configuracion de la cuenta**
[RECOMENDACION PROPIA] En Pedifast todo esta bajo "Ajustes". En EasyOrder, dado que es multi-tenant, debe haber distincion entre: configuracion del local (branding, horarios, despacho, pagos) y configuracion de la cuenta (usuarios, suscripcion, facturacion). Esto evita confusion cuando el mismo usuario administra mas de un local.

**9. Confirmacion explicita antes de cambiar el tipo de despacho en el checkout**
[RECOMENDACION PROPIA] Si el cliente ya tiene items en el carrito y cambia de Retiro a Delivery (o viceversa), mostrar un dialogo de confirmacion que advierta el cambio de condiciones (minimo, costo de envio). No hacer el cambio silenciosamente.
Dependencia: regla de negocio existente: "No cambiar delivery a retiro sin confirmacion explicita".

**10. Pantalla de menu sin items agrega prompt de onboarding**
[RECOMENDACION PROPIA] Si el local aun no tiene productos cargados, la pantalla de menu en el dashboard debe mostrar un estado vacio con CTA directo para agregar la primera categoria y el primer producto, en lugar de una tabla vacia sin contexto.
