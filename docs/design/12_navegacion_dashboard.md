# Árbol de navegación — Dashboard Administrativo MVP
**Fecha:** 2026-04-21
**Alcance:** Módulos MVP únicamente. Post-MVP (Clientes, Métricas, Usuarios y roles) quedan fuera.
**Fuentes:** `11_modulos_dashboard.md`, `07_benchmark_visual.md`

---

## Estructura general del shell

```
/dashboard/[slug-local]/         ← raíz del tenant
├── home                         ← resumen operativo
├── pedidos                      ← lista de pedidos activos
│   └── [id]                     ← detalle del pedido
├── historial                    ← pedidos completados / cancelados
│   └── [id]                     ← detalle (reutiliza misma vista de detalle)
└── ajustes                      ← configuración del local (sub-tabs)
    ├── local                    ← datos básicos del local
    ├── menu                     ← categorías, productos, variantes, extras
    ├── horarios                 ← horario semanal + control manual
    └── delivery                 ← zonas de cobertura y costo de envío
```

---

## Sidebar lateral

El sidebar es **fijo a la izquierda**, colapsable. Muestra 5 ítems de navegación de primer nivel.

### Cabecera del sidebar

```
┌─────────────────────────────┐
│  [Logo del local]           │
│  Nombre del local activo    │
│  ● En línea   /   ○ Cerrado │
└─────────────────────────────┘
```

- El nombre del local viene del `slug-local` resuelto a `restaurantes.nombre`.
- El indicador de estado (verde/rojo) refleja el campo `is_open` + lógica de horario actual.
- El indicador se actualiza en tiempo real (polling o WebSocket).

### Ítems de navegación

| Posición | Label       | Ícono sugerido     | Ruta destino                        |
|----------|-------------|-------------------|-------------------------------------|
| 1        | Inicio      | `LayoutDashboard` | `/dashboard/[slug]/home`            |
| 2        | Pedidos     | `ShoppingBag`     | `/dashboard/[slug]/pedidos`         |
| 3        | Historial   | `ClipboardList`   | `/dashboard/[slug]/historial`       |
| 4        | Menú        | `UtensilsCrossed` | `/dashboard/[slug]/ajustes/menu`    |
| 5        | Ajustes     | `Settings`        | `/dashboard/[slug]/ajustes/local`   |

### Pie del sidebar

```
┌─────────────────────────────┐
│  Ver mi carta ↗             │  ← abre /[slug] en nueva pestaña
│  Cerrar sesión              │
└─────────────────────────────┘
```

---

## Módulos MVP — detalle

---

### Módulo: Resumen operativo

- **Ruta:** `/dashboard/[slug]/home`
- **Pantallas que contiene:**
  - Home del dashboard (pantalla única)
- **Qué muestra en la navegación lateral:** `Inicio` — ícono `LayoutDashboard`
- **Primera pantalla al entrar:** Cuatro tarjetas de estado en fila superior: _Pedidos activos_, _Pedidos hoy_, _Ingresos del día_, _En preparación_. Debajo, controles de estado del local: botones **Abrir ahora / Por horario / Cerrar ahora**. Al pie, tabla "Pedidos recientes" (últimos 5, con enlace "Ver todos" que navega a `/pedidos`).

---

### Módulo: Lista de pedidos activos

- **Ruta:** `/dashboard/[slug]/pedidos`
- **Pantallas que contiene:**
  - Lista de pedidos activos (tabla principal)
  - Detalle del pedido (`/dashboard/[slug]/pedidos/[id]`)
- **Qué muestra en la navegación lateral:** `Pedidos` — ícono `ShoppingBag` — con badge numérico si hay pedidos activos.
- **Primera pantalla al entrar:** Tabla de pedidos filtrada por `estado IN ('pendiente', 'confirmado', 'preparando', 'listo')`, ordenada por hora de creación descendente. Columnas: ID corto, cliente, tipo de despacho, estado (chip de color), monto, hora. Click en fila navega al detalle.

