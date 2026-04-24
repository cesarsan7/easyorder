# Hostinger + Easypanel Notes

## VPS (Hostinger)
- **Nombre del servidor:** srvi262465.hstgr.cloud
- **Tipo:** KVM 2
- **IP pública:** 76.13.25.63
- **Estado:** Running
- **Fecha de expiración:** 2026-05-10

## Panel de control: Easypanel
- **Versión:** v2.26.3 EN
- **Acceso:** Desde el dominio/IP con el panel (interfaz web)

### Proyecto destacado: `n8learning`

#### Base de datos PostgreSQL
| Campo                | Valor                                        |
|----------------------|----------------------------------------------|
| Usuario              | postgres                                     |
| Contraseña           | P0$tgr3s                                     |
| Base de datos        | n8learning                                   |
| Host interno         | n8learning_postgres                          |
| Puerto interno       | 5432                                         |
| Host externo         | 76.13.25.63                                  |
| Puerto externo       | 15432                                        |
| **URL conexión externa** | `postgres://postgres:P0$tgr3s@76.13.25.63:15432/n8learning?sslmode=disable` |

> ⚠️ La contraseña está expuesta en la URL de conexión. Se recomienda rotarla y no compartirla en texto plano.

### Métricas del contenedor PostgreSQL (n8learning)
- **CPU:** 0.0% - 0.8%
- **Memoria:** ~110-115 MB
- **Red (subida/bajada):** 132 MB / 34.5 GB

## Workflows destacados en n8n (n8learning)

Lista de workflows visibles en el proyecto `[MVP]`:

- [MVP]Pago
- [MVP]Pizzeria
- [MVP]Apertura
- [MVP]Derivar Humano
- [MVP]Pedidos Cliente
- [MVP]Contexto
- ........

### Métricas generales de ejecución (n8n)
- **Ejecuciones totales (prod):** 70979
- **Tasa de fallo:** 0.7% (↑1.6pp)
- **Tiempo promedio de ejecución:** 4.07s (↑0.13s)
- **Tiempo ahorrado (métrica interna):** 5 (unidad no especificada)

## Otros servicios alojados en el mismo VPS
- learningliz (WordPress, Chatwoot, n8n)
- ai2nomous-website (sitio estático o WordPress)
- Supabase (Kong en puerto 8000)
- Qdrant (vectores)
- Chatwoot (atención al cliente)

> 📌 Todos los servicios están orquestados con Easypanel usando URLs internas (`<servicio>_<app>:puerto`) y expuestos públicamente mediante subdominios del tipo `*.avtsif.easypanel.host`.