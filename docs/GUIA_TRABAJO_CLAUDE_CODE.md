# Guía de trabajo con Claude Code — EasyOrder
## Paso a paso desde Fase 0 hasta Fase 7

> **Para quién es esta guía:** Para alguien que ya tiene Claude Code instalado y el proyecto EasyOrder en su computadora, pero quiere saber exactamente qué hacer en cada sesión de trabajo, en qué orden, con qué prompts y cómo saber que puede avanzar a la siguiente fase.
>
> **Qué NO cubre esta guía:** instalación de Claude Code, configuración del VPS, escritura de código.

---

## ANTES DE EMPEZAR — Verificación inicial

Antes de abrir Claude Code por primera vez en este proyecto, verifica estos tres puntos desde tu terminal o explorador de archivos:

### Verificación 1 — La carpeta del proyecto tiene la estructura correcta

Debes ver estos archivos y carpetas:

```
easyorder/
├── CLAUDE.md
├── .claude/
│   ├── settings.json
│   ├── settings.local.json
│   └── agents/
│       ├── saas-product-architect.md
│       ├── postgres-architect.md
│       ├── n8n-architect.md
│       ├── frontend-dashboard-builder.md
│       ├── devops-hostinger.md
│       └── qa-regression-reviewer.md
├── docs/
│   ├── business/
│   │   ├── reglas_negocio_la_isla.md
│   │   └── objetivo_MVP_EasyOrder.md
│   ├── db/
│   │   ├── DDL_restaurante_mvp.sql
│   │   └── DML_restaurante_mvp.sql
│   ├── n8n/
│   │   ├── [MVP] Apertura.json
│   │   ├── [MVP] Contexto.json
│   │   ├── [MVP] Derivar Humano.json
│   │   ├── [MVP] Despacho.json
│   │   ├── [MVP] Pago.json
│   │   ├── [MVP] Pedidos Cliente.json
│   │   ├── [MVP] Perfil Cliente.json
│   │   ├── [MVP] Pizzeria.json
│   │   └── [MVP] Preguntas.json
│   ├── infra/
│   │   ├── dominios-y-servicios.md
│   │   └── hostinger-easypanel-notes.md
│   └── captures-navegacion/
```

Si falta algún archivo, detente. No continúes hasta que esté completo.

### Verificación 2 — Crea las carpetas de trabajo que vas a necesitar

Abre tu terminal, navega a la carpeta del proyecto y ejecuta:

```bash
mkdir -p docs/audit
mkdir -p docs/design
```

Estas carpetas son donde vas a guardar los entregables de cada fase. Claude Code las va a usar para escribir los archivos de auditoría y diseño.

### Verificación 3 — Cómo abrir Claude Code en el proyecto

```bash
cd ruta/a/tu/carpeta/easyorder
claude
```

Claude Code abre en esa carpeta y carga automáticamente el `CLAUDE.md`. No necesitas pedirle que lo lea.

---

## CÓMO LEER ESTA GUÍA

Cada fase tiene esta estructura:

- **Qué es esta fase** — explicación simple de para qué sirve
- **Antes de empezar** — qué debes tener listo antes de abrir Claude Code
- **Pasos exactos** — qué hacer, en qué orden, con qué prompts exactos
- **Señal de cierre** — cómo saber que la fase está terminada y puedes avanzar

Los prompts marcados con ` ```prompt ``` ` son para copiar y pegar directamente en Claude Code.

---

---

# FASE 0 — Preparación práctica

## Qué es esta fase

Es la sesión donde verificas que Claude Code entendió bien el proyecto antes de pedirle trabajo real. Si Claude Code tiene una visión equivocada del sistema, todo lo que construya después va a estar mal. Esta fase toma 15-20 minutos y te ahorra semanas de correcciones.

## Antes de empezar

- Tienes Claude Code abierto en la carpeta del proyecto
- Ves el mensaje de bienvenida con la ruta del proyecto

## Pasos

### Paso 0.1 — Verificar que Claude Code cargó el CLAUDE.md

Escribe esto en Claude Code:

```prompt
¿Qué instrucciones tienes cargadas para este proyecto? Resume en 3 puntos 
qué es EasyOrder, cuál es el flujo operativo actual y qué tienes 
absolutamente prohibido hacer.
```

**Qué esperar:** Claude Code debe mencionar:
- EasyOrder como SaaS multi-tenant para restaurantes
- Flujo Apertura → Despacho → Pago como irrompible
- Que no debe rehacer el backend conversacional desde cero

**Si no menciona esas tres cosas:** Escribe `/clear`, cierra y vuelve a abrir Claude Code desde la carpeta del proyecto. El `CLAUDE.md` no se cargó correctamente.

---

### Paso 0.2 — Verificar que conoce la arquitectura real

```prompt
Describe el sistema que ya existe en producción para La Isla Pizzería. 
¿Qué tecnologías usa, qué subflujos tiene, qué base de datos usa 
y cómo recibe los pedidos actualmente?
```

**Qué esperar:** Debe mencionar n8n, PostgreSQL, Redis, Chatwoot/WhatsApp, los 8 subflujos (Apertura, Despacho, Pago, Perfil Cliente, Pedidos Cliente, Preguntas, Contexto, Derivar Humano) y que los pedidos llegan por WhatsApp.

**Si inventa cosas que no están en el proyecto:** Escribe esto:

```prompt
Eso no es correcto. Basa tu respuesta SOLO en lo que dice el CLAUDE.md 
del proyecto. No inventes nada que no esté documentado allí.
```

---

### Paso 0.3 — Verificar que conoce las restricciones críticas

```prompt
Dime las 5 cosas más importantes que NUNCA debes hacer en este proyecto.
```

**Qué esperar:** Debe incluir:
1. No rehacer el backend conversacional desde cero
2. No reemplazar PostgreSQL como base principal
3. No confirmar pedidos sin pasar por el paso de Pago
4. No cambiar delivery a retiro sin confirmación explícita del cliente
5. No inventar tablas o endpoints sin proponerlos explícitamente

**Si la lista está correcta:** Puedes avanzar. Esta sesión está lista.

---

### Paso 0.4 — Verificar que puede leer los archivos del proyecto

```prompt
Lee el archivo docs/business/reglas_negocio_la_isla.md y dime 
cuántas secciones tiene y cuál es la regla más crítica para el 
flujo de pago.
```

**Qué esperar:** Debe leer el archivo correctamente y mencionar que en transferencia el pedido queda como `pendiente_pago` y que no debe confirmarse sin pasar por Pago.

**Si dice que no puede leer el archivo:** Verifica que estás ejecutando Claude Code desde la carpeta raíz del proyecto (`easyorder/`), no desde una subcarpeta.

---

### Señal de cierre de Fase 0

Claude Code respondió correctamente en los 4 pasos anteriores sin inventar información ni contradecir las reglas del proyecto.

**Antes de cerrar esta sesión:** No hay entregable que guardar. Esta fase es solo verificación.

---

---

# FASE 1 — Auditoría del sistema actual

## Qué es esta fase

Es la fase más importante del proyecto. Antes de proponer cualquier cambio, Claude Code debe leer y mapear exactamente qué existe: todas las tablas, funciones SQL, y qué hace cada workflow de n8n. Sin este mapa, cualquier diseño posterior es especulativo.

Esta fase produce documentos en `docs/audit/` que todas las fases siguientes van a usar como fuente de verdad.

**Esta fase no produce código. Solo produce documentos de auditoría.**

## Antes de empezar

- Fase 0 completada exitosamente
- La carpeta `docs/audit/` ya existe

Esta fase se divide en 4 sesiones separadas. No intentes hacerlas todas en una sola sesión.

---

## SESIÓN 1.A — Auditoría de la base de datos (DDL)

Abre Claude Code. Escribe:

```prompt
Vamos a auditar la base de datos del proyecto. 
Lee este archivo completo: @docs/db/DDL_restaurante_mvp.sql

Cuando termines de leerlo, produce un documento con estas secciones:

## Inventario de tablas
Para cada tabla: nombre, propósito en una línea, columnas clave 
(PK, FKs, columnas de negocio importantes), y si tiene o necesita 
un discriminador de tenant (por ejemplo restaurant_id).

## Modelo moderno de menú
Explica cómo se relacionan: menu_category, menu_item, menu_variant, extra.
Qué representa cada una y cómo se navega del catálogo a un item con variante.

## Tabla legacy menu
¿Existe? ¿Para qué se usa? ¿Está activa o es obsoleta?

## Funciones SQL definidas
Para cada función: nombre, parámetros de entrada, qué retorna, 
propósito inferido.

## Tablas sin discriminador de tenant
Lista de tablas que necesitarían restaurant_id para soportar multi-tenant.

## Tablas globales
Tablas que no necesitan discriminador porque son compartidas entre locales.

## Observaciones de integridad
Constraints, índices únicos o relaciones que deben respetarse 
en cualquier migración futura.

Guarda este documento como docs/audit/01_auditoria_base_datos.md
No propongas cambios. Solo mapea lo que existe.
```

**Espera a que Claude Code termine.** Puede tardar 2-3 minutos porque el DDL es largo.

**Verifica:** Abre `docs/audit/01_auditoria_base_datos.md` y confirma que:
- Tiene más de 10 tablas listadas
- Tiene las funciones SQL identificadas
- Distingue entre modelo moderno de menú y tabla legacy

---

## SESIÓN 1.B — Auditoría de datos semilla (DML)

Abre Claude Code (nueva sesión o continúa). Escribe:

```prompt
Lee este archivo: @docs/db/DML_restaurante_mvp.sql

Produce un documento con estas secciones:

## Datos del restaurante actual
¿Qué datos de configuración del restaurante existen? 
Nombre, identificador, configuración básica.

## Configuración del menú
¿Qué categorías, productos, variantes y extras existen en los datos semilla?

## Horarios configurados
¿Qué horarios están cargados? ¿Qué días, qué turnos?

## Zonas de delivery
¿Qué zonas existen? ¿Qué mínimos, qué costos de envío?

## FAQs
¿Qué preguntas frecuentes están cargadas?

## Observaciones para multi-tenant
¿Los datos actuales están asociados a un restaurant_id explícito 
o es implícito? ¿Qué backfill sería necesario para asignarlos 
a un tenant específico?

Guarda como docs/audit/02_auditoria_datos_semilla.md
No propongas cambios. Solo mapea lo que existe.
```

---

## SESIÓN 1.C — Auditoría de workflows n8n

Esta sesión se repite para cada workflow. Empieza por el más crítico: el flujo principal (Pizzeria) y luego Despacho y Pago.

**Orden recomendado de lectura:**
1. `[MVP] Pizzeria.json` — el Director principal
2. `[MVP] Apertura.json`
3. `[MVP] Despacho.json`
4. `[MVP] Pago.json`
5. `[MVP] Pedidos Cliente.json`
6. `[MVP] Perfil Cliente.json`
7. `[MVP] Preguntas.json`
8. `[MVP] Contexto.json`
9. `[MVP] Derivar Humano.json`

**Usa este prompt para cada uno** (cambia el nombre del archivo):

```prompt
Lee este workflow de n8n: @docs/n8n/[MVP] Pizzeria.json

Produce un análisis con estas secciones:

## Propósito
¿Qué hace este workflow en una línea?

## Trigger y entradas
¿Cómo se activa? ¿Qué datos recibe como entrada?

## Queries SQL embebidas
Lista de todas las consultas SQL que tiene, con la tabla que toca 
y qué hace (SELECT, INSERT, UPDATE).

## Lógica condicional crítica
¿Qué condiciones toma este workflow para decidir qué hacer a continuación?

## Subflujos que llama
¿A qué otros workflows llama o delega?

## Mensajes al cliente
¿Qué mensajes genera este workflow hacia el cliente?

## Side effects sobre el pedido
¿Modifica el estado del pedido? ¿Actualiza alguna tabla?

## Riesgos si se agrega multi-tenant
¿Qué queries o lógica fallaría si no se filtra por restaurant_id?

Guarda como docs/audit/n8n_[nombre_workflow].md
Ejemplo: docs/audit/n8n_pizzeria.md
No propongas cambios. Solo mapea lo que existe.
```