---

### Módulo: Detalle del pedido

- **Ruta:** `/dashboard/[slug]/pedidos/[id]`
- **Pantallas que contiene:**
  - Vista de detalle (pantalla única, accesible también desde Historial)
- **Qué muestra en la navegación lateral:** No aparece como ítem propio. Se activa al navegar desde Lista de pedidos o Historial. El ítem `Pedidos` queda activo en el sidebar.
- **Primera pantalla al entrar:** Encabezado con ID del pedido, estado actual y hora. Sección de ítems del pedido (nombre, variante, extras, subtotal por línea). Datos del cliente (nombre, teléfono). Tipo de despacho y dirección si aplica. Método de pago. Botones de cambio de estado según el estado actual (ej: _Confirmar_, _En preparación_, _Listo_, _Cancelar_).

---

### Módulo: Historial de pedidos

- **Ruta:** `/dashboard/[slug]/historial`
- **Pantallas que contiene:**
  - Lista de historial (tabla con filtros básicos)
  - Detalle del pedido histórico (`/dashboard/[slug]/historial/[id]` — reutiliza la misma vista de detalle, modo solo lectura)
- **Qué muestra en la navegación lateral:** `Historial` — ícono `ClipboardList`
- **Primera pantalla al entrar:** Tabla de pedidos con `estado IN ('entregado', 'cancelado')`, filtro de fecha (hoy / ayer / últimos 7 días / personalizado). Sin filtros avanzados en MVP. Click en fila abre detalle en modo lectura (sin botones de cambio de estado).

---

### Módulo: Gestión del menú

- **Ruta:** `/dashboard/[slug]/ajustes/menu`
- **Pantallas que contiene:**
  - Vista principal: dos columnas — categorías (izquierda) + productos de la categoría seleccionada (derecha)
  - Modal / drawer: crear / editar categoría
  - Modal / drawer: crear / editar producto (incluye variantes y extras)
- **Qué muestra en la navegación lateral:** `Menú` — ícono `UtensilsCrossed` — como ítem de primer nivel (atajo directo, sin pasar por Ajustes)
- **Primera pantalla al entrar:** Layout de dos columnas. Columna izquierda: lista de categorías con nombre y contador de productos activos, botón "+ Categoría" al pie. Columna derecha: productos de la categoría seleccionada con imagen miniatura, nombre, precio, toggle activo/inactivo, botones editar y eliminar, botón "+ Producto" en la esquina superior. Si no hay categorías, estado vacío con CTA para crear la primera.

---

### Módulo: Gestión de horarios

- **Ruta:** `/dashboard/[slug]/ajustes/horarios`
- **Pantallas que contiene:**
  - Pantalla única de configuración de horarios
- **Qué muestra en la navegación lateral:** No aparece como ítem propio en el primer nivel. Se accede desde `Ajustes` con sub-tabs: `Local | Menú | Horarios | Delivery`.
- **Primera pantalla al entrar:** Banner de estado actual ("Abierto ahora — Control manual" / "Cerrado"). Tres botones de acción inmediata: **Abrir ahora**, **Por horario**, **Cerrar ahora**. Tabla semanal Lunes–Domingo con toggle on/off por día y campos Desde/Hasta. Accesos rápidos: "Copiar lunes a todos", "Horario comercial (9–22)", "24/7".

---

### Módulo: Gestión de zonas de delivery

- **Ruta:** `/dashboard/[slug]/ajustes/delivery`
- **Pantallas que contiene:**
  - Lista de zonas definidas
  - Modal / drawer: crear / editar zona (nombre, monto mínimo, costo de envío, área de cobertura)
- **Qué muestra en la navegación lateral:** Sub-tab dentro de `Ajustes`.
- **Primera pantalla al entrar:** Tabla de zonas configuradas con columnas: nombre de zona, monto mínimo, costo de envío, acciones (editar / eliminar). Botón "+ Zona" en la esquina superior. Si no hay zonas, estado vacío con aviso de que el delivery no funcionará hasta configurar al menos una zona.

