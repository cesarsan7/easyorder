# Auditoría de Datos Semilla — EasyOrder MVP

Fuente: `docs/db/DML_restaurante_mvp.sql`
Fecha de auditoría: 2026-04-20

---

## Datos del restaurante actual

### Tabla `restaurante`

| Campo | Valor |
|---|---|
| id | 1 (implícito por secuencia) |
| nombre | La Isla |
| dirección | Tarragon 22 Arrecife |
| coordenadas | lat -33.4372, long -70.6506 |
| teléfono | +56912345678 |
| zona_horaria | Atlantic/Canary |
| radio_cobertura_km | 5.00 |
| tarifa_envio_tipo | fija |
| tarifa_envio_valor | 2500.00 |
| moneda | € |
| created_at | 2026-03-27 19:22:35 |
| datos_bancarios | NULL |

**Inconsistencia detectada:** las coordenadas corresponden a Santiago de Chile (lat -33, long -70), pero la dirección, el código postal y las zonas de delivery apuntan a Arrecife, Lanzarote, Canarias.

### Tabla `restaurante_config`

| config_key | config_value | descripción |
|---|---|---|
| modify_window_minutes | 10 | Ventana para modificar pedido confirmado |
| cart_expiry_minutes | 60 | Minutos hasta expirar carrito activo |
| timezone | America/New_York | Zona horaria del restaurante |
| tax_rate | 0.00 | Porcentaje de impuesto |
| estimated_time_pickup | 30 | Tiempo en minutos para retiro |
| estimated_time_delivery | 50 | Tiempo en minutos para delivery |
| pickup_eta_minutes | 20 | ETA por defecto retiro |
| delivery_eta_min_minutes | 30 | ETA mínimo delivery |
| delivery_eta_max_minutes | 45 | ETA máximo delivery |

**Inconsistencia detectada:** `timezone` está configurada como `America/New_York`, que contradice tanto `Atlantic/Canary` del campo `zona_horaria` de la tabla `restaurante` como la ubicación real del negocio.

### Tabla `config_operativa`

| Campo | Valor |
|---|---|
| restaurante_id | 1 |
| tiempo_espera_minutos | 35 |
| mensaje_tiempo_espera | Tu pedido estará listo en aproximadamente 35 minutos. |

---

## Configuración del menú

### Categorías (`menu_category`) — 12 registros

| id | nombre | sort_order | activa |
|---|---|---|---|
| 1 | Pizzas | 1 | true |
| 2 | Hamburguesas | 2 | true |
| 3 | Entradas | 3 | true |
| 4 | Bebidas | 4 | true |
| 5 | Postres | 5 | true |
| 6 | Panes | 2 | true |
| 7 | Ensaladas | 3 | true |
| 8 | Entrantes | 4 | true |
| 9 | Pescados | 5 | true |
| 10 | Papas | 6 | true |
| 11 | Carnes | 7 | true |
| 12 | Pastas | 8 | true |

**Observación:** los `sort_order` de las categorías 1–5 y 6–12 se solapan (hay dos categorías con sort_order 2, dos con 3, etc.). Las primeras cinco categorías parecen ser de una carga anterior y las siete restantes de una carga posterior.

### Productos (`menu_item`) — 105 registros

#### Pizzas (cat 1) — 31 productos
Margarita, Pepperoni, Cuatro Quesos, Barbacoa Pollo, Vegana Suprema, Tropical, Vegetariana, Al Tono, Coloseo, Diabola, La Graciosa, Alegranza, Lanzarote, Puerto Calero, 4 Quesos, 4 Estaciones, Caprichosa, Calzone, Marinera, Frutti di Mare, Especial de la Casa, Volcan, Barbacoa, Pollo, Italiana, Montaña Clara, Gran Canaria, Fuerteventura, Carbonara, La Isla (pizza), Cavernicola.

Todos tienen `is_pizza = true`. Los primeros 5 tienen tags (`veg`, `clasica`, `vegana`, `glutenfree`, `sin-cerdo`). Los 26 posteriores no tienen tags.

#### Hamburguesas (cat 2) — 4 productos
Clásica, BBQ Bacon, Doble Veggie, Pollo Crispy.

