-- =============================================================================
-- EasyOrder MVP — Bloque 0: Migraciones críticas
-- Documento de referencia: docs/design/17_revision_regresion_diseno.md
-- Fecha: 2026-04-21
-- Estado: LISTO PARA APLICAR
--
-- INSTRUCCIONES:
--   Ejecutar los pasos en el orden exacto indicado.
--   Verificar cada paso antes de continuar con el siguiente.
--   En caso de fallo, usar el comando ROLLBACK indicado en cada sección.
--
-- PREREQUISITO: ejecutar dentro de una sesión con rol de superusuario o
-- con permisos DDL sobre el schema public.
-- =============================================================================


-- =============================================================================
-- PASO 1 — DROP TRIGGER tg_set_pedido_codigo
-- WHY: Existen dos triggers BEFORE INSERT sobre `pedidos` con nombres similares.
--   PostgreSQL los ejecuta en orden alfabético: `tg_` precede a `trg_`, por lo
--   que `tg_set_pedido_codigo` (SIN advisory lock) dispara primero y asigna el
--   pedido_codigo. Cuando `trg_set_pedido_codigo` (CON advisory lock) dispara
--   después, ve que el campo ya no es NULL y no hace nada. El advisory lock
--   nunca se adquiere, lo que permite colisiones de pedido_codigo bajo carga
--   concurrente. Hay que eliminar el trigger sin lock para que solo quede el
--   trigger correcto.
-- REFERENCIA: NF-1 del documento de revisión de regresión.
-- =============================================================================

-- Verificación previa: confirmar que ambos triggers existen antes de actuar
SELECT tgname, tgfoid::regproc AS funcion_trigger, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.pedidos'::regclass
  AND tgname LIKE '%pedido_codigo%'
ORDER BY tgname;
-- Resultado esperado: dos filas (tg_set_pedido_codigo y trg_set_pedido_codigo)

-- Aplicar solo si el trigger problemático existe
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.pedidos'::regclass
          AND tgname = 'tg_set_pedido_codigo'
    ) THEN
        DROP TRIGGER tg_set_pedido_codigo ON public.pedidos;
        RAISE NOTICE 'PASO 1: Trigger tg_set_pedido_codigo eliminado correctamente.';
    ELSE
        RAISE NOTICE 'PASO 1: Trigger tg_set_pedido_codigo no existe. Nada que hacer.';
    END IF;
END;
$$;

-- VERIFICACIÓN POST-MIGRACIÓN (Paso 1):
-- Solo debe quedar trg_set_pedido_codigo apuntando a fn_set_pedido_codigo
SELECT tgname, tgfoid::regproc AS funcion_trigger, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.pedidos'::regclass
  AND tgname LIKE '%pedido_codigo%';
-- Resultado esperado: exactamente una fila → trg_set_pedido_codigo / fn_set_pedido_codigo

-- ROLLBACK (Paso 1):
-- No hay rollback destructivo para un DROP TRIGGER. Si se necesita restaurar:
-- Revisar el DDL original en docs/db/DDL_restaurante_mvp.sql y re-crear
-- tg_set_pedido_codigo solo si hay evidencia de que era el trigger correcto.
-- En ningún caso re-crear sin confirmar cuál función llama al advisory lock.
-- CREATE TRIGGER tg_set_pedido_codigo BEFORE INSERT ON public.pedidos
--   FOR EACH ROW EXECUTE FUNCTION trg_set_pedido_codigo();


-- =============================================================================
-- PASO 2 — Agregar columna slug a restaurante
-- WHY: El modelo de routing público usa `slug` como identificador de tenant en
--   las URLs (/public/:slug/...). Sin esta columna, ningún endpoint público
--   puede resolver el restaurante a partir de la URL.
-- =============================================================================

ALTER TABLE public.restaurante
ADD COLUMN IF NOT EXISTS slug VARCHAR(100) UNIQUE;

-- VERIFICACIÓN POST-MIGRACIÓN (Paso 2):
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'restaurante'
  AND column_name = 'slug';
-- Resultado esperado: una fila con data_type='character varying', length=100

-- También verificar que el UNIQUE constraint existe:
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'restaurante'
  AND indexdef ILIKE '%slug%';

-- ROLLBACK (Paso 2):
-- ALTER TABLE public.restaurante DROP COLUMN IF EXISTS slug;


-- =============================================================================
-- PASO 3 — Poblar slug del tenant activo
-- WHY: La URL pública del tenant activo (La Isla Pizzería, id=1) es 'la-isla'.
--   Sin este valor, las llamadas a GET /public/la-isla/... retornarán 404.
-- =============================================================================