**Nota:** Haz una sesión por workflow para no agotar el contexto. Entre cada sesión, escribe `/clear`.

---

## SESIÓN 1.D — Auditoría de infraestructura

```prompt
Lee estos archivos:
@docs/infra/dominios-y-servicios.md
@docs/infra/hostinger-easypanel-notes.md

Produce un documento con estas secciones:

## Servicios activos
Lista de todos los servicios que corren en el VPS, con su subdominio 
y URL interna.

## Servicios que EasyOrder puede usar sin instalar nada nuevo
¿Qué servicios ya disponibles puede aprovechar EasyOrder?

## Servicios que habría que agregar para EasyOrder
¿Qué faltaría instalar para el MVP?

## Riesgos de la infraestructura actual
¿Qué servicios son críticos y no deben tocarse?

## Preguntas pendientes de validación
Lo que no se puede responder solo con los documentos disponibles.

Guarda como docs/audit/03_auditoria_infraestructura.md
No propongas cambios todavía.
```

---

## SESIÓN 1.E — Consolidación de hallazgos

Cuando tengas todos los archivos de auditoría generados, abre una sesión nueva y escribe:

```prompt
Lee todos los documentos de auditoría:
@docs/audit/01_auditoria_base_datos.md
@docs/audit/02_auditoria_datos_semilla.md
@docs/audit/03_auditoria_infraestructura.md

(Y todos los docs/audit/n8n_*.md que hayas generado)

Produce un documento de consolidación con estas secciones:

## Brechas identificadas
¿Qué le falta al sistema actual para convertirse en un SaaS multi-tenant?
Lista puntual.

## Componentes reutilizables confirmados
¿Qué del sistema actual puede usarse directamente en EasyOrder sin cambios?

## Componentes que necesitan evolución
¿Qué existe pero necesita modificarse para soportar multi-tenant?

## Componentes nuevos necesarios
¿Qué hay que construir desde cero que no existe todavía?

## Riesgos de regresión identificados
¿Qué cambios futuros podrían romper el sistema actual si no se manejan bien?

## Preguntas que necesitan validación manual
Lo que no se puede responder sin conectarse al sistema real o consultar 
al equipo operativo.

Guarda como docs/audit/00_consolidacion_hallazgos.md
```

---

### Señal de cierre de Fase 1

Tienes estos archivos en `docs/audit/`:
- `00_consolidacion_hallazgos.md`
- `01_auditoria_base_datos.md`
- `02_auditoria_datos_semilla.md`
- `03_auditoria_infraestructura.md`
- Un archivo `n8n_*.md` por cada uno de los 9 workflows

El documento `00_consolidacion_hallazgos.md` tiene la sección de brechas con al menos 5 puntos concretos, no genéricos.

---

---

# FASE 2 — Diseño del modelo multi-tenant

## Qué es esta fase

Definir cómo va a separar EasyOrder los datos de cada local sin mezclarlos entre sí. Esta es la decisión técnica más importante del proyecto porque afecta todas las tablas, todas las queries y todos los flujos futuros.

Esta fase produce un documento de diseño en `docs/design/` que el arquitecto de base de datos y los desarrolladores usarán como referencia.

**Esta fase no produce SQL ni código. Solo produce decisiones documentadas.**

## Antes de empezar

- Fase 1 completada: tienes todos los archivos en `docs/audit/`
- Especialmente necesitas tener listo `01_auditoria_base_datos.md`

---

### Paso 2.1 — Definir la estrategia de tenant

Abre Claude Code. Escribe:

```prompt
Actúa como postgres-architect.

Lee estos documentos:
@docs/audit/01_auditoria_base_datos.md
@docs/audit/00_consolidacion_hallazgos.md
@docs/business/reglas_negocio_la_isla.md

Con base en lo que leíste, responde estas preguntas y justifica cada respuesta:

1. ¿Cuál es la estrategia correcta de multi-tenant para EasyOrder?
   Evalúa las tres opciones: 
   (a) una base de datos por tenant, 
   (b) un schema por tenant, 
   (c) una sola base con discriminador por fila (restaurant_id).
   ¿Cuál es la correcta para este proyecto y por qué?

2. ¿Las funciones SQL existentes (fn_menu_lookup, fn_menu_catalog y las demás) 
   son compatibles con la estrategia elegida o necesitan modificarse?

3. ¿Los workflows de n8n actuales pueden seguir funcionando si se agrega 
   restaurant_id como discriminador?

No propongas SQL todavía. Solo justifica la estrategia.
```

---

### Paso 2.2 — Clasificar todas las tablas

```prompt
Usando el inventario de docs/audit/01_auditoria_base_datos.md,
clasifica CADA tabla existente en una de estas tres categorías:

**Categoría A — Tenant (necesita restaurant_id):**
Tablas cuyos datos pertenecen a un local específico.

**Categoría B — Global (compartida entre todos los locales):**
Tablas que son transversales a la plataforma.

**Categoría C — Ya tiene discriminador:**
Tablas que ya tienen restaurant_id u equivalente.

Para las de Categoría A: indica si restaurant_id debe ser NOT NULL 
desde el inicio o puede ser nullable temporalmente para facilitar la migración.

Para las de Categoría B: indica por qué no necesita discriminador.

Guarda como docs/design/01_clasificacion_tablas_tenant.md
```

---

### Paso 2.3 — Definir el plan de migración conceptual

```prompt
Con base en docs/design/01_clasificacion_tablas_tenant.md,
define el plan de migración en este formato:

## Tablas que necesitan columna nueva restaurant_id
Para cada una: nombre de la tabla, tipo de columna, si es nullable 
al inicio, FK a qué tabla, y si necesita índice.

## Backfill de datos existentes
¿Qué valor de restaurant_id deben tener los datos actuales de La Isla Pizzería?
¿Cuántas tablas necesitan backfill?

## Funciones SQL que necesitan recibir restaurant_id como parámetro
Lista de funciones a modificar con su firma actual y la firma nueva propuesta.

## Queries en n8n que necesitan agregar filtro por restaurant_id
Con base en docs/audit/n8n_*.md, lista las queries que hay que actualizar.

## Orden seguro de migración
¿En qué orden deben aplicarse los cambios para no romper nada?
(primero las tablas sin dependencias, luego las que tienen FK, etc.)

## Estrategia de rollback
Si algo sale mal, ¿cómo se deshace cada paso?

Guarda como docs/design/02_plan_migracion_multitenant.md
No escribas SQL todavía. Solo el plan conceptual.
```

---

### Paso 2.4 — Diseñar la tabla businesses (o restaurants)

```prompt
EasyOrder necesita una tabla central que represente a cada local registrado 
en la plataforma (tenant raíz).

Con base en el sistema actual y el objetivo del SaaS, define el esquema 
de esa tabla. Considera:

- ¿Cómo se llama? ¿businesses, restaurants, locals, tenants?
- ¿Qué columnas necesita para el MVP?
  (nombre, slug para URL, datos de contacto, configuración básica, activo/inactivo, etc.)
- ¿Qué columnas son post-MVP?
- ¿Cómo se relaciona esta tabla con las demás que ya existen?
- ¿El restaurant_id actual de La Isla Pizzería ya existe en alguna tabla 
  o hay que crearlo?

Guarda la propuesta en docs/design/03_tabla_businesses.md
No escribas DDL SQL todavía. Solo el diseño de la tabla en prosa y una lista de columnas.
```

---

### Señal de cierre de Fase 2

Tienes en `docs/design/`:
- `01_clasificacion_tablas_tenant.md` — todas las tablas clasificadas
- `02_plan_migracion_multitenant.md` — plan de migración en orden
- `03_tabla_businesses.md` — diseño de la tabla raíz del SaaS

El plan de migración menciona explícitamente qué queries de n8n se ven afectadas.

---

---

# FASE 3 — Diseño de autenticación con Supabase Auth

## Qué es esta fase

Definir quién puede acceder al panel de administración de cada local, qué permisos tiene, y cómo eso se conecta con la base de datos del proyecto. No es la autenticación del cliente final (el que hace pedidos por WhatsApp); eso no requiere login. Es solo para los operadores del negocio.

**Esta fase no produce código. Solo produce el diseño del modelo de acceso.**

## Antes de empezar

- Fase 2 completada
- Tienes el diseño de la tabla `businesses` en `docs/design/03_tabla_businesses.md`

---

### Paso 3.1 — Definir los roles necesarios

```prompt
Actúa como saas-product-architect.

EasyOrder tiene un panel administrativo para los locales. Define los roles 
de usuario necesarios para el MVP respondiendo estas preguntas:

1. ¿Qué tipos de usuarios van a acceder al panel? 
   (dueño del local, empleado, administrador de la plataforma, etc.)

2. ¿Qué puede hacer cada rol?
   Usa esta estructura para responder:
   - Rol: [nombre]
   - Puede ver: [lista]
   - Puede editar: [lista]
   - No puede hacer: [lista]

3. ¿El cliente final (el que pide por WhatsApp) necesita autenticación web 
   en el MVP?

4. ¿Hay un superadmin de la plataforma EasyOrder que puede ver todos los locales?

Guarda como docs/design/04_roles_y_permisos.md
```

---

### Paso 3.2 — Definir la tabla de membresías

```prompt
Actúa como postgres-architect.

Lee:
@docs/design/03_tabla_businesses.md
@docs/design/04_roles_y_permisos.md

Supabase Auth crea usuarios en la tabla auth.users con un UUID.
EasyOrder necesita conectar esos usuarios de Supabase con los locales 
del sistema y sus roles.

Diseña la tabla de membresías que hace ese puente. Define:

- Nombre de la tabla
- Columnas: qué guarda, de qué tipo, si es nullable
- FK a auth.users de Supabase
- FK a la tabla businesses
- Cómo se representa el rol
- Constraints de unicidad (¿puede un usuario ser admin de dos locales?)
- Índices necesarios

No escribas SQL todavía. Solo el diseño de la tabla en prosa con lista de columnas.

Guarda como docs/design/05_tabla_membresias.md
```

---

### Paso 3.3 — Definir qué rutas del dashboard requieren auth

```prompt
Actúa como saas-product-architect.

Para el MVP de EasyOrder, define qué rutas son públicas y cuáles requieren 
autenticación:

**Rutas públicas (sin login):**
Las que cualquier persona puede ver, como el menú digital del local.

**Rutas privadas (requieren login):**
Las del panel administrativo.

**Para las rutas privadas, indica además:**
- ¿Qué rol mínimo necesita para acceder?
- ¿Puede un usuario de un local ver datos de otro local?

Usa una tabla simple: | Ruta | Pública/Privada | Rol mínimo |

Guarda como docs/design/06_rutas_y_autenticacion.md
```

---

### Señal de cierre de Fase 3

Tienes en `docs/design/`:
- `04_roles_y_permisos.md`
- `05_tabla_membresias.md`
- `06_rutas_y_autenticacion.md`

La tabla de membresías tiene FK a Supabase `auth.users` y a `businesses`, y tiene el campo de rol definido.

---

---

# FASE 4 — Diseño del frontend público por local

## Qué es esta fase

Definir exactamente qué pantallas van a existir en la parte pública de EasyOrder: el menú digital que ve el cliente cuando entra al link del restaurante. Se define el árbol de pantallas, qué datos necesita cada una, y cómo funciona el flujo de compra.

**Esta fase no produce código HTML ni componentes. Solo produce el mapa de pantallas y contratos de datos.**

## Antes de empezar

- Fase 2 y 3 completadas
- Tienes los archivos de diseño en `docs/design/`

---

### Paso 4.1 — Benchmark visual con las capturas del proyecto