---

### Módulo: Configuración del local

- **Ruta:** `/dashboard/[slug]/ajustes/local`
- **Pantallas que contiene:**
  - Formulario de configuración (pantalla única con secciones)
- **Qué muestra en la navegación lateral:** Primer sub-tab al entrar a `Ajustes` — label `Local`.
- **Primera pantalla al entrar:** Formulario con secciones: _Identidad_ (nombre, descripción, logo), _Contacto_ (teléfono WhatsApp con selector de código de país, dirección), _Operación_ (timezone, moneda), _Pagos_ (métodos de pago activos como toggle cards: Efectivo, Transferencia, datos bancarios). Botón "Guardar cambios" al pie. Sin tabs de Branding en MVP (colores y paleta son post-MVP).

---

## Navegación interna de Ajustes

`/dashboard/[slug]/ajustes` redirige a `/dashboard/[slug]/ajustes/local`.

Sub-tabs horizontales dentro de Ajustes:

```
[ Local ]  [ Menú ]  [ Horarios ]  [ Delivery ]
```

El ítem `Ajustes` en el sidebar queda activo para todos los sub-tabs excepto `Menú`, que tiene su propio ítem de primer nivel.

> **Nota:** `Menú` aparece tanto como ítem de primer nivel en el sidebar (atajo rápido para la operación diaria) como sub-tab en Ajustes. Ambas rutas apuntan a `/dashboard/[slug]/ajustes/menu`. El ítem activo en el sidebar es `Menú` cuando se está en esa ruta, no `Ajustes`.

---

## Nombre del local activo y cambio de tenant

### Usuario con acceso a un solo local
- El nombre del local se muestra fijo en la cabecera del sidebar.
- No hay selector de tenant.
- La URL base es `/dashboard/[slug]/home`.

### Usuario con acceso a varios locales (post-MVP, diseño anticipado)
- La cabecera del sidebar muestra el nombre del local activo con un chevron (`›`) que abre un dropdown.
- El dropdown lista los locales accesibles con su estado (en línea / cerrado).
- Al seleccionar un local, navega a `/dashboard/[nuevo-slug]/home`.
- El slug en la URL cambia — cada local tiene su propia sesión de URL.

> En MVP se diseña el shell con el slot del selector visible pero sin el dropdown, para no requerir refactorizar la cabecera cuando se agregue multi-local.

---

## Pantalla de bienvenida / entrada al dashboard

**Ruta de entrada:** `/dashboard` (sin slug) → redirige según contexto:

| Condición | Destino |
|---|---|
| Usuario autenticado con un solo local | `/dashboard/[slug]/home` |
| Usuario autenticado con varios locales | `/dashboard` muestra selector de local (post-MVP) |
| Usuario no autenticado | `/login` |

No hay una pantalla de bienvenida separada en MVP. El home del dashboard (`/home`) cumple ese rol desde el primer día.

---

## Flujo de primer uso (onboarding implícito)

Si el local existe en la base pero no tiene menú ni horarios configurados, el Home muestra banners de advertencia accionables:

```
⚠ Tu menú está vacío — el frontend público no mostrará productos.  [Ir a Menú →]
⚠ No hay horarios configurados — el agente no puede validar si estás abierto.  [Ir a Horarios →]
⚠ No hay zonas de delivery — los pedidos de despacho fallarán.  [Ir a Delivery →]
```

Estos banners desaparecen cuando la condición se resuelve. No se implementa un onboarding de pasos en MVP.

---

## Resumen del árbol completo (MVP)

```
/dashboard/[slug]/
├── home
├── pedidos/
│   └── [id]
├── historial/
│   └── [id]
└── ajustes/
    ├── local          ← ruta por defecto de /ajustes
    ├── menu           ← también accesible desde sidebar primer nivel
    ├── horarios
    └── delivery
```

Total de rutas MVP: **10 rutas** (incluyendo las dinámicas `[id]` de pedidos e historial).