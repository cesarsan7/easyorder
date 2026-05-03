# Stack Tecnológico — EasyOrder MVP
**Fecha:** 2026-04-21  
**Decisión:** Arquitecto de producto SaaS  
**Fuente:** `15_clasificacion_endpoints.md`, `16_contratos_endpoints_criticos.md`, `docs/infra/dominios-y-servicios.md`

---

## Principios que guían la elección

1. **Equipo pequeño** → un lenguaje, una convención, el mínimo de servicios nuevos.
2. **Despliegue en EasyPanel** → todo se empaqueta como Docker. Sin Kubernetes, sin CI/CD externo obligatorio.
3. **PostgreSQL en VPS es la única fuente de verdad** → el backend no escribe nada en Supabase Cloud.
4. **Supabase Cloud = solo auth** → se usa exclusivamente para `auth.users` y emisión de JWTs.
5. **n8n, Redis y PostgreSQL ya están corriendo** → el nuevo stack no puede interferir con esos servicios.

---

## Resumen de decisiones

| Capa | Stack elegido | Despliegue |
|---|---|---|
| Backend API | **Hono.js + Node.js 20 (TypeScript)** | Docker en EasyPanel |
| Frontend público | **Next.js 14 App Router (TypeScript)** | Docker en EasyPanel |
| Dashboard administrativo | **Next.js 14 App Router (mismo app)** | Mismo contenedor que el frontend |

**Total de contenedores nuevos:** 2 (backend + frontend/dashboard).

---

## 1. Backend API

### Opción A evaluada: PostgREST
- Genera REST automáticamente desde el esquema PostgreSQL.
- Cero código de endpoints repetitivos.
- **Descartado porque:**
  - Los endpoints tienen lógica no trivial que PostgREST no puede expresar: cálculo de `is_open` con timezone, validación de delivery zone, detección de double-submit, cadena de validaciones en `POST /orders`.
  - El advisory lock de `fn_set_pedido_codigo` se dispara desde un trigger — PostgREST lo invocaría, pero el control de errores del trigger y el flujo de validaciones previas no pueden orquestarse desde PostgREST sin RPCs complejas.
  - La verificación de JWT de Supabase Cloud + lookup en `local_memberships` en VPS PostgreSQL requiere middleware custom que PostgREST no provee de forma nativa.

### Opción B elegida: **Hono.js sobre Node.js 20**

**Justificación concreta:**
- Es el framework HTTP más ligero del ecosistema Node/TypeScript: imagen Docker final ~80 MB (vs ~200 MB de NestJS, ~150 MB de Express con sus dependencias típicas).
- Tiene middleware JWT nativo (`hono/jwt`) compatible con HS256 — el mismo algoritmo que Supabase Cloud usa para sus tokens.
- La base de código de n8n es JavaScript/TypeScript. El equipo ya trabaja en ese ecosistema.
- La librería `postgres` (sql template literal) conecta al PostgreSQL del VPS con pool de conexiones sin ORM — ideal para las queries específicas de los 40 endpoints.
- Un endpoint en Hono tiene 5-10 líneas. Los 40 endpoints del inventario caben en un único proyecto mantenible por 1-2 personas.
- EasyPanel despliega cualquier Dockerfile: no hay dependencia con plataformas específicas.

**Stack exacto del backend:**
```
hono@4.x               — framework HTTP
@hono/node-server      — adaptador para Node.js 20
postgres@3.x           — cliente PostgreSQL (sql template literals, tipo-seguro)
jose@5.x               — verificación JWT (alternativa a hono/jwt para más control)
zod@3.x                — validación de bodies de request
dotenv                 — variables de entorno
```

**Estructura de proyecto:**
```
/api
  /src
    /routes
      public.ts          # GET /public/:slug/*
      orders.ts          # POST /public/:slug/orders + GET /public/:slug/orders/:codigo
      dashboard.ts       # GET|PATCH /dashboard/:slug/*
    /middleware
      auth.ts            # verifica JWT Supabase + lookup local_memberships
      tenant.ts          # resuelve slug → restaurante_id
    /lib
      db.ts              # pool de conexión PostgreSQL VPS
      is-open.ts         # algoritmo is_open con turno medianoche
    index.ts
  Dockerfile
  .env.example
```

---

## 2. Frontend público + Dashboard administrativo

### Opción A evaluada: Vite + React (SPA, dos apps separadas)
- Muy rápido de desarrollar para SPAs.
- Dos apps separadas (public y dashboard) = dos Dockerfiles, dos dominios, código duplicado de componentes.
- Sin SSR: el menú digital se renderiza en cliente. Aceptable para MVP (el tráfico inicial es bajo), pero los `<meta>` para WhatsApp previews y links directos quedan vacíos sin SSR.
- **Descartado porque** mantener dos repos/apps con equipo pequeño añade fricción innecesaria.

