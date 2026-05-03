# Auditoría de Infraestructura

> Fuente: `docs/infra/dominios-y-servicios.md` + `docs/infra/hostinger-easypanel-notes.md`
> Fecha: 2026-04-20
> Estado: solo lectura — sin propuestas de cambio

---

## Servicios activos

Todos corren en el VPS Hostinger (IP `76.13.25.63`, nombre `srvi262465.hstgr.cloud`, panel EasyPanel v2.26.3).

| Servicio | Proyecto | Subdominio público | URL interna |
|---|---|---|---|
| n8n | n8learning | https://n8learning-n8n.avtsif.easypanel.host/ | `n8learning_n8n:5678` |
| Chatwoot | n8learning | https://n8learning-chatwoot.avtsif.easypanel.host/ | `n8learning_chatwoot:3000` |
| Qdrant | n8learning | https://n8learning-qdrant.avtsif.easypanel.host/ | `n8learning_qdrant:6333` |
| Supabase (Kong) | n8learning | https://n8learning-supabase.avtsif.easypanel.host/ | `n8learning_supabase_kong:8000` |
| PostgreSQL | n8learning | — (solo puerto externo 15432) | `n8learning_postgres:5432` |
| Sitio web ai2nomous | n8learning | https://ai2nomous.com/ | `n8learning_ai2nomous-website:80` |
| Sitio web (espejo) | n8learning | https://n8learning-ai2nomous-website.avtsif.easypanel.host/ | `n8learning_ai2nomous-website:80` |
| WordPress | learningliz | https://learningliz-wordpress.avtsif.easypanel.host/ | `learningliz_wordpress:80` |
| Chatwoot | learningliz | https://learningliz-chatwoot.avtsif.easypanel.host/ | `learningliz_chatwoot:3000` |
| n8n | learningliz | https://learningliz-n8n.avtsif.easypanel.host/ | `learningliz_n8n:5678` |

---

## Servicios que EasyOrder puede usar sin instalar nada nuevo

| Servicio | Cómo lo usaría EasyOrder |
|---|---|
| **PostgreSQL** (`n8learning_postgres`) | Base de datos principal. Contiene las tablas del negocio (`menu_category`, `menu_item`, `orders`, etc.). EasyOrder escribe y lee desde aquí. |
| **n8n** (`n8learning_n8n`) | Orquestador de pedidos por WhatsApp ya operativo. EasyOrder web puede disparar o complementar flujos existentes vía webhook. |
| **Chatwoot** (`n8learning_chatwoot`) | Canal de atención ya integrado con n8n. EasyOrder no necesita reemplazarlo; puede seguir siendo el punto de entrada por WhatsApp. |
| **Supabase** (`n8learning_supabase_kong`) | Disponible para Supabase Auth (autenticación del dashboard del negocio) y como capa API si se decide exponer datos vía PostgREST. |
| **Dominio** `ai2nomous.com` | DNS ya apuntado al VPS. Se pueden crear subdominios como `app.ai2nomous.com` o `order.ai2nomous.com` sin registrar un dominio nuevo. |

---

## Servicios que habría que agregar para EasyOrder

| Servicio | Propósito | Prioridad MVP |
|---|---|---|
| **Frontend EasyOrder** (Next.js o similar) | Menú digital público por local + carrito + checkout web. No existe ningún contenedor para esto. | MVP |
| **Backend API EasyOrder** (si se decide separar de n8n) | Endpoints REST para menú, pedidos web, configuración de locales. Podría ser un servicio Node/FastAPI en EasyPanel. | MVP o post-MVP según arquitectura elegida |
| **Redis** | Necesario para el buffer de mensajes en n8n. No aparece documentado como servicio visible, pero podría ya existir sin estar listado. Pendiente verificación. | Revisar antes de MVP |
| **Subdominio dedicado para EasyOrder** | Ej: `order.ai2nomous.com` o `easyorder.ai2nomous.com`. Requiere entrada DNS en Namecheap + configuración en EasyPanel. | MVP |

---

## Riesgos de la infraestructura actual

| Servicio / Recurso | Riesgo | Nivel |
|---|---|---|
| **n8n (n8learning)** | Contiene los flujos productivos de La Isla Pizzería con 70 979 ejecuciones. Cualquier cambio en workflows activos puede romper pedidos en curso. | Crítico |
| **PostgreSQL (n8learning)** | Base de datos compartida por n8n, Chatwoot y el negocio. Una migración mal ejecutada puede afectar el flujo operativo completo. | Crítico |
| **Chatwoot (n8learning)** | Canal de atención activo. No debe reconfigurarse sin coordinar con n8n. | Alto |
| **VPS único** | Todos los servicios corren en un solo VPS KVM 2. No hay redundancia. Una caída del servidor baja todo: pedidos, atención, sitio web. | Alto |
| **Puerto 15432 expuesto** | PostgreSQL tiene acceso externo habilitado. La contraseña está en texto plano en la documentación. Riesgo de exposición si los docs se comparten. | Alto |
| **VPS con expiración 2026-05-10** | El servidor vence en menos de un mes desde la fecha de esta auditoría. Si no se renueva, todo cae. | Urgente |
| **Proyecto `learningliz`** | Comparte el mismo VPS. Una mala configuración de red o de EasyPanel podría afectarlo. | Medio |

---

## Preguntas pendientes de validación

1. **¿Redis está desplegado?** El flujo de n8n usa un buffer con Redis, pero no aparece como servicio listado en los documentos disponibles. ¿Está en el mismo VPS o en otro?
2. **¿Supabase está completamente configurado?** Solo aparece el Kong (gateway). ¿Están activos Auth, PostgREST y Storage? ¿Se puede usar Supabase Auth para EasyOrder sin conflicto con el esquema PostgreSQL actual?
3. **¿Cuánta capacidad libre tiene el VPS?** Con todos los servicios actuales, ¿hay recursos suficientes para agregar el frontend y el backend de EasyOrder? No hay métricas de CPU/memoria global del servidor.
4. **¿El dominio `ai2nomous.com` es el correcto para EasyOrder?** ¿O se planea un dominio separado (`easyorder.com`, `pedidos.ai2nomous.com`, etc.)?
5. **¿Hay un entorno de staging?** ¿O todo desarrollo se prueba directo en producción?
6. **¿La renovación del VPS está confirmada?** Vence el 2026-05-10. Si no se renueva, todos los servicios caen.
7. **¿El proyecto `learningliz` tiene dependencia operativa activa?** ¿Comparte alguna base de datos o configuración con `n8learning`?
8. **¿Existe backup automatizado del VPS o de PostgreSQL?** No se menciona en los documentos disponibles.