```prompt
Actúa como frontend-dashboard-builder.

Revisa las capturas de docs/captures-navegacion/ como referencia visual 
de plataformas similares a EasyOrder.

Para cada captura que puedas leer, identifica:
- ¿Qué módulo o pantalla muestra?
- ¿Qué elementos de UI son visibles? (menú, carrito, categorías, etc.)
- ¿Qué patrones de navegación se observan?

Luego produce un documento con:

## Patrones observados en capturas (confirmado visualmente)
Lista de elementos de UI que ves en las capturas.

## Patrones que propongo adaptar para EasyOrder
De los patrones vistos, cuáles tienen sentido para el proyecto.

## Patrones que NO aplican a EasyOrder
Cosas que ves en las capturas pero que contradicen las reglas del negocio actual.

Guarda como docs/design/07_benchmark_visual.md
Distingue siempre entre: confirmado por captura / inferido / recomendación propia.
```

---

### Paso 4.2 — Definir el árbol de pantallas del frontend público

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/business/reglas_negocio_la_isla.md
@docs/business/objetivo_MVP_EasyOrder.md
@docs/design/07_benchmark_visual.md

Define el árbol completo de pantallas del frontend público de EasyOrder para MVP.

Para cada pantalla usa esta estructura:
- **Nombre:** [nombre descriptivo]
- **URL:** [ruta, por ejemplo /[slug-del-local]/menu]
- **Qué muestra:** [descripción en 2 líneas]
- **Datos que necesita de la base:** [tablas o campos]
- **Acciones posibles del usuario:** [qué puede hacer]
- **A dónde va después:** [siguiente pantalla]

Cubre este flujo completo:
1. Landing del local
2. Menú (listado de categorías y productos)
3. Detalle de producto (con variantes y extras)
4. Carrito
5. Checkout (datos del cliente, tipo de despacho)
6. Confirmación del pedido

Guarda como docs/design/08_arbol_pantallas_publico.md
No elijas framework ni generes código todavía.
```

---

### Paso 4.3 — Definir el flujo de compra con las reglas reales del negocio

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/business/reglas_negocio_la_isla.md
@docs/design/08_arbol_pantallas_publico.md

Define el flujo de compra completo aplicando las reglas reales del negocio.
Para cada paso del checkout responde:

**Paso: Tipo de despacho (retiro o delivery)**
- ¿Qué campos muestra para retiro?
- ¿Qué campos muestra para delivery?
- ¿Qué validaciones hace antes de continuar?
- ¿Qué pasa si el mínimo de delivery no se alcanza?

**Paso: Datos del cliente**
- ¿Qué campos son obligatorios?
- ¿Cuáles son opcionales?
- ¿Qué pasa si el cliente ya tiene nombre guardado?

**Paso: Método de pago**
- ¿Qué opciones muestra?
- ¿Puede asumir alguna por defecto?
- ¿Qué pasa si elige transferencia?

**Paso: Confirmación**
- ¿Qué muestra en el resumen final?
- ¿Qué acción dispara hacia el negocio?
- ¿A dónde va después de confirmar?

Guarda como docs/design/09_flujo_compra_reglas.md
```

---

### Paso 4.4 — Definir los contratos de datos del frontend público

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/design/08_arbol_pantallas_publico.md
@docs/audit/01_auditoria_base_datos.md

Para cada pantalla del frontend público, define qué datos necesita exactamente:

Usa esta estructura por pantalla:

**Pantalla: [nombre]**
- Datos necesarios: [lista de campos con su tabla de origen]
- ¿Requiere auth?: [sí/no]
- ¿Datos en tiempo real o estáticos?: [tiempo real / cacheables]
- ¿Qué endpoint o query lo resuelve?: [descripción, no código]

Guarda como docs/design/10_contratos_datos_publico.md
```

---

### Señal de cierre de Fase 4

Tienes en `docs/design/`:
- `07_benchmark_visual.md`
- `08_arbol_pantallas_publico.md`
- `09_flujo_compra_reglas.md`
- `10_contratos_datos_publico.md`

El flujo de compra cubre explícitamente qué pasa cuando el mínimo de delivery no se alcanza, y distingue retiro de delivery sin pedirle dirección al cliente en retiro.

---

---

# FASE 5 — Diseño del dashboard administrativo

## Qué es esta fase

Definir las pantallas del panel que usa el operador del local para gestionar su negocio: ver pedidos, editar el menú, configurar horarios, zonas de delivery y datos del local. El dashboard es para el negocio, no para el cliente final.

**Esta fase no produce código. Solo produce el mapa de módulos y contratos de datos.**

## Antes de empezar

- Fases 1 a 4 completadas
- Tienes los archivos de diseño en `docs/design/`

---

### Paso 5.1 — Definir los módulos del dashboard para MVP

```prompt
Actúa como saas-product-architect.

Lee:
@docs/business/objetivo_MVP_EasyOrder.md
@docs/design/04_roles_y_permisos.md
@docs/audit/00_consolidacion_hallazgos.md

Define los módulos del dashboard administrativo de EasyOrder.
Para cada módulo clasifícalo como MVP o post-MVP y justifica por qué.

Usa esta estructura:

**Módulo: [nombre]**
- ¿Qué resuelve?: [en una línea]
- ¿Por qué es MVP o post-MVP?: [justificación]
- ¿Qué rol lo necesita?: [rol mínimo para acceder]
- ¿Depende de otro módulo para funcionar?: [sí/no, cuál]

Candidatos a evaluar (pueden haber más):
- Resumen operativo / home del dashboard
- Lista de pedidos activos
- Detalle del pedido
- Historial de pedidos
- Gestión del menú (categorías, productos, variantes, extras)
- Gestión de horarios
- Gestión de zonas de delivery
- Configuración del local (nombre, logo, datos de contacto)
- Clientes
- Métricas y estadísticas
- Usuarios y roles del local

Guarda como docs/design/11_modulos_dashboard.md
```

---

### Paso 5.2 — Definir el árbol de navegación del dashboard

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/design/11_modulos_dashboard.md
@docs/design/07_benchmark_visual.md

Define el árbol de navegación del dashboard para los módulos MVP únicamente.

Para cada módulo MVP usa esta estructura:
- **Módulo:** [nombre]
- **Ruta:** [/dashboard/[local]/[modulo]]
- **Pantallas que contiene:** [lista]
- **Qué muestra en la navegación lateral:** [label e ícono sugerido]
- **Primera pantalla que ve el usuario al entrar:** [descripción]

Considera también:
- ¿Cómo se muestra el nombre del local activo?
- ¿Cómo cambia de local un usuario con acceso a varios?
- ¿Hay una pantalla de bienvenida o home del dashboard?

Guarda como docs/design/12_navegacion_dashboard.md
```

---

### Paso 5.3 — Definir contratos de datos del dashboard

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/design/12_navegacion_dashboard.md
@docs/audit/01_auditoria_base_datos.md
@docs/audit/02_auditoria_datos_semilla.md

Para cada módulo MVP del dashboard, define qué datos necesita:

**Módulo: [nombre]**
- Datos que lee: [tablas y campos de la base actual]
- Datos que escribe: [qué modifica y en qué tabla]
- ¿Requiere filtro por restaurant_id?: [sí/no]
- ¿Necesita datos en tiempo real?: [sí/no, justificación]
- Métricas calculables con datos actuales sin trabajo extra: [lista]
- Métricas que requerirían trabajo adicional de datos: [lista]

Guarda como docs/design/13_contratos_datos_dashboard.md
```

---

### Señal de cierre de Fase 5

Tienes en `docs/design/`:
- `11_modulos_dashboard.md` — con clasificación MVP/post-MVP
- `12_navegacion_dashboard.md` — árbol de rutas del dashboard
- `13_contratos_datos_dashboard.md` — contratos de datos por módulo

El módulo de pedidos está clasificado como MVP. Las métricas avanzadas como post-MVP.

---

---

# FASE 6 — Diseño de la capa API / backend web

## Qué es esta fase

Definir exactamente qué endpoints necesita EasyOrder, cuáles son operaciones directas a la base de datos, y cuáles deben pasar por n8n. Esta fase cierra el diseño completo del sistema antes de escribir la primera línea de código.

**Esta fase no produce código. Produce la lista definitiva de endpoints y sus contratos.**

## Antes de empezar

- Fases 1 a 5 completadas
- Tienes los contratos de datos de frontend y dashboard en `docs/design/`
- Tienes el mapa de workflows de n8n en `docs/audit/`

---

### Paso 6.1 — Identificar todos los endpoints necesarios

```prompt
Actúa como saas-product-architect.

Lee:
@docs/design/10_contratos_datos_publico.md
@docs/design/13_contratos_datos_dashboard.md

Con base en lo que necesita el frontend público y el dashboard, 
haz un inventario de todos los endpoints que EasyOrder necesita.

Para cada endpoint usa esta estructura:
- **Endpoint:** [METHOD /ruta]
- **Qué hace:** [descripción en una línea]
- **Lo llama:** [frontend público / dashboard / ambos]
- **Requiere auth:** [sí/no]
- **Requiere filtro por restaurant_id:** [sí/no]

No clasifiques todavía si va a n8n o a la API directa. 
Solo lista todos los endpoints que necesitas.

Guarda como docs/design/14_inventario_endpoints.md
```

---

### Paso 6.2 — Clasificar endpoints entre API directa vs n8n

```prompt
Actúa como n8n-architect.

Lee:
@docs/design/14_inventario_endpoints.md
@docs/audit/00_consolidacion_hallazgos.md

Para cada endpoint del inventario, clasifícalo en una de estas categorías:

**Categoría 1 — CRUD puro (API directa a PostgreSQL):**
Operaciones simples de lectura/escritura sin lógica de negocio compleja.
Ejemplo: listar categorías del menú, actualizar nombre del local.

**Categoría 2 — Lectura pura (API directa, cacheable):**
Consultas de solo lectura que no modifican estado.
Ejemplo: obtener menú público del local.

**Categoría 3 — Integración con n8n:**
Operaciones que deben pasar por la lógica de negocio ya implementada en n8n.
Ejemplo: confirmar un pedido.

**Categoría 4 — A definir / pendiente de validación:**
Operaciones donde no queda claro si deben ir a API o n8n.

Para la Categoría 3, indica explícitamente qué subflujo de n8n se invocaría.

Guarda como docs/design/15_clasificacion_endpoints.md
```

---

### Paso 6.3 — Definir contratos de los endpoints más críticos

```prompt
Actúa como saas-product-architect.

Lee @docs/design/15_clasificacion_endpoints.md

Toma los 10 endpoints más críticos para el MVP (los que desbloquean 
el flujo completo de compra y la operación básica del dashboard).

Para cada uno define el contrato completo:

**Endpoint:** [METHOD /ruta]
**Descripción:** [qué hace]
**Auth requerida:** [sí/no, tipo]
**Parámetros de entrada:**
  - Path params: [lista]
  - Query params: [lista]
  - Body: [estructura JSON]
**Respuesta exitosa:**
  - Status: [200/201/etc.]
  - Body: [estructura JSON]
**Errores posibles:**
  - [código]: [cuándo ocurre]
**Tablas que toca:** [lista]
**Lógica especial:** [si invoca n8n, si necesita recalcular algo, etc.]

Guarda como docs/design/16_contratos_endpoints_criticos.md
```

---

### Paso 6.4 — Revisión de regresión del diseño completo

```prompt
Actúa como qa-regression-reviewer.

Lee estos documentos de diseño:
@docs/design/02_plan_migracion_multitenant.md
@docs/design/09_flujo_compra_reglas.md
@docs/design/15_clasificacion_endpoints.md
@docs/design/16_contratos_endpoints_criticos.md

Revisa el diseño completo y responde:

## Riesgos críticos
¿Hay algo en el diseño propuesto que podría romper el flujo 
actual de Apertura → Despacho → Pago?

## Riesgos de mezcla de tenants
¿Hay algún endpoint o query que podría devolver datos de otro local?

## Reglas de negocio violadas
¿Algún endpoint o flujo propuesto viola las reglas de 
docs/business/reglas_negocio_la_isla.md?

## Casos borde no cubiertos
¿Qué situaciones del negocio real no están cubiertas en el diseño?

## Recomendación
¿El diseño está listo para pasar a implementación o hay algo que 
resolver primero?

