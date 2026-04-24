# EasyOrder / Base del proyecto

## Propósito
Construir EasyOrder, un SaaS multi-tenant para locales de comida rápida que permita:
- menú digital por local,
- pedido web sin app,
- envío estructurado del pedido al negocio por WhatsApp,
- dashboard operativo del local,
- reutilización del backend actual construido con n8n + PostgreSQL.

## Restricciones de arquitectura
- NO rehacer el backend de pedidos por WhatsApp desde cero.
- NO reemplazar PostgreSQL como base principal del negocio.
- NO romper el flujo operativo actual de La Isla Pizzería.
- NO confirmar pedidos si el flujo no pasó correctamente por Pago.
- NO asumir datos de negocio que no estén en JSON n8n, DDL, DML o documentos del proyecto.
- NO usar la tabla legacy `menu` como modelo principal si el modelo moderno `menu_category + menu_item + menu_variant + extra` está disponible.
- Priorizar cambios incrementales, compatibles y reversibles.

## Estado actual del sistema
Existe un agente operativo de pedidos por WhatsApp implementado en n8n, sin embargo este no esta en produccion , asi que los cambios que se requieran se pueden hacer, el cliente no se estara impactado, el agente se encuentra en fase de pruebas.

### Flujo principal existente
- Entrada por Chatwoot / WhatsApp
- Soporte multimodal: texto, audio, imagen y ubicación
- Buffer de mensajes con Redis
- Contexto persistido en PostgreSQL
- Validación de horario del local
- Director central que decide qué subflujo usar

### Subflujos existentes
- Apertura
- Despacho
- Pago
- Perfil Cliente
- Pedidos Cliente
- Preguntas
- Contexto
- Derivar Humano

## Reglas del negocio que Claude debe respetar
1. El flujo operativo es: Apertura -> Despacho -> Pago.
2. Si el local está cerrado, no tomar pedidos.
3. Si existe pedido reutilizable, continuar sobre ese pedido.
4. Solo abrir pedido nuevo si el cliente lo pide explícitamente.
5. Para retiro, nunca pedir dirección.
6. Para delivery:
   - validar zona,
   - validar mínimo,
   - calcular envío,
   - guardar dirección,
   - guardar tiempo_estimado.
7. Si no se alcanza el mínimo de delivery:
   - mantener delivery,
   - pedir agregar productos o cambiar a retiro,
   - no confirmar todavía.
8. No asumir método de pago.
9. Transferencia => pendiente_pago.
10. No cambiar delivery a retiro sin confirmación explícita.
11. No confirmar un pedido sin pasar por Pago.
12. Si hay reclamo o caso sensible, derivar a humano.

## Meta del SaaS EasyOrder
Evolucionar el sistema actual a un SaaS multi-tenant para múltiples locales con:
- carta digital personalizable,
- URL por local,
- pedidos web + WhatsApp compartiendo la misma base,
- dashboard,
- clientes,
- métricas,
- configuración del local,
- autenticación con Supabase Auth.

## Infraestructura actual
- VPS Hostinger
- EasyPanel
- n8n desplegado
- PostgreSQL desplegado
- Chatwoot desplegado
- Redis desplegado
- dominio principal: ai2nomous.com
- servicios adicionales como qdrant y supabase visibles en el entorno

## Forma de trabajo obligatoria
Antes de proponer cambios, Claude debe indicar:
1. qué componente tocará,
2. qué reutiliza del sistema actual,
3. qué tablas toca,
4. qué riesgo introduce,
5. si es MVP o post-MVP.

## Prohibiciones
- No inventar endpoints ni tablas sin proponerlos explícitamente.
- No modificar JSON de n8n productivo sin generar versión nueva o diff claro.
- No exponer credenciales ni copiarlas en archivos.
- No borrar reglas de negocio ya validadas.

## Entradas fuente de verdad
- /docs/n8n/
- /docs/db/DDL_restaurante_mvp.sql
- /docs/db/DML_restaurante_mvp.sql
- /docs/business/reglas_negocio_la_isla.md
- /docs/business/objetivo_MVP_EasyOrder.md

## Referencias visuales adicionales
Existe una carpeta:
- /docs/captures-navegacion/

Uso esperado:
- benchmark visual de productos similares,
- referencia para navegación,
- referencia para diseño de dashboard,
- referencia para menú digital, carrito y checkout.

Reglas de uso:
- tratar las capturas como referencia visual y funcional, no como fuente de verdad operativa;
- distinguir entre lo confirmado por captura, lo inferido y lo pendiente de validación;
- priorizar siempre las reglas reales del negocio y la arquitectura existente sobre cualquier patrón visto en capturas;
- usar las capturas para inspiración de UX, layout, jerarquía visual y módulos observables.

## Prioridades actuales
1. Auditar arquitectura actual
2. Diseñar evolución multi-tenant
3. Diseñar auth con Supabase
4. Diseñar frontend público por local
5. Diseñar dashboard del negocio
6. Definir integración web + n8n + PostgreSQL
7. Definir despliegue en Hostinger / EasyPanel

## Estilo de respuesta esperado
- concreto
- modular
- incremental
- sin teoría genérica
- con pasos accionables
- con impacto técnico claro