#### Entradas (cat 3) — 4 productos
Papas Fritas, Aros de Cebolla, Alitas BBQ, Mozzarella Sticks.

**Observación:** existe duplicidad conceptual con la categoría Papas (cat 10) y Entrantes (cat 8).

#### Bebidas (cat 4) — 10 productos
Refresco (lata), Agua Mineral, Refrescos 33c, Refrescos 1.5L, Cerveza Tropical, Agua 1.5L, Zumo Bio Fruta Tropical, Postobon manzana, Postobon colombiana, Postobon uva.

**Observación:** hay solapamiento entre "Refresco" y "Refrescos 33c", y entre "Agua Mineral" y "Agua 1.5L". Son registros de dos cargas distintas.

#### Postres (cat 5) — 1 producto
Brownie con Helado.

#### Panes (cat 6) — 8 productos
Pan de ajo, Pan de ajo con tomate, Pan con queso, Pan de ajo con queso y tomate natural, Pan de ajo con queso y chorizo picante, Pan de ajo con queso y jamon, Pan de ajo con roquefort, Pan Frutti (Atún, cangrejo, queso, gambas).

#### Ensaladas (cat 7) — 6 productos
Ensalada La isla, Ensalada Atún, Ensalada Pollo, Ensalada Frutos del mar, Coctel de gambas, Ensalada César.

#### Entrantes (cat 8) — 9 productos
Gambas al ajillo, Datiles con bacon, Queso frito con salsa de arándanos (7 unid), Nuggets de pollo (8 unids), Tequeños de queso con salsa de arándanos (6 unid), Palitos de mozarella (8 unid), Ración de nachos con queso/carne mechada/jalapeños/guacamole, Alitas Broaster (8 unid), Alitas Barbacoa (8 unid).

#### Pescados (cat 9) — 4 productos
Matrimonio (calamares y pescado rebozado), Pescado a la plancha con ajo y perejil, Calamares a la romana, Pescado rebozado. Todos con descripción "Servido con ensalada y papas fritas".

#### Papas (cat 10) — 7 productos
Papas fritas, Papas fritas con Queso, Papas fritas con salchichas, Papas gajo, Papas Americanas, Papas la isla, Salsa a elegir (unidad a parte).

#### Carnes (cat 11) — 15 productos
Entrecort a la plancha, Entrecort a la cebolla, Entrecort con salsa de champiñones, Entrecort con salsa pimienta, Escalope empanado, Escalope la romana, Escalope en salsa champiñones, Escalope en salsa pimienta, Pechuga de pollo empanada, Pechuga de pollo a la plancha, Pechuga de pollo a la plancha con ajo y perejil, Pechuga de pollo empanada en salsa de champiñones, Pechuga de pollo empanada en salsa de pimienta, Pechuga de pollo en salsa especial, Salsa a elegir (Champiñones/Mexicana/Pimienta/Roquefort), Salsa especial con gambas, Salsa aparte.

**Observación:** "Salsa a elegir", "Salsa especial con gambas" y "Salsa aparte" son ítems de modificador insertados como productos independientes.

#### Pastas (cat 12) — 4 productos
Lasaña de carne, Espaguetis Napolitana, Espaguetis a ajillo (gambas, ajo, perejil y guindilla), Espaguetis con una salsa a elegir (Carbonara, Boloñesa, Frutti di mari, Maremonti).

### Variantes (`menu_variant`) — 105 registros

- **Pizzas (items 1–5):** 3 variantes cada una: Personal 25cm, Mediana 32cm, Familiar 45cm. Con SKU definido (ej: `PIZ-MAR-PER`).
- **Hamburguesas (items 6–9):** 1 variante "Estándar" cada una. Con SKU definido (ej: `BUR-CLA-STD`).
- **Entradas originales (items 10–13):** variantes con nombre descriptivo (Ración, Ración Grande, lata/botella). Con SKU definido.
- **Bebidas originales (items 14–15):** variantes por tamaño. Con SKU definido.
- **Postre (item 16):** 1 variante "Ración Individual". Con SKU.
- **Todos los productos de la segunda carga (items 17–105):** 1 variante "Única" cada una. Sin SKU (NULL).