Guarda como docs/design/17_revision_regresion_diseno.md
```

---

### Señal de cierre de Fase 6

Tienes en `docs/design/`:
- `14_inventario_endpoints.md`
- `15_clasificacion_endpoints.md`
- `16_contratos_endpoints_criticos.md`
- `17_revision_regresion_diseno.md`

El documento `17_revision_regresion_diseno.md` dice que el diseño está listo para implementación (o lista las cosas que hay que resolver primero antes de avanzar).

---

---

# FASE 7 — Implementación incremental

## Qué es esta fase

Es la primera fase donde se produce código real. Se implementa en bloques ordenados: primero las migraciones de base de datos, luego los endpoints de solo lectura, luego el flujo público completo, luego el dashboard. Cada bloque depende del anterior.

**Regla de esta fase:** un componente a la vez. Implementa, revisa, valida con el QA reviewer, luego continúas con el siguiente. No implementes en bloque.

## Antes de empezar

- `docs/design/17_revision_regresion_diseno.md` dice explícitamente "LISTA PARA IMPLEMENTACIÓN"
- La carpeta `docs/audit/` y `docs/design/` tienen todos los archivos de las fases anteriores

---

## SESIÓN 7.0 — Decisión de stack tecnológico

Esta sesión decide el lenguaje, framework y herramientas de todo el proyecto. Nada se puede implementar sin esta decisión. Es la primera sesión de Fase 7.

```prompt
Actúa como saas-product-architect.

Lee:
@docs/design/15_clasificacion_endpoints.md
@docs/design/16_contratos_endpoints_criticos.md
@docs/infra/dominios-y-servicios.md

EasyOrder necesita un backend API y un frontend. Basándote en:
- el VPS Hostinger con EasyPanel ya operativo,
- que el equipo que va a mantener esto somos pocos,
- que la prioridad es MVP funcional desplegable rápido,
- que el backend se conecta a PostgreSQL existente en el VPS,
- que la autenticación del panel usa Supabase Auth en Supabase Cloud
  (free tier, proyecto externo, NO self-hosted en el VPS),
- que Supabase Cloud solo se usa para auth.users y JWT —
  toda la data del negocio vive en el PostgreSQL del VPS,
- que la tabla local_memberships vive en el PostgreSQL del VPS
  con FK al UUID de auth.users de Supabase Cloud,

propón el stack mínimo para:
1. Backend API (el que expone los endpoints del doc 16)
2. Frontend público (menú digital del cliente)
3. Dashboard administrativo

Para cada uno evalúa máximo 2 opciones y elige una con justificación concreta.
No elijas por popularidad genérica. Elige por compatibilidad con lo que ya
existe en el VPS y simplicidad de despliegue en EasyPanel.

Registra también:
- cómo el backend verifica el JWT de Supabase Cloud,
- que SUPABASE_URL apunta a https://[proyecto].supabase.co,
- que el PostgreSQL del VPS sigue siendo la única fuente de verdad del negocio.

Guarda la decisión como docs/design/18_stack_tecnologico.md
```

**Señal de cierre:** El documento `18_stack_tecnologico.md` tiene una decisión concreta para backend, frontend público y dashboard, con justificación. No tiene "depende" ni "evaluar más adelante".

---

## SESIÓN 7.1 — Bloque 0: Migraciones críticas

Estas 8 migraciones son el prerequisito de todo lo demás. Sin ellas ningún endpoint funciona correctamente. Se aplican antes de escribir una sola línea de código de API.

### Paso 7.1.A — Generar el script de migraciones

```prompt
Actúa como postgres-architect.

Lee:
@docs/design/17_revision_regresion_diseno.md

El documento tiene una sección "Bloque 0 — Migraciones críticas" con 8 pasos.
Genera el script SQL completo para esas 8 migraciones en el orden exacto indicado.

Para cada migración incluye:
- un comentario SQL explicando qué hace y por qué,
- la query de verificación post-migración (para confirmar que se aplicó bien),
- el comando de rollback en caso de que algo falle.

IMPORTANTE:
- El paso del DROP TRIGGER debe verificar primero que el trigger existe antes de droppearlo.
- El paso 8 (UPDATE restaurante SET datos_bancarios) debe quedar con un
  placeholder: datos_bancarios = 'COMPLETAR_CON_DATOS_REALES_DEL_CLIENTE'
  No inventes datos bancarios reales.

Guarda el script como docs/design/19_migraciones_bloque0.sql
```

### Paso 7.1.B — Ejecutar queries de preflight antes de migrar

Antes de correr el script en tu base de datos, ejecuta estas dos queries de verificación directamente en PostgreSQL. Si alguna devuelve filas, resuélvelas antes de continuar.

```sql
-- Verificar duplicados en usuarios (si devuelve filas, hay que limpiar primero)
SELECT telefono, COUNT(*)
FROM public.usuarios
GROUP BY telefono
HAVING COUNT(*) > 1;

-- Verificar duplicados en contexto (si devuelve filas, hay que limpiar primero)
SELECT telefono, restaurante_id, COUNT(*)
FROM public.contexto
GROUP BY telefono, restaurante_id
HAVING COUNT(*) > 1;
```

Si la segunda query devuelve filas, ejecuta esto para quedarte solo con la fila más reciente:

```sql
DELETE FROM public.contexto c
WHERE ctid NOT IN (
  SELECT DISTINCT ON (telefono, restaurante_id) ctid
  FROM public.contexto
  ORDER BY telefono, restaurante_id, "timestamp" DESC
);
```

### Paso 7.1.C — Aplicar el script

Aplica `docs/design/19_migraciones_bloque0.sql` en tu PostgreSQL. Después de cada migración ejecuta la query de verificación incluida en el script para confirmar que se aplicó correctamente.

**Señal de cierre del Bloque 0:** Las 8 migraciones aplicadas sin errores. La tabla `restaurante` tiene columnas `slug`, `payment_methods` y `canal` (en `pedidos`). El trigger `tg_set_pedido_codigo` ya no existe. La key `timezone` ya no está en `restaurante_config`.

---

## SESIÓN 7.2 — Bloque 1: Endpoints de solo lectura

Son los 7 endpoints más seguros porque no escriben nada. Implementa uno por sesión. Cada sesión tiene este patrón: implementar → revisar → QA → siguiente.

### Orden de implementación del Bloque 1

```
1.  GET /public/:slug/restaurant
2.  GET /public/:slug/menu
3.  GET /public/:slug/delivery/zones
4.  GET /public/:slug/hours
5.  GET /dashboard/:slug/restaurant/status
6.  GET /dashboard/:slug/home/metrics
7.  GET /dashboard/:slug/orders
```

### Prompt base para cada endpoint (cambia solo el nombre del endpoint en la línea marcada con ★)

```prompt
Actúa como [framework del stack elegido en doc 18].

Lee:
@docs/design/16_contratos_endpoints_criticos.md
@docs/design/18_stack_tecnologico.md
@docs/audit/01_auditoria_base_datos.md

★ Implementa únicamente este endpoint:
GET /public/:slug/restaurant

(Cambia solo la línea de arriba por el endpoint que toca en ese momento.
Por ejemplo: GET /public/:slug/menu, o GET /public/:slug/hours, etc.)

El contrato exacto está en el doc 16. Aplica estas reglas sin excepción:
- El slug siempre se resuelve a restaurante_id antes de cualquier query.
- Si el slug no existe, retorna 404.
- Todas las queries filtran por restaurante_id.
- Ningún parámetro externo puede sobreescribir restaurante_id.
- is_open usa restaurante.zona_horaria como fuente de timezone,
  nunca restaurante_config.timezone.

Cuando termines, muéstrame el código del endpoint y la query SQL que usa.
No implementes el siguiente endpoint todavía.
```

### Prompt de QA después de cada endpoint (cambia solo la línea marcada con ★)

```prompt
Actúa como qa-regression-reviewer.

★ Revisa el endpoint que acabamos de implementar:
GET /public/:slug/restaurant

(Cambia solo la línea de arriba por el endpoint que acabas de implementar.)

Verifica:
1. ¿El slug se resuelve a restaurante_id antes de cualquier query?
2. ¿Hay alguna query que no filtre por restaurante_id?
3. ¿Podría este endpoint devolver datos de otro tenant?
4. ¿El manejo de errores cubre: slug inexistente, DB caída, respuesta vacía?
5. ¿El endpoint expone algún campo que no debería ser público?

Dame hallazgos críticos, hallazgos medios y si está listo para continuar.
```

**Señal de cierre del Bloque 1:** Los 7 endpoints implementados, cada uno revisado por el QA reviewer sin hallazgos críticos pendientes.

---

## SESIÓN 7.3 — Bloque 2: Flujo público completo

Son los 4 endpoints que cierran el flujo de compra del cliente. Este bloque es el corazón del producto. Implementa en este orden exacto porque cada uno depende del anterior.

```
1.  GET  /public/:slug/customer/lookup
2.  POST /public/:slug/cart/validate
3.  POST /public/:slug/orders
4.  GET  /public/:slug/orders/:pedido_codigo
```

Cada endpoint tiene su propio prompt a continuación. Implementa uno por sesión en el orden indicado.

---

### Prompt 1 — `GET /public/:slug/customer/lookup`

```prompt
Actúa como [framework del stack elegido en doc 18].

Lee:
@docs/design/17_revision_regresion_diseno.md
@docs/audit/01_auditoria_base_datos.md

Implementa el endpoint: GET /public/:slug/customer/lookup

Este endpoint recibe el teléfono del cliente como query param y devuelve
sus datos guardados para pre-rellenar el checkout.

Parámetros:
- Path: slug (resuelve a restaurante_id)
- Query param: telefono (string, requerido)

Lógica exacta:
1. Resolver slug → restaurante_id. Si no existe: 404.
2. Buscar en la tabla usuarios WHERE telefono = $telefono
   AND restaurante_id = $restaurante_id.
3. Si existe: devolver 200 con { "found": true, "nombre": "...",
   "direccion_frecuente": "..." }
   - nombre puede ser solo el primer nombre.
   - direccion_frecuente puede ser null si no tiene guardada.
4. Si no existe: devolver 200 con { "found": false }
   NUNCA devolver 404 cuando el teléfono no existe —
   no se debe confirmar ni negar la existencia de un usuario.
5. La respuesta NO devuelve telefono, usuario_id, ni ningún otro campo.

Reglas de seguridad:
- Aplicar rate limiting: máximo 5 requests por IP por minuto.
  Si se excede: 429 Too Many Requests.
- El filtro por restaurante_id es obligatorio.
  Un teléfono registrado en otro local NO debe aparecer aquí.

Muéstrame el código del endpoint completo.
No implementes el siguiente endpoint todavía.
```

**QA después de este endpoint:**

```prompt
Actúa como qa-regression-reviewer.

Revisa el endpoint GET /public/:slug/customer/lookup que acabamos de implementar.

Verifica:
1. ¿Devuelve 200 tanto cuando el teléfono existe como cuando no existe?
2. ¿Nunca devuelve teléfono, usuario_id u otros campos sensibles?
3. ¿El filtro por restaurante_id está presente? ¿Un teléfono de otro local no aparece?
4. ¿El rate limiting está implementado? ¿Devuelve 429 si se excede?
5. ¿Qué pasa si el query param telefono viene vacío o no viene?

Dame hallazgos críticos, hallazgos medios y si está listo para continuar.
```

---

### Prompt 2 — `POST /public/:slug/cart/validate`

```prompt
Actúa como [framework del stack elegido en doc 18].

Lee:
@docs/design/16_contratos_endpoints_criticos.md
@docs/audit/01_auditoria_base_datos.md

Implementa el endpoint: POST /public/:slug/cart/validate

El contrato completo está en el doc 16 (sección "3. POST /public/:slug/cart/validate").

