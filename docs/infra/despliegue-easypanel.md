# Despliegue EasyOrder en Hostinger / EasyPanel

## Resumen de servicios

| Servicio | Subdominio | Puerto interno | Dockerfile |
|---|---|---|---|
| API (Hono) | `easyorder-api.ai2nomous.com` | 3001 | `api/Dockerfile` |
| Web (Next.js) | `easyorder.ai2nomous.com` | 3000 | `web/Dockerfile` |
| PostgreSQL | ya existe en proyecto `n8learning` | 5432 (interno) | — |

---

## Prerrequisito: subir el código a GitHub

EasyPanel construye las imágenes desde tu repositorio de GitHub.

1. Crear repo en GitHub (ej. `ai2nomous/easyorder`).
2. Subir el proyecto:
   ```bash
   cd C:\AI2nomous\easyorder
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/ai2nomous/easyorder.git
   git push -u origin main
   ```
3. En GitHub → Settings → conectar EasyPanel como GitHub App (una sola vez).

---

## Paso 1: Crear el servicio API en EasyPanel

1. Ir a EasyPanel → proyecto `n8learning` (o crear uno nuevo `easyorder`).
2. **+ New Service → App**.
3. Configurar:
   - **Name:** `easyorder-api`
   - **Source:** GitHub
   - **Repository:** `ai2nomous/easyorder`
   - **Branch:** `main`
   - **Build Context:** `api`
   - **Dockerfile Path:** `api/Dockerfile`
4. En **Domains**:
   - Agregar `easyorder-api.ai2nomous.com`
   - Port: `3001`
   - Marcar HTTPS (Let's Encrypt automático)
5. En **Environment Variables** (copiar de `api/.env.production.example`):
   ```
   DATABASE_URL=postgres://postgres:P0$tgr3s@n8learning_postgres:5432/n8learning
   SUPABASE_JWT_SECRET=<tu_jwt_secret_de_supabase>
   PORT=3001
   NODE_ENV=production
   ```
   > ⚠️ El host `n8learning_postgres` es el nombre interno del contenedor PostgreSQL dentro de EasyPanel. Solo funciona si el API está en el mismo proyecto.
6. **Deploy** → esperar el build.

---

## Paso 2: Crear el servicio Web en EasyPanel

1. **+ New Service → App** (mismo proyecto).
2. Configurar:
   - **Name:** `easyorder-web`
   - **Source:** GitHub
   - **Repository:** `ai2nomous/easyorder`
   - **Branch:** `main`
   - **Build Context:** `web`
   - **Dockerfile Path:** `web/Dockerfile`
3. En **Domains**:
   - Agregar `easyorder.ai2nomous.com`
   - Port: `3000`
   - HTTPS habilitado
4. En **Environment Variables** (también como **Build Args** para NEXT_PUBLIC_*):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xvoztrwupdxkghzfuzmd.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu_anon_key>
   NEXT_PUBLIC_API_URL=https://easyorder-api.ai2nomous.com
   NODE_ENV=production
   PORT=3000
   ```
   > ⚠️ Las variables `NEXT_PUBLIC_*` se hornean en el bundle JavaScript durante el build. **Deben estar como Build Args además de Environment Variables.** En EasyPanel, cada variable tiene un toggle "Build Arg" — activarlo para las tres NEXT_PUBLIC_*.
5. **Deploy** → esperar el build (~3-4 min).

---

## Paso 3: Verificar DNS

En el panel DNS de tu dominio `ai2nomous.com` (Hostinger u otro registrador):

| Tipo | Nombre | Valor |
|---|---|---|
| A | `easyorder` | `76.13.25.63` |
| A | `easyorder-api` | `76.13.25.63` |

EasyPanel gestiona el ruteo de subdominios via Traefik (ya incluido).

---

## Paso 4: Smoke test post-deploy

```bash
# API health
curl https://easyorder-api.ai2nomous.com/public/la-isla/restaurant

# Web (debe retornar 200)
curl -I https://easyorder.ai2nomous.com
```

---

## Flujo de actualización (deploy continuo)

Cada `git push` a `main` puede disparar un redeploy automático:
- En EasyPanel → servicio → **Deploy Hooks** → activar "Auto Deploy on Push".

O manualmente: EasyPanel → servicio → **Redeploy**.

---

## Notas importantes

### Variables NEXT_PUBLIC_* son build-time
Si cambias `NEXT_PUBLIC_API_URL`, debes hacer un **nuevo build** (no es suficiente reiniciar el contenedor). Esto es un comportamiento de Next.js, no de EasyPanel.

### PostgreSQL interno vs externo
- **Interno (recomendado):** `n8learning_postgres:5432` — más rápido, sin exposición pública.
- **Externo (alternativa):** `76.13.25.63:15432` — útil si la API está fuera del VPS.

### El host `n8learning_postgres`
EasyPanel nombra los contenedores internos como `{proyecto}_{servicio}`. Si el proyecto se llama `n8learning` y el servicio PostgreSQL se llama `postgres`, el host interno es `n8learning_postgres`. Verificar en EasyPanel → base de datos → "Internal Host".

### CORS
El API ya tiene `https://easyorder.ai2nomous.com` en su lista de orígenes permitidos. No requiere cambios.

### Supabase JWT Secret
Supabase Settings → API → JWT Secret (no el anon key, sino el secret de firma).