UPDATE public.restaurante
SET slug = 'la-isla'
WHERE id = 1
  AND slug IS NULL;

-- VERIFICACIÓN POST-MIGRACIÓN (Paso 3):
SELECT id, nombre, slug
FROM public.restaurante
WHERE id = 1;
-- Resultado esperado: id=1, slug='la-isla'

-- ROLLBACK (Paso 3):
-- UPDATE public.restaurante SET slug = NULL WHERE id = 1 AND slug = 'la-isla';


-- =============================================================================
-- PASO 4 — Agregar columna payment_methods a restaurante
-- WHY: La tabla restaurante no tiene columna payment_methods. El endpoint
--   POST /public/:slug/orders necesita validar que el método de pago enviado
--   por el cliente esté habilitado para ese restaurante. Sin esta columna, no
--   hay forma de hacer esa validación por tenant.
-- REFERENCIA: B-3 y NF-5 del documento de revisión de regresión.
-- =============================================================================

ALTER TABLE public.restaurante
ADD COLUMN IF NOT EXISTS payment_methods JSONB
    DEFAULT '["efectivo","transferencia","tarjeta","bizum","online"]'::jsonb;

-- VERIFICACIÓN POST-MIGRACIÓN (Paso 4):
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'restaurante'
  AND column_name = 'payment_methods';
-- Resultado esperado: una fila con data_type='jsonb' y el default como string

-- ROLLBACK (Paso 4):
-- ALTER TABLE public.restaurante DROP COLUMN IF EXISTS payment_methods;


-- =============================================================================
-- PASO 5 — Poblar payment_methods del tenant activo con sus métodos reales
-- WHY: El default cubre todos los métodos posibles. La Isla Pizzería acepta
--   únicamente efectivo y transferencia según sus FAQs. Se sobreescribe para
--   reflejar la configuración real del negocio.
-- =============================================================================

UPDATE public.restaurante
SET payment_methods = '["efectivo","transferencia"]'::jsonb
WHERE id = 1;

-- VERIFICACIÓN POST-MIGRACIÓN (Paso 5):
SELECT id, nombre, payment_methods
FROM public.restaurante
WHERE id = 1;
-- Resultado esperado: payment_methods = ["efectivo","transferencia"]

-- También verificar que el valor es JSONB válido y consultable:
SELECT id,
       payment_methods,
       jsonb_array_length(payment_methods) AS num_metodos
FROM public.restaurante
WHERE id = 1;
-- Resultado esperado: num_metodos = 2

-- ROLLBACK (Paso 5):
-- UPDATE public.restaurante
-- SET payment_methods = '["efectivo","transferencia","tarjeta","bizum","online"]'::jsonb
-- WHERE id = 1;


-- =============================================================================
-- PASO 6 — Agregar columna canal a pedidos
-- WHY: Los pedidos web y los pedidos de WhatsApp conviven en la misma tabla.
--   Sin una columna que los diferencie, el dashboard del operador no puede
--   filtrar por canal ni mostrar el origen del pedido. El default 'whatsapp'
--   preserva el comportamiento existente para todos los pedidos previos.
-- REFERENCIA: RC-4 del documento de revisión de regresión.
-- =============================================================================

ALTER TABLE public.pedidos
ADD COLUMN IF NOT EXISTS canal VARCHAR(20)
    NOT NULL DEFAULT 'whatsapp';

-- VERIFICACIÓN POST-MIGRACIÓN (Paso 6):
SELECT column_name, data_type, character_maximum_length,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pedidos'
  AND column_name = 'canal';
-- Resultado esperado: NOT NULL con default 'whatsapp'

-- Verificar que pedidos existentes recibieron el default:
SELECT canal, COUNT(*) AS total
FROM public.pedidos
GROUP BY canal;
-- Resultado esperado: todas las filas existentes tienen canal='whatsapp'

-- ROLLBACK (Paso 6):
-- ALTER TABLE public.pedidos DROP COLUMN IF EXISTS canal;


-- =============================================================================
-- PASO 7 — Eliminar la key 'timezone' de restaurante_config
-- WHY: Existen dos fuentes de timezone en conflicto:
--   restaurante.zona_horaria = 'Atlantic/Canary'  (CORRECTO)
--   restaurante_config(config_key='timezone') = 'America/New_York'  (INCORRECTO)
--   La columna restaurante.zona_horaria es la fuente de verdad. La key en
--   restaurante_config es un residuo de configuración errónea que podría causar
--   que algún endpoint calcule el horario de apertura con timezone incorrecta.
-- REFERENCIA: NF-4 del documento de revisión de regresión.
-- =============================================================================