Lógica exacta en este orden:
1. Resolver slug → restaurante_id. Si no existe: 404.
2. Para cada item del body:
   a. Buscar menu_variant WHERE menu_variant_id = $id
      JOIN menu_item ON menu_item.restaurante_id = $restaurante_id.
      Si no existe: agregar a unavailable_items con reason "variant_not_found".
      Si existe pero is_active = false: reason "variant_inactive".
   b. Para cada extra del item: buscar en extra WHERE extra_id = $id
      AND restaurante_id = $restaurante_id.
      Mismo tratamiento si inactivo o no existe.
3. Calcular price_delta = unit_price_current - unit_price_claimed por línea.
4. Si cualquier price_delta != 0 OR cualquier ítem está inactivo:
   valid = false.
5. Este endpoint NO escribe en ninguna tabla. Solo lee y valida.

Respuesta:
- valid: true/false
- price_changed: true si algún price_delta != 0
- items: array con unit_price_current, unit_price_claimed, price_delta por línea
- subtotal_current y subtotal_claimed calculados
- unavailable_items: array vacío si todo está disponible

Errores:
- 400 si items está vacío, quantity < 1, o body malformado.
- 404 si slug no resuelve restaurante.

Muéstrame el código del endpoint completo.
No implementes el siguiente endpoint todavía.
```

**QA después de este endpoint:**

```prompt
Actúa como qa-regression-reviewer.

Revisa el endpoint POST /public/:slug/cart/validate que acabamos de implementar.

Verifica:
1. ¿Una variante de otro restaurante podría pasar la validación?
2. ¿Qué pasa si un extra pertenece a otro restaurante?
3. ¿El endpoint escribe algo en la base de datos? No debería.
4. ¿price_changed se calcula correctamente si un precio cambió?
5. ¿valid = false si hay aunque sea un ítem inactivo?
6. ¿Qué devuelve si el array items viene vacío?

Dame hallazgos críticos, hallazgos medios y si está listo para continuar.
```

---

### Prompt 3 — `POST /public/:slug/orders`

El endpoint más crítico y complejo es `POST /public/:slug/orders`. Usa este prompt específico:

```prompt
Actúa como [framework del stack elegido en doc 18].

Lee:
@docs/design/16_contratos_endpoints_criticos.md
@docs/design/17_revision_regresion_diseno.md
@docs/audit/01_auditoria_base_datos.md

Implementa el endpoint: POST /public/:slug/orders

Este endpoint tiene lógica especial que debes aplicar en este orden exacto:
1. Resolver slug → restaurante_id (404 si no existe).
2. Verificar is_open usando restaurante.zona_horaria (422 con reason "local_closed" si está cerrado).
3. Verificar double-submit: si existe pedido del mismo telefono en los últimos
   30 segundos para el mismo restaurante → 409 con el pedido_codigo existente.
4. Validar que metodo_pago está en restaurante.payment_methods → 422 si no.
5. Validar cada menu_variant_id y extra_id contra el restaurante_id del slug
   (no confíes en el resultado del endpoint de validate).
6. Validar zona de delivery si tipo_despacho = 'delivery':
   - zona_id existe y pertenece al restaurante,
   - total >= min_order_amount de la zona.
7. Determinar estado inicial:
   - metodo_pago IN ('transferencia', 'online') → estado = 'pendiente_pago'
   - metodo_pago IN ('efectivo', 'tarjeta', 'bizum') → estado = 'confirmado'
8. Insertar el pedido con canal = 'web'.
9. La asignación de pedido_codigo la hace el trigger trg_set_pedido_codigo
   automáticamente. No lo calcules en el endpoint.

Muéstrame el código completo del endpoint y todas las queries SQL que usa.
```

Después del endpoint de creación de pedido, ejecuta el QA con foco especial en mezcla de tenants y reglas de negocio:

```prompt
Actúa como qa-regression-reviewer.

Revisa el endpoint POST /public/:slug/orders que acabamos de implementar.

Verifica estos casos críticos:
1. ¿Un extra de otro restaurante puede colarse en el pedido?
2. ¿Se puede crear un pedido con metodo_pago que el restaurante no acepta?
3. ¿El double-submit está cubierto?
4. ¿Qué pasa si el local cierra entre el validate y el orders?
5. ¿El estado inicial de 'online' queda como pendiente_pago?
6. ¿El campo canal queda como 'web'?
7. ¿El trigger de pedido_codigo podría fallar y dejar el pedido sin código?

Para cada caso: ¿está cubierto, está parcialmente cubierto o no está cubierto?
```

---

### Prompt 4 — `GET /public/:slug/orders/:pedido_codigo`

```prompt
Actúa como [framework del stack elegido en doc 18].

Lee:
@docs/design/16_contratos_endpoints_criticos.md
@docs/audit/01_auditoria_base_datos.md

Implementa el endpoint: GET /public/:slug/orders/:pedido_codigo

El contrato completo está en el doc 16 (sección "5. GET /public/:slug/orders/:pedido_codigo").

Lógica exacta:
1. Resolver slug → restaurante_id. Si no existe: 404.
2. Buscar el pedido:
   SELECT * FROM pedidos
   WHERE pedido_codigo = $pedido_codigo
   AND restaurante_id = $restaurante_id.
   Si no existe O pertenece a otro tenant: devolver 404.
   NO revelar que el código existe en otro restaurante.
3. Los items se leen directamente del JSONB pedidos.items.
   No hacer JOIN con menu_item ni menu_variant —
   el JSONB es el snapshot guardado al momento de la compra.
4. datos_transferencia: incluir SOLO si metodo_pago = 'transferencia'.
   Leer de restaurante.datos_bancarios (JSONB).
   Si datos_bancarios es NULL: omitir el campo completamente.
5. Campos que NO se exponen: usuario_id, telefono del cliente,
   restaurante_id, session_id.

Respuesta exitosa (200):
- id, pedido_codigo, estado, tipo_despacho
- items (del JSONB directo, sin JOIN)
- subtotal, costo_envio, total
- direccion (null si retiro)
- tiempo_estimado, metodo_pago, notas
- created_at, updated_at
- datos_transferencia (solo si metodo_pago = 'transferencia')

Errores:
- 404 si pedido_codigo no existe o no pertenece al tenant del slug.

Muéstrame el código del endpoint completo.
```

**QA después de este endpoint:**

```prompt
Actúa como qa-regression-reviewer.

Revisa el endpoint GET /public/:slug/orders/:pedido_codigo que acabamos de implementar.

Verifica:
1. ¿Si el pedido_codigo existe pero pertenece a otro restaurante, devuelve 404
   y no revela que el código existe?
2. ¿Los items se leen del JSONB directo sin hacer JOIN a menu_item o menu_variant?
3. ¿datos_transferencia aparece SOLO cuando metodo_pago = 'transferencia'?
4. ¿La respuesta expone telefono, usuario_id o restaurante_id? No debería.
5. ¿Qué devuelve si datos_bancarios es NULL en el restaurante?

Dame hallazgos críticos, hallazgos medios y si está listo para continuar.
```

---

**Señal de cierre del Bloque 2:** Los 4 endpoints implementados y validados con QA. Un pedido de prueba completo (lookup → validate → orders → tracking) fluye sin errores de extremo a extremo.

---

## SESIÓN 7.4 — Bloque 3: Operaciones del dashboard

Son las 3 operaciones del panel administrativo que requieren auth. Este bloque depende de que Supabase Cloud esté configurado y el middleware de JWT esté implementado.

```
1.  PATCH /dashboard/:slug/orders/:id/status
2.  PATCH /dashboard/:slug/restaurant/status
3.  PATCH /dashboard/:slug/settings
```

Antes de implementar cualquier endpoint del dashboard, implementa primero el middleware de autenticación:

```prompt
Actúa como [framework del stack elegido en doc 18].

Lee:
@docs/design/18_stack_tecnologico.md
@docs/design/05_tabla_membresias.md
@docs/design/06_rutas_y_autenticacion.md

Implementa el middleware de autenticación para los endpoints del dashboard.

El middleware debe:
1. Extraer el JWT del header Authorization: Bearer {token}.
2. Verificar el JWT contra Supabase Cloud usando SUPABASE_URL y SUPABASE_ANON_KEY
   (estas vienen de variables de entorno, nunca hardcodeadas).
3. Extraer el user_id (UUID de Supabase Auth) del JWT verificado.
4. Verificar en la tabla local_memberships del PostgreSQL del VPS que el user_id
   tiene acceso al slug del restaurante solicitado.
5. Si no tiene acceso: 403.
6. Si no hay token: 401.
7. Adjuntar al request: user_id, restaurante_id, rol del usuario.

No hardcodees ninguna credencial. Usa variables de entorno.
```

Cada endpoint tiene su propio prompt. Implementa uno por sesión en el orden indicado.

---

### Prompt 1 — `PATCH /dashboard/:slug/orders/:id/status`

```prompt
Actúa como el arquitecto backend del stack definido en docs/design/18_stack_tecnologico.md

Lee:
@docs/design/16_contratos_endpoints_criticos.md
@docs/audit/01_auditoria_base_datos.md

Implementa el endpoint: PATCH /dashboard/:slug/orders/:id/status

El middleware resolveTenant y requireAuth ya están montados.
restaurante_id ya está disponible en el contexto del request.

Body recibido:
{ "estado": "en_preparacion" }

La tabla de transiciones válidas es:
- en_curso → confirmado, cancelado
- pendiente_pago → pagado, confirmado, cancelado
- confirmado → en_preparacion, cancelado
- pagado → en_preparacion, cancelado
- en_preparacion → listo, cancelado
- listo → en_camino (solo si delivery), entregado (solo si retiro), cancelado
- en_camino → entregado, cancelado
- entregado → (terminal, no permite transición)
- cancelado → (terminal, no permite transición)

Lógica exacta:
1. Leer el pedido: SELECT id, estado, tipo_despacho FROM pedidos
   WHERE id = $id AND restaurante_id = $restaurante_id.
   Si no existe: 404.
2. Verificar que la transición estado_actual → estado_nuevo está permitida.
   Si no: 422 con { error: "transition_not_allowed", from: "...", to: "..." }.
3. UPDATE pedidos SET estado = $nuevo_estado, updated_at = NOW()
   WHERE id = $id AND restaurante_id = $restaurante_id.
4. Responder 200 con: { id, pedido_codigo, estado_anterior, estado, updated_at }

Errores: 400 estado ausente o inválido, 401 sin token, 403 sin acceso,
404 pedido inexistente, 422 transición no permitida.

Muéstrame el código completo del endpoint.
No implementes el siguiente todavía.
```

**QA después de este endpoint:**

```prompt
Actúa como qa-regression-reviewer.

Revisa el endpoint PATCH /dashboard/:slug/orders/:id/status que acabamos de implementar.

Verifica:
1. ¿Se puede cambiar el estado de un pedido de otro restaurante?
2. ¿La transición entregado → cualquier_estado está bloqueada?
3. ¿listo → en_camino solo funciona si tipo_despacho = 'delivery'?
4. ¿listo → entregado solo funciona si tipo_despacho = 'retiro'?
5. ¿El endpoint responde sin token? Debe devolver 401.
6. ¿Qué pasa si el id del pedido no existe? Debe devolver 404, no 500.

Dame hallazgos críticos, hallazgos medios y si está listo para continuar.
```

---

### Prompt 2 — `PATCH /dashboard/:slug/restaurant/status`

```prompt
Actúa como el arquitecto backend del stack definido en docs/design/18_stack_tecnologico.md

Lee:
@docs/design/16_contratos_endpoints_criticos.md
@docs/audit/01_auditoria_base_datos.md

Implementa el endpoint: PATCH /dashboard/:slug/restaurant/status

Este endpoint permite al operador abrir o cerrar el local manualmente
sobreescribiendo el cálculo automático por horarios.

El middleware resolveTenant y requireAuth ya están montados.
restaurante_id ya está disponible en el contexto del request.

Body recibido:
{
  "is_open_override": true | false | null,
  "reason": "texto opcional"
}

Lógica exacta:
1. Si is_open_override = null:
   DELETE FROM restaurante_config
   WHERE config_key = 'is_open_override'
   AND restaurante_id = $restaurante_id.
   También borrar config_key = 'is_open_override_reason' si existe.