### Opción B elegida: **Next.js 14 (App Router, TypeScript) — una sola app**

**Justificación concreta:**
- Un único contenedor sirve tanto el menú público (`/:slug/*`) como el dashboard (`/dashboard/:slug/*`). Un solo Dockerfile, un solo despliegue.
- App Router con Server Components renderiza el menú digital en el servidor: el HTML llega completo al cliente en el primer request. Los links de WhatsApp que el cliente comparta (`/:slug/pedido/estado?id=...`) tendrán previews correctos.
- `@supabase/ssr` integra Supabase Auth en Next.js App Router con dos líneas: un middleware de ruta protege todo `/dashboard/*` sin código repetitivo por página.
- TypeScript compartido con el backend (interfaces de los 40 contratos de endpoint).
- EasyPanel tiene template oficial para Next.js. Despliegue en menos de 10 minutos.
- El frontend llama al backend Hono via `fetch` (o `axios`). No accede directamente a PostgreSQL.

**Stack exacto del frontend:**
```
next@14.x                    — framework full-stack
react@18.x                   — UI
typescript                   — tipado
tailwindcss@3.x              — estilos utility-first
@supabase/ssr                — auth con Supabase Cloud en SSR/RSC
@supabase/supabase-js        — cliente Supabase para el browser (solo auth)
zustand@4.x                  — estado del carrito y checkout en cliente
```

**Estructura de rutas Next.js:**
```
/app
  /(public)
    /[slug]
      /page.tsx              # landing del local (GET /public/:slug/restaurant)
      /menu/page.tsx         # carta digital
      /checkout
        /datos/page.tsx
        /despacho/page.tsx
        /pago/page.tsx
        /confirmar/page.tsx
      /pedido
        /estado/page.tsx     # tracking del pedido
  /dashboard
    /[slug]
      /page.tsx              # home con métricas
      /pedidos/page.tsx
      /menu/page.tsx
      /configuracion/page.tsx
  /middleware.ts             # protege /dashboard/* con Supabase Auth
```

---

## Verificación del JWT de Supabase Cloud

### Flujo completo

```
Cliente (browser)
  │
  │ POST https://[proyecto].supabase.co/auth/v1/token
  │ (login con email/password desde el dashboard)
  │
  ▼
Supabase Cloud
  │ emite JWT firmado con SUPABASE_JWT_SECRET (HS256)
  ▼
Browser almacena el JWT
  │
  │ GET /dashboard/:slug/orders
  │ Authorization: Bearer <JWT>
  ▼
Backend Hono
  │ middleware auth.ts:
  │   1. Extrae el Bearer token del header
  │   2. Verifica con jose.jwtVerify(token, secret)
  │      donde secret = process.env.SUPABASE_JWT_SECRET
  │   3. Extrae payload.sub (UUID del usuario en auth.users)
  │   4. Consulta VPS PostgreSQL:
  │      SELECT restaurante_id, role
  │      FROM local_memberships
  │      WHERE user_id = $sub
  │        AND restaurante_id = $restaurante_id_del_slug
  │   5. Si no existe el registro → 403
  │   6. Si existe → continúa con c.set('restaurante_id', ...) 
  ▼
Handler del endpoint ejecuta query con restaurante_id verificado
```

### Variables de entorno del backend

```env
# PostgreSQL VPS (fuente de verdad del negocio)
DATABASE_URL=postgresql://user:pass@localhost:5432/easyorder

# Supabase Cloud (solo para verificar JWTs, NO para data)
SUPABASE_JWT_SECRET=<JWT_SECRET del proyecto Supabase Cloud>

# La SUPABASE_URL NO es necesaria en el backend
# porque el backend NO llama a la API de Supabase
# Solo el frontend usa SUPABASE_URL para el cliente de auth
```

### Variables de entorno del frontend

```env
# Supabase Cloud (solo auth)
NEXT_PUBLIC_SUPABASE_URL=https://[proyecto].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key del proyecto>

# Backend API (en el mismo VPS)
NEXT_PUBLIC_API_URL=https://api-easyorder.ai2nomous.com
```

**Garantía crítica:** El frontend (`@supabase/ssr`) usa `SUPABASE_URL` exclusivamente para autenticar usuarios (login, refresh token, sesión). **No lee ni escribe ningún dato de negocio en Supabase Cloud.** Toda la data de pedidos, menú y configuración la obtiene del backend Hono, que a su vez solo lee/escribe en el PostgreSQL del VPS.

---

## Tabla `local_memberships` (VPS PostgreSQL)

Esta tabla vive en el mismo PostgreSQL del VPS donde está toda la data del negocio. Conecta el UUID de `auth.users` (Supabase Cloud) con el `restaurante_id` del VPS.