-- Verificación previa: confirmar que la key conflictiva existe
SELECT config_key, config_value
FROM public.restaurante_config
WHERE config_key = 'timezone';
-- Si devuelve filas con config_value='America/New_York', proceder con el DELETE.

DELETE FROM public.restaurante_config
WHERE config_key = 'timezone';

-- Confirmar que la zona horaria correcta sigue en restaurante:
SELECT id, nombre, zona_horaria
FROM public.restaurante
WHERE id = 1;
-- Resultado esperado: zona_horaria = 'Atlantic/Canary'

-- VERIFICACIÓN POST-MIGRACIÓN (Paso 7):
SELECT COUNT(*) AS keys_timezone_restantes
FROM public.restaurante_config
WHERE config_key = 'timezone';
-- Resultado esperado: 0

-- ROLLBACK (Paso 7):
-- INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
-- VALUES (1, 'timezone', 'America/New_York')
-- ON CONFLICT DO NOTHING;
-- NOTA: el rollback restaura el estado previo (incorrecto), solo usar si hay
-- dependencia conocida de n8n sobre esta key que deba resolverse primero.


-- =============================================================================
-- PASO 8 — Actualizar datos_bancarios del tenant activo
-- WHY: El DML inicial inserta datos_bancarios = NULL para el restaurante id=1.
--   El endpoint GET /public/:slug/orders/:pedido_codigo devuelve los datos de
--   transferencia cuando metodo_pago = 'transferencia'. Con NULL, el cliente
--   no recibe las instrucciones bancarias y no puede completar el pago.
--
-- ACCIÓN REQUERIDA ANTES DE EJECUTAR:
--   Confirmar con el cliente (La Isla Pizzería) los siguientes datos reales:
--     - Nombre del banco
--     - Nombre del titular de la cuenta
--     - IBAN completo
--     - Concepto que deben usar los clientes en la transferencia
--   Reemplazar el valor COMPLETAR_CON_DATOS_REALES_DEL_CLIENTE por el JSON
--   real antes de ejecutar este paso.
--
-- REFERENCIA: NF-3 del documento de revisión de regresión.
-- =============================================================================

-- ¡¡LEER ANTES DE EJECUTAR!! Reemplazar el JSON con los datos reales del cliente.
-- Estructura esperada del JSON:
-- {
--   "banco":    "Nombre del banco",
--   "titular":  "Nombre Apellido / Razón Social",
--   "iban":     "ES00 0000 0000 0000 0000 0000",
--   "concepto": "Pedido {pedido_codigo}"   ← el frontend sustituye {pedido_codigo}
-- }

UPDATE public.restaurante
SET datos_bancarios = 'COMPLETAR_CON_DATOS_REALES_DEL_CLIENTE'::jsonb
WHERE id = 1;

-- VERIFICACIÓN POST-MIGRACIÓN (Paso 8):
SELECT id,
       datos_bancarios,
       datos_bancarios->>'banco'   AS banco,
       datos_bancarios->>'titular' AS titular,
       datos_bancarios->>'iban'    AS iban,
       datos_bancarios->>'concepto' AS concepto
FROM public.restaurante
WHERE id = 1;
-- Resultado esperado: todos los campos rellenos con los datos reales del cliente.
-- Si algún campo es NULL, el INSERT del paso anterior no se ejecutó o el JSON
-- está mal formado.

-- ROLLBACK (Paso 8):
-- UPDATE public.restaurante SET datos_bancarios = NULL WHERE id = 1;


-- =============================================================================
-- VERIFICACIÓN GLOBAL — Confirmar estado final tras los 8 pasos
-- =============================================================================

-- 1. Triggers sobre pedidos (solo debe quedar trg_set_pedido_codigo):
SELECT tgname, tgfoid::regproc AS funcion
FROM pg_trigger
WHERE tgrelid = 'public.pedidos'::regclass
  AND tgname LIKE '%pedido_codigo%';

-- 2. Columnas nuevas en restaurante:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'restaurante'
  AND column_name IN ('slug', 'payment_methods', 'datos_bancarios')
ORDER BY column_name;

-- 3. Columna canal en pedidos:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pedidos'
  AND column_name = 'canal';

-- 4. Estado del tenant activo:
SELECT id, nombre, slug, zona_horaria, payment_methods,
       CASE WHEN datos_bancarios IS NOT NULL THEN 'CONFIGURADO' ELSE 'PENDIENTE' END AS datos_bancarios_estado
FROM public.restaurante
WHERE id = 1;

-- 5. Confirmar ausencia de key timezone conflictiva:
SELECT config_key, config_value
FROM public.restaurante_config
WHERE config_key = 'timezone';
-- Resultado esperado: 0 filas