**Observación:** item 1 (Margarita) tiene 4 variantes: Personal, Mediana, Familiar (carga 1) más "Única" (carga 2). Item 2 (Pepperoni) también tiene una variante "Única" duplicada de la segunda carga. Esto puede causar comportamiento ambiguo si la lógica elige la variante `is_default=true`.

### Extras (`extra`) — 12 registros

| id | nombre | precio | alérgenos | activo |
|---|---|---|---|---|
| 1 | Extra Queso Mozzarella | 1.50 | lactosa | true |
| 2 | Extra Pepperoni | 1.80 | — | true |
| 3 | Extra Bacon | 1.80 | — | true |
| 4 | Extra Aguacate | 1.50 | — | true |
| 5 | Doble Carne | 2.50 | — | true |
| 6 | Salsa Especial de la Casa | 0.80 | — | true |
| 7 | Queso Cheddar Extra | 1.50 | lactosa | true |
| 8 | Jalapeños | 0.80 | — | true |
| 9 | Champiñones | 1.00 | — | true |
| 10 | Sin Cebolla | 0.00 | — | true |
| 11 | Sin Gluten (base) | 2.00 | gluten-trazas | true |
| 12 | Salsa BBQ Extra | 0.80 | — | true |

### Asociaciones extras-productos (`menu_item_extra`)

Los extras están asociados solo a los primeros 13 productos (carga 1). Los 92 productos de la segunda carga no tienen extras asociados.

Detalle por producto:
- Item 1 (Margarita): extras 1, 2, 9, 11
- Item 2 (Pepperoni): extras 1, 2, 3, 8, 11
- Item 3 (Cuatro Quesos): extras 1, 9, 11
- Item 4 (Barbacoa Pollo): extras 1, 12, 8, 11
- Item 5 (Vegana Suprema): extras 9, 11
- Item 6 (Clásica): extras 3, 4, 5, 6, 10
- Item 7 (BBQ Bacon): extras 3, 5, 7, 8, 12
- Item 8 (Doble Veggie): extras 4, 9, 6
- Item 9 (Pollo Crispy): extras 7, 6, 8, 10
- Item 10 (Papas Fritas): extras 6, 8
- Item 12 (Alitas BBQ): extras 12, 8
- Item 13 (Mozzarella Sticks): extra 1

---

## Horarios configurados

### Tabla `horarios` — 7 registros (todos activos)

| día | turno 1 | turno 2 |
|---|---|---|
| Lunes | 12:00 – 15:30 | 19:00 – 23:00 |
| Martes | 12:00 – 15:30 | 19:00 – 23:00 |
| Miércoles | 12:00 – 15:30 | 19:00 – 23:00 |
| Jueves | 12:00 – 15:30 | 19:00 – 23:00 |
| Viernes | 12:00 – 15:30 | 19:00 – 23:30 |
| Sábado | 12:00 – 16:00 | 19:00 – 23:30 |
| Domingo | 12:00 – 16:00 | 19:00 – 22:00 |

Todos los días tienen `disponible = true`. La estructura soporta dos turnos por día (apertura_1/cierre_1, apertura_2/cierre_2).

---

## Zonas de delivery

### Tabla `delivery_zone` — 3 registros

| código postal | zona | tarifa | pedido mínimo | tiempo estimado | activa |
|---|---|---|---|---|---|
| 35500 | ARRECIFE | €2.50 | €20.00 | 30–45 min | true |
| 3509 | PLAYA HONDA | €1.30 | €20.00 | 30–45 min | true |
| 35571 | TAICHE | €3.60 | €20.00 | 30–45 min | true |

**Observación:** el código postal de PLAYA HONDA aparece como `3509` (4 dígitos), que puede ser un error tipográfico. Los códigos postales de Lanzaras son de 5 dígitos (35xxx).

El pedido mínimo es €20.00 en las tres zonas. El tiempo estimado es idéntico (30–45 min) independientemente de la zona.

---

## FAQs

### Tabla `faqs`

Hay 6 preguntas únicas definidas para el restaurante 1. Sin embargo, en el DML existen **18 registros** porque las 6 preguntas fueron insertadas 3 veces en lotes separados.