```sql
CREATE TABLE public.local_memberships (
  id          SERIAL PRIMARY KEY,
  user_id     UUID        NOT NULL,  -- auth.users.id de Supabase Cloud
  restaurante_id INTEGER NOT NULL REFERENCES public.restaurante(id) ON DELETE CASCADE,
  role        VARCHAR(20) DEFAULT 'owner' NOT NULL,
  created_at  TIMESTAMP   DEFAULT NOW(),
  CONSTRAINT local_memberships_user_restaurante_unique UNIQUE (user_id, restaurante_id)
);
CREATE INDEX idx_local_memberships_user ON public.local_memberships (user_id);

-- Poblar La Isla Pizzería (una vez que el operador tenga usuario en Supabase Cloud)
-- INSERT INTO local_memberships (user_id, restaurante_id, role)
-- VALUES ('<UUID del operador en Supabase>', 1, 'owner');
```

**Nota:** No se crea FK hacia `auth.users` porque esa tabla vive en Supabase Cloud (instancia externa). El vínculo se mantiene por convención: el `user_id` en `local_memberships` debe corresponder a un UUID existente en `auth.users` del proyecto Supabase. La validación ocurre al verificar el JWT — si el JWT es válido, el `sub` es un UUID real de `auth.users`.

---

## Despliegue en EasyPanel

### Servicio 1: `easyorder-api` (Hono backend)

```yaml
# Configuración EasyPanel (equivalente)
nombre: easyorder-api
imagen: build desde Dockerfile
puerto: 3001
dominio: api-easyorder.avtsif.easypanel.host  # o subdominio custom
variables_entorno:
  DATABASE_URL: postgresql://...@postgres_host:5432/easyorder
  SUPABASE_JWT_SECRET: <secret>
  PORT: 3001
  NODE_ENV: production
```

**Dockerfile del backend:**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### Servicio 2: `easyorder-web` (Next.js)

```yaml
nombre: easyorder-web
imagen: build desde Dockerfile
puerto: 3000
dominio: easyorder.avtsif.easypanel.host  # o easyorder.ai2nomous.com
variables_entorno:
  NEXT_PUBLIC_SUPABASE_URL: https://[proyecto].supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY: <anon key>
  NEXT_PUBLIC_API_URL: https://api-easyorder.avtsif.easypanel.host
  NODE_ENV: production
```

**Dockerfile del frontend:**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

> Requiere `output: 'standalone'` en `next.config.js`.

---

## Red interna en EasyPanel

EasyPanel corre sobre Docker Compose interno. Los servicios se comunican por red interna. La conexión del backend a PostgreSQL usa el hostname interno del servicio PostgreSQL existente (ej: `n8learning_postgres` o similar según cómo esté registrado en EasyPanel).

Verificar el hostname interno antes de configurar `DATABASE_URL`:
```bash
# En la terminal del VPS
docker network ls
docker network inspect easypanel
# Buscar el nombre del servicio PostgreSQL
```

---

## Lo que NO cambia

| Componente | Estado |
|---|---|
| PostgreSQL VPS | Sin cambios — sigue siendo la única fuente de verdad |
| n8n | Sin cambios — sigue gestionando el canal WhatsApp |
| Redis | Sin cambios — sigue siendo el buffer de n8n |
| Chatwoot | Sin cambios |
| Supabase Cloud | Solo `auth.users` + JWT — sin tablas de negocio |

---

## Orden de bootstrapping del stack

```
Semana 1 — Fundación
  1. Crear proyecto en Supabase Cloud (free tier)
  2. Aplicar migraciones críticas en PostgreSQL VPS:
     - M-1: DROP TRIGGER tg_set_pedido_codigo
     - M-2: ADD COLUMN slug a restaurante + SET slug='la-isla'
     - M-3: ADD COLUMN payment_methods a restaurante
     - M-4: ADD COLUMN canal a pedidos
     - M-5: DELETE restaurante_config WHERE config_key='timezone'
     - Crear tabla local_memberships
  3. Crear servicio easyorder-api en EasyPanel (Hono)
     → Implementar middleware de auth + tenant
     → Implementar Bloque 1 (endpoints de solo lectura)
  4. Crear servicio easyorder-web en EasyPanel (Next.js)
     → Implementar /:slug/menu con datos reales del API

Semana 2 — Flujo de compra
  5. Implementar Bloque 2 (checkout completo + POST /orders)
  6. Probar flujo completo: menú → carrito → checkout → tracking

Semana 3 — Dashboard
  7. Implementar Bloque 3 (dashboard: pedidos + cambio de estado)
  8. Login con Supabase Auth en /dashboard
  9. Crear usuario operador en Supabase Cloud + insertar en local_memberships

Semana 4 — CRUD y refinamiento
  10. Implementar Bloque 4 (CRUD menú, zonas, horarios, configuración)
  11. Aplicar migraciones Fase 3-5 (NOT NULL, constraints multi-tenant)
```
