# Dominios y Servicios

## Dominio principal
- **Dominio:** ai2nomous.com
- **Registrador:** Namecheap
- **Servidor DNS:** ap.www.namecheap.com

## Configuración DNS (Namecheap - Advanced DNS)

| Tipo  | Host | Value                | TTL       |
|-------|------|----------------------|-----------|
| A     | @     | 76.13.25.63          | Automatic |
| CNAME | www  | ai2nomous.com.       | Automatic |
| TXT   | @     | v=spf1 include:spf.efwd.registrar-servers.com -all | Automatic |

## Subdominios y servicios asociados (Easypanel)

| Servicio / App               | Subdominio (https)                                      | URL Interna (http)                          |
|------------------------------|----------------------------------------------------------|---------------------------------------------|
| n8n (n8learning)             | https://n8learning-n8n.avtsif.easypanel.host/           | https://n8learning_n8n:5678/                |
| Chatwoot (n8learning)        | https://n8learning-chatwoot.avtsif.easypanel.host/      | https://n8learning_chatwoot:3000/           |
| Qdrant (n8learning)          | https://n8learning-qdrant.avtsif.easypanel.host/        | https://n8learning_qdrant:6333/             |
| WordPress (learningliz)      | https://learningliz-wordpress.avtsif.easypanel.host/    | https://learningliz_wordpress:80/           |
| Chatwoot (learningliz)       | https://learningliz-chatwoot.avtsif.easypanel.host/     | https://learningliz_chatwoot:3000/          |
| n8n (learningliz)            | https://learningliz-n8n.avtsif.easypanel.host/          | https://learningliz_n8n:5678/               |
| Supabase (n8learning)        | https://n8learning-supabase.avtsif.easypanel.host/      | https://n8learning_supabase_kong:8000/      |
| Sitio web (ai2nomous)        | https://ai2nomous.com/                                  | https://n8learning_ai2nomous-website:80/    |
| Sitio web (n8learning)       | https://n8learning-ai2nomous-website.avtsif.easypanel.host/ | https://n8learning_ai2nomous-website:80/ |

> ⚠️ El subdominio `ai2nomous.com` apunta directamente al servicio del sitio web en Easypanel.