2. Si is_open_override = true o false:
   UPSERT en restaurante_config con config_key = 'is_open_override',
   config_value = valor como string ('true' o 'false'),
   restaurante_id = $restaurante_id.
   Si viene reason: mismo UPSERT con config_key = 'is_open_override_reason'.
3. Recalcular is_open efectivo después del cambio aplicando el nuevo
   override sobre el horario actual del día.
4. Responder 200 con:
   { restaurante_id, is_open_override, reason, is_open_effective, updated_at }

PRECONDICIÓN: este endpoint requiere que restaurante_config tenga
PK compuesta (config_key, restaurante_id). Verifica si esa migración
ya fue aplicada antes de implementar el UPSERT con ON CONFLICT.

Errores: 400 body malformado, 401 sin token, 403 sin acceso, 404 slug inexistente.

Muéstrame el código completo del endpoint.
No implementes el siguiente todavía.
```

**QA después de este endpoint:**

```prompt
Actúa como qa-regression-reviewer.

Revisa el endpoint PATCH /dashboard/:slug/restaurant/status que acabamos de implementar.

Verifica:
1. ¿is_open_override = null elimina el override correctamente?
2. ¿El UPSERT usa restaurante_id en el ON CONFLICT para no mezclar tenants?
3. ¿is_open_effective se recalcula con el nuevo override aplicado?
4. ¿Un operador de otro local puede cambiar el estado de este local?
5. ¿Qué pasa si la migración M-11 (PK compuesta) no está aplicada?

Dame hallazgos críticos, hallazgos medios y si está listo para continuar.
```

---

### Prompt 3 — `PATCH /dashboard/:slug/settings`

```prompt
Actúa como el arquitecto backend del stack definido en docs/design/18_stack_tecnologico.md

Lee:
@docs/design/16_contratos_endpoints_criticos.md
@docs/audit/01_auditoria_base_datos.md

Implementa el endpoint: PATCH /dashboard/:slug/settings

Este endpoint permite al operador actualizar la configuración básica
del local desde el dashboard.

El middleware resolveTenant y requireAuth ya están montados.
restaurante_id ya está disponible en el contexto del request.
Solo usuarios con rol 'owner' o 'manager' pueden usar este endpoint.

Campos actualizables del body (todos opcionales):
{
  "nombre": "string",
  "telefono": "string",
  "direccion": "string",
  "mensaje_bienvenida": "string",
  "mensaje_cerrado": "string",
  "payment_methods": ["efectivo", "transferencia", "tarjeta", "bizum", "online"]
}

Lógica exacta:
1. restaurante_id viene del contexto (resolveTenant).
2. Verificar que el rol del usuario es 'owner' o 'manager'.
   Si es 'viewer': responder 403.
3. Construir el UPDATE dinámicamente con solo los campos que vienen en el body.
   Si el body está vacío o no tiene campos válidos: responder 400.
4. UPDATE restaurante SET [campos] WHERE id = $restaurante_id.
5. Responder 200 con los campos actualizados.

Campos que NO son actualizables por este endpoint:
slug, zona_horaria, datos_bancarios, id.

Errores: 400 body vacío o sin campos válidos, 401 sin token,
403 sin acceso o rol viewer, 404 slug inexistente.

Muéstrame el código completo del endpoint.
```

**QA después de este endpoint:**

```prompt
Actúa como qa-regression-reviewer.

Revisa el endpoint PATCH /dashboard/:slug/settings que acabamos de implementar.

Verifica:
1. ¿Un usuario con rol 'viewer' puede actualizar la configuración? No debería.
2. ¿El endpoint permite actualizar el slug o el id? No debería.
3. ¿Qué pasa si el body viene completamente vacío?
4. ¿El UPDATE filtra por restaurante_id? ¿Podría actualizar datos de otro local?
5. ¿payment_methods valida que los valores sean del conjunto permitido?

Dame hallazgos críticos, hallazgos medios y si está listo para continuar.
```

---

**Señal de cierre del Bloque 3:** Los 3 endpoints implementados y validados con QA. El operador puede cambiar estados de pedidos, abrir/cerrar el local manualmente y actualizar la configuración básica desde el dashboard.

---

## SESIÓN 7.5 — Bloque 4: CRUD de menú y configuración

Son todos los endpoints de gestión de catálogo: categorías, ítems, variantes, extras, horarios y zonas de delivery. Este bloque requiere que las migraciones del archivo `docs/design/20_migraciones_bloque4.sql` ya estén aplicadas antes de empezar.

---

### Orden de implementación — 7 grupos, 22 endpoints

Implementa en este orden exacto. No saltes grupos.

```
Grupo 1 — Categorías (tabla: menu_category)
  1.  GET    /dashboard/:slug/menu/categories
  2.  POST   /dashboard/:slug/menu/categories
  3.  PATCH  /dashboard/:slug/menu/categories/:category_id
  4.  DELETE /dashboard/:slug/menu/categories/:category_id

Grupo 2 — Ítems (tabla: menu_item)
  5.  GET    /dashboard/:slug/menu/items
  6.  POST   /dashboard/:slug/menu/items
  7.  PATCH  /dashboard/:slug/menu/items/:item_id
  8.  DELETE /dashboard/:slug/menu/items/:item_id

Grupo 3 — Variantes (tabla: menu_variant)
  9.  GET    /dashboard/:slug/menu/items/:item_id/variants
  10. POST   /dashboard/:slug/menu/items/:item_id/variants
  11. PATCH  /dashboard/:slug/menu/items/:item_id/variants/:variant_id
  12. DELETE /dashboard/:slug/menu/items/:item_id/variants/:variant_id

Grupo 4 — Extras (tabla: extra)
  13. GET    /dashboard/:slug/menu/extras
  14. POST   /dashboard/:slug/menu/extras
  15. PATCH  /dashboard/:slug/menu/extras/:extra_id
  16. DELETE /dashboard/:slug/menu/extras/:extra_id

Grupo 5 — Relación ítem-extras (tabla: menu_item_extra)
  17. PUT    /dashboard/:slug/menu/items/:item_id/extras

Grupo 6 — Horarios (tabla: horario_atencion)
  18. GET    /dashboard/:slug/config/hours
  19. PUT    /dashboard/:slug/config/hours

Grupo 7 — Zonas de delivery (tabla: delivery_zone)
  20. POST   /dashboard/:slug/config/delivery-zones
  21. PATCH  /dashboard/:slug/config/delivery-zones/:zone_id
  22. DELETE /dashboard/:slug/config/delivery-zones/:zone_id
```

---

### Prompt base — Grupos 1 al 4 (CRUD estándar)

Copia este prompt para cada grupo. Cambia solo las líneas marcadas con ★.

```prompt
Actúa como el arquitecto backend del stack definido en
docs/design/18_stack_tecnologico.md.

Lee:
@docs/audit/01_auditoria_base_datos.md
@docs/design/16_contratos_endpoints_criticos.md

El middleware resolveTenant y requireAuth ya están montados y
funcionando. Todos los endpoints de este grupo requieren ambos.

★ Implementa estos 4 endpoints del grupo de [NOMBRE DEL GRUPO]:
   GET    /dashboard/:slug/menu/[RECURSO]
   POST   /dashboard/:slug/menu/[RECURSO]
   PATCH  /dashboard/:slug/menu/[RECURSO]/:[ID]
   DELETE /dashboard/:slug/menu/[RECURSO]/:[ID]

★ Tabla principal: [TABLA]
★ Columnas relevantes: [COLUMNAS]

Reglas que debes respetar:
- GET: ordena por sort_order si existe, luego por nombre.
- POST: el campo restaurante_id NUNCA viene en el body; tómalo de
  c.get("restaurante_id") que inyecta resolveTenant.
- PATCH: antes de actualizar, verifica que el registro pertenece al
  restaurante_id del tenant. Si no pertenece, retorna 404.
- DELETE: soft delete únicamente — SET is_active = false.
  Nunca DELETE físico.
- Todos los queries deben filtrar por restaurante_id.

Crea el archivo api/src/routes/dashboard/[nombre-grupo].ts.
Registra la ruta en api/src/index.ts.
No generes tests todavía.
```

**Valores ★ por grupo:**

| Grupo | NOMBRE | RECURSO | :[ID] | TABLA | COLUMNAS principales |
|-------|--------|---------|-------|-------|----------------------|
| 1 | categorías | categories | :category_id | menu_category | menu_category_id, restaurante_id, name, sort_order, is_active |
| 2 | ítems | items | :item_id | menu_item | menu_item_id, menu_category_id, restaurante_id, name, description, base_price, image_url, is_active |
| 3 | variantes | items/:item_id/variants | :variant_id | menu_variant | menu_variant_id, menu_item_id, restaurante_id, name, price_modifier, is_active |
| 4 | extras | extras | :extra_id | extra | extra_id, restaurante_id, name, price, is_active |

---

### Prompt especial — Grupo 5: Relación ítem-extras

```prompt
Actúa como el arquitecto backend del stack definido en
docs/design/18_stack_tecnologico.md.

Lee:
@docs/audit/01_auditoria_base_datos.md

El middleware resolveTenant y requireAuth ya están montados.

Implementa este endpoint:
   PUT /dashboard/:slug/menu/items/:item_id/extras

Semántica: reemplaza TODA la lista de extras asociados al ítem.
El body recibe: { "extra_ids": [1, 2, 3] }

Lógica requerida (dentro de una sola transacción):
1. Verifica que item_id pertenece al restaurante_id del tenant.
   Si no, retorna 404.
2. Verifica que todos los extra_id del array pertenecen al mismo
   restaurante_id. Si alguno no pertenece, retorna 400 con mensaje
   claro indicando cuál extra_id es inválido.
3. DELETE FROM menu_item_extra WHERE menu_item_id = :item_id
4. INSERT INTO menu_item_extra (menu_item_id, extra_id)
   para cada extra_id del array.
5. Si cualquier paso falla, hace ROLLBACK completo.

Retorna 200 con la lista actualizada de extras del ítem.

Crea o actualiza api/src/routes/dashboard/items.ts.
No generes tests todavía.
```

---

### Prompt especial — Grupo 6: Horarios

```prompt
Actúa como el arquitecto backend del stack definido en
docs/design/18_stack_tecnologico.md.

Lee:
@docs/audit/01_auditoria_base_datos.md
@docs/business/reglas_negocio_la_isla.md

El middleware resolveTenant y requireAuth ya están montados.

Implementa estos 2 endpoints:

1. GET /dashboard/:slug/config/hours
   Retorna los 7 registros de horario_atencion del restaurante
   (uno por día de la semana, dia_semana 0=domingo a 6=sábado).
   Si un día no tiene registro, inclúyelo igual con is_open: false.

2. PUT /dashboard/:slug/config/hours
   Body: array de hasta 7 objetos con estructura:
   { dia_semana, hora_apertura, hora_cierre, is_open }

   Lógica:
   - Usa UPSERT (INSERT ... ON CONFLICT DO UPDATE) por restaurante_id
     + dia_semana.
   - Valida que hora_apertura y hora_cierre tienen formato HH:MM.
   - Valida que hora_cierre > hora_apertura EXCEPTO cuando el horario
     cruza medianoche (hora_cierre < hora_apertura es válido en ese
     caso — ej: 22:00 a 02:00). Documenta esta excepción en un
     comentario en el código.
   - Si is_open es false, guarda los valores de hora pero no los valida.
   - Retorna los 7 registros actualizados.

Crea api/src/routes/dashboard/hours.ts.
Registra la ruta en api/src/index.ts.
No generes tests todavía.
```

---

### Prompt especial — Grupo 7: Zonas de delivery

```prompt
Actúa como el arquitecto backend del stack definido en
docs/design/18_stack_tecnologico.md.

Lee:
@docs/audit/01_auditoria_base_datos.md
@docs/design/17_revision_regresion_diseno.md

El middleware resolveTenant y requireAuth ya están montados.

Implementa estos 3 endpoints:

1. POST /dashboard/:slug/config/delivery-zones
   Body: { name, min_order_amount, delivery_fee, estimated_minutes, is_active }
   - Inserta en delivery_zone con el restaurante_id del tenant.
   - El campo name debe ser único por restaurante_id (constraint ya
     existe en la tabla). Si viola UNIQUE, retorna 409 con mensaje claro.
   - Retorna 201 con el registro creado.

2. PATCH /dashboard/:slug/config/delivery-zones/:zone_id
   - Verifica que zone_id pertenece al restaurante_id del tenant.
     Si no, retorna 404.
   - Permite actualizar: name, min_order_amount, delivery_fee,
     estimated_minutes, is_active.
   - Retorna 200 con el registro actualizado.

3. DELETE /dashboard/:slug/config/delivery-zones/:zone_id
   - Soft delete: SET is_active = false.
   - Verifica pertenencia al tenant antes de actualizar.
   - Retorna 200 con el registro actualizado.

Crea api/src/routes/dashboard/delivery-zones.ts.
Registra la ruta en api/src/index.ts.
No generes tests todavía.
```

---

### Prompt de QA — reutilizable para cada grupo

Úsalo después de implementar cada grupo. Cambia solo la línea ★.

```prompt
Actúa como qa-regression-reviewer.

Lee:
@docs/design/17_revision_regresion_diseno.md
@docs/design/16_contratos_endpoints_criticos.md

★ Revisa el archivo api/src/routes/dashboard/[ARCHIVO DEL GRUPO].ts

Verifica estos puntos en cada endpoint del archivo:

SEGURIDAD
□ ¿Todos los endpoints requieren requireAuth?
□ ¿Todos los queries filtran por restaurante_id del tenant?
□ ¿PATCH y DELETE verifican pertenencia antes de modificar?

INTEGRIDAD
□ ¿El campo restaurante_id nunca viene del body del request?
□ ¿Los DELETE son soft (is_active = false) y no físicos?
□ ¿Las operaciones con múltiples writes usan transacción?

RESPUESTAS HTTP
□ ¿GET retorna 200 con array (vacío si no hay datos)?
□ ¿POST retorna 201 con el recurso creado?
□ ¿PATCH/PUT retorna 200 con el recurso actualizado?
□ ¿Recurso no encontrado retorna 404?
□ ¿Violación de unique constraint retorna 409?
□ ¿Body inválido retorna 400 con mensaje descriptivo?

Si encuentras algún problema, muestra exactamente qué línea corregir
y por qué. Si todo está correcto, confirma con: "✓ Grupo [NOMBRE]
listo para producción."
```

---

**Señal de cierre del Bloque 4:** El operador puede crear y editar categorías, productos, variantes, extras, horarios y zonas de delivery desde el dashboard. Los 22 endpoints respondieron correctamente en el QA reviewer.

---

### Señal de cierre de Fase 7

- Bloque 0: 8 migraciones aplicadas sin errores
- Bloque 1: 7 endpoints de lectura funcionando
- Bloque 2: Flujo completo de compra funcionando de extremo a extremo
- Bloque 3: Dashboard con auth y gestión de estados de pedido
- Bloque 4: CRUD completo de catálogo y configuración

---

## SESIÓN 8 — Frontend público (carta digital)

Stack: Next.js 14 App Router + Tailwind + Zustand + @supabase/ssr.
El backend Hono ya está completo. El frontend solo llama al API via fetch — no accede directamente a PostgreSQL.

Orden de implementación: migración → bootstrap → pantallas en secuencia.

---

### SESIÓN 8.0 — Migración de columnas para el frontend

Antes de escribir una sola línea de frontend, aplica este archivo en tu cliente PostgreSQL (DBeaver, psql, o similar):

```
docs/design/21_migraciones_frontend.sql
```

Contiene 4 pasos:
1. Columnas de identidad visual: `logo_url`, `descripcion`, `brand_color`
2. Columnas de despacho: `delivery_enabled`, `pickup_enabled`, `delivery_min_order`
3. Columnas de producto: `menu_item.image_url`, `menu_item.base_price`
4. Valores iniciales para La Isla Pizzería (id=1)

**Señal de que puedes continuar:** La verificación global al final del archivo retorna 6 columnas en `restaurante` y 2 en `menu_item`.

---

### SESIÓN 8.1 — Bootstrap del proyecto Next.js

```prompt
Actúa como frontend-dashboard-builder del stack definido en
docs/design/18_stack_tecnologico.md.

Lee:
@docs/design/08_arbol_pantallas_publico.md
@docs/design/18_stack_tecnologico.md

Crea el proyecto Next.js 14 App Router en la carpeta web/ con esta
configuración exacta:

DEPENDENCIAS:
- next@14
- react@18
- typescript
- tailwindcss@3
- @supabase/ssr
- @supabase/supabase-js
- zustand@4