| orden | pregunta |
|---|---|
| 1 | ¿Cuál es la dirección del local? |
| 2 | ¿Hacen delivery? |
| 3 | ¿Cuáles son los métodos de pago? |
| 4 | ¿Tienen opciones vegetarianas? |
| 5 | ¿Cuánto demora el delivery? |
| 6 | ¿Tienen promociones? |

Las respuestas hacen referencia a datos de Santiago de Chile ("Av. Italia 1234, Providencia, Santiago", "2 cuadras del Metro Los Leones", "radio de 5 km", "costo de envío $2.500") que no corresponden al negocio actual en Arrecife, Lanzarote.

---

## Datos de prueba existentes

### Tabla `pedidos` — 6 registros

Todos asociados a `restaurante_id = 1` y `usuario_id = 3`. Representan el flujo completo del sistema:

| pedido_codigo | tipo_despacho | estado | total | método pago |
|---|---|---|---|---|
| 260419-1001 | NULL | en_curso | 20.40 | NULL |
| 260419-1002 | retiro | en_curso | 45.00 | efectivo |
| 260419-1003 | NULL | confirmado | 20.50 | efectivo |
| 260419-1004 | delivery | confirmado | 25.90 | efectivo |
| 260419-1005 | delivery | pendiente_pago | 27.10 | transferencia |
| 260419-1006 | retiro | pendiente_pago | 18.20 | transferencia |

### Tabla `usuarios` — 3 registros

Todos asociados a `restaurante_id = 1`:

| id | teléfono | nombre | dirección frecuente |
|---|---|---|---|
| 1 | +56912345678 | Carlos | NULL |
| 2 | +56937569677 | Carlos | NULL |
| 3 | +15162849708 | Augusto Gutierrez | Calle de Agustín Millares Sall, 1 35571 taiche Las Palmas, Spain |

---

## Observaciones para multi-tenant

### Asociación explícita por `restaurante_id`

Todas las tablas del modelo contienen `restaurante_id` como columna explícita. No hay datos implícitos ni globales. El esquema ya está preparado para multi-tenant a nivel de datos.

Tablas con `restaurante_id` explícito confirmado en el DML:

| tabla | restaurante_id presente |
|---|---|
| restaurante | sí (id = 1) |
| restaurante_config | sí |
| config_operativa | sí |
| delivery_zone | sí |
| extra | sí |
| faqs | sí |
| horarios | sí |
| menu_category | sí |
| menu_item | sí |
| menu_variant | sí |
| pedidos | sí |
| usuarios | sí |

La tabla `menu_item_extra` no tiene `restaurante_id` propio: es una tabla de unión entre `menu_item` y `extra`, ambas con `restaurante_id`. El aislamiento queda garantizado transitivamente.

### Backfill necesario para nuevos tenants

Para incorporar un segundo restaurante no se requiere backfill de datos existentes. Los datos actuales ya tienen `restaurante_id = 1` de forma consistente. El trabajo para un nuevo tenant consiste en insertar registros nuevos con `restaurante_id = N`.

### Inconsistencias que afectarían multi-tenant

1. **FAQs duplicadas (×3):** antes de escalar, conviene limpiar los 12 registros duplicados del restaurante 1.
2. **sort_order solapados en `menu_category`:** las categorías 1–5 (carga original) y 6–12 (carga posterior) comparten valores de sort_order. Sin una limpieza, el orden visual del menú será ambiguo.
3. **Variante "Única" duplicada en items 1 y 2:** Margarita y Pepperoni tienen la variante `is_default=true` de la carga 1 más una variante "Única" también `is_default=true` de la carga 2. Existe un conflicto de unicidad lógica.
4. **Timezone inconsistente:** `restaurante.zona_horaria = 'Atlantic/Canary'` vs `restaurante_config.timezone = 'America/New_York'`. En multi-tenant, cada restaurante necesita una sola fuente de verdad de zona horaria.
5. **Coordenadas incorrectas:** `lat/long` del restaurante apuntan a Santiago de Chile en lugar de Lanzarote.
6. **FAQs con contenido de otro local:** las respuestas mencionan dirección y precios de un local diferente. No impactan la arquitectura multi-tenant pero sí la calidad del dato semilla.