ESTRUCTURA DE RUTAS (app/):
web/
  app/
    (public)/
      [slug]/
        page.tsx              ← landing del local
        menu/
          page.tsx            ← carta digital
          producto/
            [item_id]/
              page.tsx        ← detalle de producto
        carrito/
          page.tsx
        checkout/
          datos/page.tsx
          despacho/page.tsx
          pago/page.tsx
          confirmar/page.tsx
        pedido/
          estado/page.tsx
    dashboard/
      [slug]/
        page.tsx
    layout.tsx
    globals.css
  middleware.ts               ← protege /dashboard/* con Supabase Auth
  next.config.js              ← output: 'standalone'
  .env.local.example

ARCHIVO .env.local.example:
NEXT_PUBLIC_SUPABASE_URL=https://[proyecto].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:3001

Genera solo la estructura del proyecto, el middleware de auth y el
archivo de tipos compartidos (types/api.ts con las interfaces de
respuesta del API). No implementes ninguna pantalla todavía.
```

**Señal de que puedes continuar:** `npm run dev` en `web/` levanta sin errores en http://localhost:3000.

---

### SESIÓN 8.2 — Store del carrito (Zustand)

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/design/08_arbol_pantallas_publico.md
@docs/design/09_flujo_compra_reglas.md
@web/app/types/api.ts

Crea el store de Zustand en web/lib/store/cart.ts que gestione todo
el estado del flujo de compra.

El store debe contener:

ESTADO:
- items: CartItem[]           ← ítems en el carrito
- customerName: string
- customerPhone: string
- dispatchType: 'delivery' | 'pickup' | null
- address: string
- deliveryCost: number
- paymentMethod: string | null
- orderId: string | null

TIPO CartItem:
- itemId, itemName, variantId, variantName, extras (array), qty, unitPrice

ACCIONES:
- addItem(item): agrega o suma cantidad si ya existe (mismo itemId+variantId+extras)
- removeItem(itemId, variantId, extras): elimina ítem exacto
- updateQty(itemId, variantId, extras, qty): actualiza cantidad, elimina si qty=0
- clearCart()
- setCustomer(name, phone)
- setDispatch(type, address, cost)
- setPaymentMethod(method)
- setOrderId(id)

DERIVADOS (selectores):
- subtotal(): suma de (unitPrice × qty) por ítem
- total(): subtotal + deliveryCost
- itemCount(): total de unidades en el carrito
- isCartEmpty(): boolean

El estado debe persistir en sessionStorage para que no se pierda
al navegar entre pantallas. Usa el middleware 'persist' de Zustand
con storage: sessionStorage.

No importa todavía en ninguna pantalla. Solo crea el store.
```

---

### SESIÓN 8.3 — Pantalla: Landing del local (`/:slug`)

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/design/08_arbol_pantallas_publico.md sección "Pantalla 1"
@docs/design/10_contratos_datos_publico.md sección "Pantalla 1"
@web/app/types/api.ts

El endpoint que provee los datos es:
GET /public/:slug/restaurant
(ya implementado en el backend Hono)

Respuesta del endpoint incluye:
- nombre, slug, descripcion, logo_url, brand_color
- direccion
- delivery_enabled, pickup_enabled
- is_open (boolean derivado de horarios + timezone)
- next_opening (string con próximo horario de apertura si está cerrado)

Implementa web/app/(public)/[slug]/page.tsx como Server Component.

La pantalla debe mostrar:
- Logo del local (o placeholder si logo_url es null)
- Nombre del local
- Descripción
- Indicador visual: "Abierto ahora" (verde) o "Cerrado · Abre el {next_opening}" (rojo)
- Etiquetas de servicio: "Delivery" y/o "Retiro en local" según delivery_enabled y pickup_enabled
- Dirección del local
- Botón CTA principal "Ver menú" → navega a /:slug/menu
- Si el local está cerrado: el botón dice "Ver carta (cerrado)" y aún navega al menú

Usa brand_color del local para colorear el botón CTA y los elementos
de acento (Tailwind con style inline para el color dinámico).

No uses datos hardcodeados. El fetch usa NEXT_PUBLIC_API_URL del .env.
```

---

### SESIÓN 8.4 — Pantalla: Menú del local (`/:slug/menu`)

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/design/08_arbol_pantallas_publico.md sección "Pantalla 2"
@docs/design/10_contratos_datos_publico.md sección "Pantalla 2"
@web/lib/store/cart.ts

El endpoint que provee los datos es:
GET /public/:slug/menu
(retorna categorías con sus ítems y variantes anidados)

Implementa web/app/(public)/[slug]/menu/page.tsx.

LAYOUT:
- Header compacto: logo + nombre del local + indicador abierto/cerrado
- Si el local está cerrado: banner amarillo en la parte superior con
  próximo horario. Botón "Agregar" deshabilitado en todos los ítems.
- Tabs de categorías con scroll horizontal (sticky al hacer scroll)
- Grid de cards de productos por categoría

CARD DE PRODUCTO:
- Imagen (o placeholder)
- Nombre
- Descripción corta (máx 2 líneas, truncar)
- Precio: si tiene variantes → "Desde €{precio_min}". Si no tiene
  variantes → precio directo (base_price)
- Botón "+": si el ítem NO requiere variante ni tiene extras, agrega
  directamente al carrito con addItem() del store.
  Si requiere variante o tiene extras, navega a /:slug/menu/producto/:item_id

CARRITO FLOTANTE (mobile):
- Botón fijo en la parte inferior con icono de carrito + contador de
  items (itemCount() del store) + total(). Solo visible si itemCount > 0.
- Al tocar → navega a /:slug/carrito

CARRITO LATERAL (desktop, md: breakpoint):
- Panel fijo a la derecha con lista de ítems, subtotal y botón
  "Continuar al pedido" → navega a /:slug/carrito

Aviso de mínimo de delivery: si el local tiene delivery_min_order > 0
y el subtotal del carrito no lo alcanza, mostrar aviso inline en el
carrito lateral/flotante (no bloquear todavía, solo informar).
```

---

### SESIÓN 8.5 — Pantalla: Detalle de producto (`/:slug/menu/producto/:item_id`)

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/design/08_arbol_pantallas_publico.md sección "Pantalla 3"
@docs/design/10_contratos_datos_publico.md sección "Pantalla 3"
@web/lib/store/cart.ts

El endpoint que provee los datos es:
GET /public/:slug/menu/items/:item_id
(retorna el ítem con sus variantes y extras disponibles)

Implementa web/app/(public)/[slug]/menu/producto/[item_id]/page.tsx
como Client Component (necesita estado local para variante seleccionada,
extras seleccionados, cantidad).

LAYOUT:
- Imagen grande del producto (o placeholder)
- Nombre y descripción completa
- Si tiene variantes: selector de radio buttons (obligatorio).
  El botón "Agregar" permanece deshabilitado hasta que se seleccione una.
- Si tiene extras: lista de checkboxes (opcional). Cada extra muestra
  su nombre y precio adicional.
- Precio total en tiempo real: precio de variante seleccionada +
  suma de extras seleccionados × cantidad
- Selector de cantidad: botones + y −, mínimo 1
- Botón "Agregar al pedido": llama a addItem() del store y vuelve a
  /:slug/menu
- Botón "Cancelar" o "← Volver": regresa a /:slug/menu sin agregar

REGLA CRÍTICA: Si requires_variant es true y no se ha seleccionado
variante, el botón "Agregar al pedido" debe estar deshabilitado.
```

---

### SESIÓN 8.6 — Pantalla: Carrito (`/:slug/carrito`)

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/design/08_arbol_pantallas_publico.md sección "Pantalla 4"
@docs/design/09_flujo_compra_reglas.md
@web/lib/store/cart.ts

El endpoint de validación de precios es:
POST /public/:slug/cart/validate
(ya implementado en el backend)

Implementa web/app/(public)/[slug]/carrito/page.tsx como Client Component.

LAYOUT:
- Lista de ítems del carrito (del store). Para cada ítem:
  - Nombre + variante seleccionada + extras seleccionados
  - Precio unitario
  - Controles de cantidad: botones − y +, al llegar a 0 elimina el ítem
  - Botón eliminar ítem
- Estado vacío: si el carrito está vacío, mostrar mensaje y botón
  "Volver al menú" → /:slug/menu

PRECIOS:
- Subtotal
- Costo de envío (no se muestra todavía aquí — se define en el checkout)
- Total provisional (= subtotal)

ACCIÓN "Continuar con el pedido":
- Antes de navegar, llamar a POST /public/:slug/cart/validate con los
  menu_variant_id del carrito para verificar que los precios no cambiaron.
- Si algún precio cambió: mostrar aviso con los ítems afectados y
  actualizar los precios en el store.
- Si todo está OK: navegar a /:slug/checkout/datos

REGLA: No bloquear el avance al checkout por el mínimo de delivery aquí.
Esa validación ocurre en la pantalla de despacho (09_flujo_compra_reglas.md).
Solo mostrar aviso informativo si el subtotal es bajo.
```

---

### SESIÓN 8.7 — Checkout: Datos del cliente (`/:slug/checkout/datos`)

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/design/08_arbol_pantallas_publico.md sección "Paso 5.1"
@docs/design/09_flujo_compra_reglas.md sección "Paso 5.1"
@web/lib/store/cart.ts

El endpoint de lookup de cliente es:
GET /public/:slug/customer/lookup?phone={tel}
(ya implementado en el backend)

Implementa web/app/(public)/[slug]/checkout/datos/page.tsx como
Client Component.

LAYOUT:
- Indicador de progreso: Datos [activo] > Despacho > Pago > Confirmar
- Título "¿A nombre de quién va el pedido?"
- Campo Nombre (obligatorio, text)
- Campo Teléfono (obligatorio, tel, prefijo +34 por defecto)
- Botón "Continuar" → deshabilitado hasta que ambos campos tengan valor

LOOKUP AUTOMÁTICO:
- Al salir del campo teléfono (onBlur), si el valor tiene al menos
  9 dígitos, llamar a GET /public/:slug/customer/lookup?phone={tel}
- Si el cliente existe: pre-cargar nombre en el campo Nombre (el usuario
  puede editarlo)
- Si no existe: no error, el usuario completa manualmente

AL CONTINUAR:
- Guardar en el store: setCustomer(name, phone)
- Navegar a /:slug/checkout/despacho

VALIDACIÓN:
- Si el usuario llega a esta pantalla con el carrito vacío (navegación
  directa por URL), redirigir a /:slug/menu
```

---

### SESIÓN 8.8 — Checkout: Despacho (`/:slug/checkout/despacho`)

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/design/08_arbol_pantallas_publico.md sección "Paso 5.2"
@docs/design/09_flujo_compra_reglas.md sección "Paso 5.2"
@web/lib/store/cart.ts

No requiere llamada nueva al API en este paso. Los datos del local
(delivery_enabled, pickup_enabled, delivery_min_order, tarifa_envio_valor)
ya están disponibles desde la carga del menú. Pásalos como props o
cárgalos desde un contexto creado en la pantalla de menú.

Implementa web/app/(public)/[slug]/checkout/despacho/page.tsx como
Client Component.

LAYOUT:
- Indicador de progreso: Datos > Despacho [activo] > Pago > Confirmar
- Dos cards visuales de selección: "Retiro en local" y "Delivery"
  (mostrar solo las opciones que el local tiene habilitadas)

SI SE SELECCIONA RETIRO:
- No mostrar campo de dirección (regla de negocio #5)
- Mostrar "Sin costo de envío"

SI SE SELECCIONA DELIVERY:
- Mostrar campo de dirección (obligatorio)
- Si el store tiene una dirección guardada de un lookup previo,
  pre-cargar el campo
- Mostrar costo de envío calculado
- Si subtotal < delivery_min_order: mostrar aviso en rojo con monto
  faltante y dos botones:
    "Agregar más productos" → /:slug/menu
    "Cambiar a Retiro" → acción explícita que cambia la selección a Retiro
  El botón "Continuar" permanece deshabilitado en este caso.
  (reglas de negocio #7 y #10)

AL CONTINUAR:
- Guardar en el store: setDispatch(type, address, cost)
- Navegar a /:slug/checkout/pago

VALIDACIÓN:
- Si customerName o customerPhone no están en el store (el usuario
  saltó el paso anterior por URL), redirigir a /:slug/checkout/datos
```

---

### SESIÓN 8.9 — Checkout: Pago y Confirmación

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/design/08_arbol_pantallas_publico.md secciones "Paso 5.3" y "Paso 5.4"
@docs/design/09_flujo_compra_reglas.md secciones "Paso 5.3" y "Paso 5.4"
@web/lib/store/cart.ts

Los endpoints necesarios son:
- POST /public/:slug/orders  (crea el pedido en base de datos)
Los métodos de pago disponibles vienen del endpoint del restaurante
ya cargado (campo payment_methods del local).

Implementa en dos archivos:

ARCHIVO 1: web/app/(public)/[slug]/checkout/pago/page.tsx
- Indicador de progreso: Datos > Despacho > Pago [activo] > Confirmar
- Lista de métodos de pago habilitados del local como cards/radio buttons
- El sistema NO asume ningún método por defecto (regla #8)
- Botón "Continuar" deshabilitado hasta seleccionar uno
- Al continuar: setPaymentMethod(method) en el store y navegar a confirmar

ARCHIVO 2: web/app/(public)/[slug]/checkout/confirmar/page.tsx
- Indicador de progreso: Datos > Despacho > Pago > Confirmar [activo]
- Resumen completo del pedido (todo el estado del store)
- Aviso: "Se abrirá WhatsApp con tu pedido. Solo toca enviar."
- Botón "Enviar pedido por WhatsApp":
  1. Primero: POST /public/:slug/orders con todos los datos del store
     → si metodo_pago = 'transferencia': estado = 'pendiente_pago'
     → otros métodos: estado = 'confirmado'
  2. Guardar el order_id retornado: setOrderId(id) en el store
  3. Construir el link wa.me/{telefono_local}?text={mensaje_codificado}
     El mensaje incluye: nombre cliente, ítems con variantes y extras,
     tipo despacho, dirección (si aplica), método de pago, total
  4. Abrir el link de WhatsApp en nueva pestaña
  5. Redirigir a /:slug/pedido/estado?id={orderId}
```

---

### SESIÓN 8.10 — Pantalla: Estado del pedido

```prompt
Actúa como frontend-dashboard-builder.

Lee:
@docs/design/08_arbol_pantallas_publico.md sección "Pantalla 6"
@docs/design/10_contratos_datos_publico.md sección "Pantalla 6"

El endpoint es:
GET /public/:slug/orders/:pedido_codigo
(ya implementado en el backend)

Implementa web/app/(public)/[slug]/pedido/estado/page.tsx.

Recibe el order_id como query param: ?id={order_id}

LAYOUT:
- Código del pedido (grande, visible)
- Estado actual con icono:
    en_curso → "Recibiendo tu pedido..." (spinner)
    confirmado → "✓ Pedido recibido"
    en_preparacion → "🍕 En preparación"
    listo → "✓ Listo para retiro" o "🛵 En camino" según tipo despacho
    pendiente_pago → "⏳ Esperando pago"
- Si metodo_pago = 'transferencia': mostrar datos bancarios del local
  con instrucciones de pago (banco, titular, IBAN, concepto con el
  código del pedido)
- Resumen de ítems pedidos (del campo items jsonb del pedido)
- Tiempo estimado (config_operativa.tiempo_espera_minutos)
- Botón "Hacer otro pedido" → /:slug/menu (limpia el store con clearCart())

POLLING:
- En MVP: polling cada 30 segundos con fetch al mismo endpoint
  para actualizar el estado. Detener el polling si el estado es
  'entregado' o 'cancelado'.
```

---

### SESIÓN 8.11 — QA del frontend completo

```prompt
Actúa como qa-regression-reviewer.

Lee:
@docs/design/09_flujo_compra_reglas.md
@docs/business/reglas_negocio_la_isla.md
@web/lib/store/cart.ts

Revisa el flujo completo del frontend público verificando:

REGLAS DE NEGOCIO CRÍTICAS
□ ¿La pantalla de despacho bloquea el avance si delivery y subtotal < mínimo?
□ ¿El botón de cambiar a Retiro es acción explícita del usuario (no automática)?
□ ¿Ninguna pantalla asume un método de pago por defecto?
□ ¿La pantalla de confirmar solo es accesible si los 3 pasos anteriores
  tienen datos en el store?
□ ¿Para Retiro: en ningún momento aparece el campo de dirección?
□ ¿Si el local está cerrado: el botón "Agregar" está deshabilitado?

FLUJO DE DATOS
□ ¿El store se limpia (clearCart) al terminar un pedido exitoso?
□ ¿Si el usuario navega directamente a /checkout/confirmar sin pasar
  por los pasos anteriores, es redirigido al primer paso incompleto?
□ ¿Los precios del carrito se validan contra el API antes de hacer
  el POST del pedido?

WHATSAPP
□ ¿El mensaje de WhatsApp incluye: nombre, teléfono, ítems con variantes
  y extras, tipo despacho, dirección (solo si delivery), método de pago, total?
□ ¿El pedido se crea en la BD ANTES de abrir WhatsApp?

Si encuentras algún problema, indica el archivo exacto y la corrección.
Si todo está correcto, confirmar: "✓ Frontend público listo para prueba
en dispositivo real."
```

---

**Señal de cierre de Sesión 8:** El flujo completo funciona en el navegador:
`/:slug` → menú → detalle → carrito → checkout (3 pasos) → se abre WhatsApp con el pedido pre-armado → pantalla de estado muestra el código del pedido.

---

## RESUMEN — Qué produce cada fase

| Fase | Carpeta | Archivos generados |
|------|---------|--------------------|
| 0 — Preparación | — | Solo verificación, sin archivos |
| 1 — Auditoría | `docs/audit/` | `00` a `03` + 9 archivos n8n |
| 2 — Multi-tenant | `docs/design/` | `01` a `03` |
| 3 — Auth | `docs/design/` | `04` a `06` |
| 4 — Frontend público | `docs/design/` | `07` a `10` |
| 5 — Dashboard | `docs/design/` | `11` a `13` |
| 6 — API | `docs/design/` | `14` a `17` |
| 7 — Implementación | `docs/design/` + código | `18` a `20` + endpoints + frontend |

---

## REGLAS DE ORO para trabajar con Claude Code en este proyecto

1. **Una sesión, un objetivo.** No mezcles análisis con diseño en la misma sesión.
2. **Guarda siempre el entregable** antes de cerrar la sesión.
3. **Si Claude Code inventa algo**, escribe `/clear` y empieza de nuevo con el archivo correcto cargado.
4. **Usa `/compact`** cuando la sesión lleve más de 20 intercambios.
5. **Nunca pidas código** antes de cerrar la Fase 6.
6. **Si una propuesta viola una regla del negocio**, cita la regla exacta y pide que la corrija.
7. **Cada vez que cambias de fase**, empieza con una sesión nueva limpia.
8. **En Fase 7: un endpoint a la vez.** Implementa, revisa con QA reviewer, luego continúa.
9. **Nunca hardcodees credenciales.** Supabase URL, anon key y connection string van en variables de entorno.
10. **Bloque 0 va primero siempre.** Sin las migraciones críticas, ningún endpoint funciona correctamente.
