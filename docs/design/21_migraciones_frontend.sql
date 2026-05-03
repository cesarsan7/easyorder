-- =============================================================================
-- EasyOrder MVP — Migraciones Frontend Público
-- Documento de referencia: docs/design/10_contratos_datos_publico.md
-- Fecha: 2026-04-22
-- Estado: LISTO PARA APLICAR
--
-- PREREQUISITO: Las migraciones de Bloque 0 (19_migraciones_bloque0.sql)
-- ya deben estar aplicadas (slug y payment_methods deben existir en restaurante).
--
-- INSTRUCCIONES:
--   Ejecutar los pasos en orden.
--   Verificar cada paso antes de continuar.
-- =============================================================================


-- =============================================================================
-- PASO 1 — Agregar columnas de identidad visual a restaurante
-- WHY: El frontend público muestra el logo, descripción y color de marca
--   en el header de todas las pantallas. Sin estas columnas, el local
--   no puede personalizarse visualmente y todas las cartas se ven iguales.
-- =============================================================================

ALTER TABLE public.restaurante
    ADD COLUMN IF NOT EXISTS logo_url    TEXT,
    ADD COLUMN IF NOT EXISTS descripcion TEXT,
    ADD COLUMN IF NOT EXISTS brand_color VARCHAR(7) DEFAULT '#E63946';
-- brand_color en hex (#RRGGBB). Default: rojo vibrante genérico.

-- VERIFICACIÓN POST-MIGRACIÓN (Paso 1):
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'restaurante'
  AND column_name IN ('logo_url', 'descripcion', 'brand_color')
ORDER BY column_name;
-- Resultado esperado: 3 filas

-- ROLLBACK (Paso 1):
-- ALTER TABLE public.restaurante
--     DROP COLUMN IF EXISTS logo_url,
--     DROP COLUMN IF EXISTS descripcion,
--     DROP COLUMN IF EXISTS brand_color;


-- =============================================================================
-- PASO 2 — Agregar columnas de configuración de despacho a restaurante
-- WHY: La pantalla de carrito y checkout/despacho necesita saber:
--   - Si el local acepta delivery (delivery_enabled)
--   - Si el local acepta retiro en local (pickup_enabled)
--   - El monto mínimo para hacer un pedido con delivery (delivery_min_order)
--   Sin estas columnas, el frontend no puede mostrar las opciones correctas
--   ni validar el mínimo de delivery (regla de negocio #7).
-- =============================================================================

ALTER TABLE public.restaurante
    ADD COLUMN IF NOT EXISTS delivery_enabled   BOOL           DEFAULT true  NOT NULL,
    ADD COLUMN IF NOT EXISTS pickup_enabled     BOOL           DEFAULT true  NOT NULL,
    ADD COLUMN IF NOT EXISTS delivery_min_order NUMERIC(10,2)  DEFAULT 0.00  NOT NULL;

-- VERIFICACIÓN POST-MIGRACIÓN (Paso 2):
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'restaurante'
  AND column_name IN ('delivery_enabled', 'pickup_enabled', 'delivery_min_order')
ORDER BY column_name;
-- Resultado esperado: 3 filas, todas NOT NULL con sus defaults

-- ROLLBACK (Paso 2):
-- ALTER TABLE public.restaurante
--     DROP COLUMN IF EXISTS delivery_enabled,
--     DROP COLUMN IF EXISTS pickup_enabled,
--     DROP COLUMN IF EXISTS delivery_min_order;


-- =============================================================================
-- PASO 3 — Agregar columnas de producto a menu_item
-- WHY: La pantalla de menú y detalle de producto necesita:
--   - image_url: mostrar imagen del producto en la card y en el detalle
--   - base_price: precio cuando el ítem no tiene variantes (ej: una bebida
--     que no tiene opciones de tamaño). En el DDL actual, el precio siempre
--     está en menu_variant. Para ítems sin variante, base_price es el precio
--     directo visible en la carta.
-- =============================================================================

ALTER TABLE public.menu_item
    ADD COLUMN IF NOT EXISTS image_url  TEXT,
    ADD COLUMN IF NOT EXISTS base_price NUMERIC(10,2) DEFAULT 0.00;

-- VERIFICACIÓN POST-MIGRACIÓN (Paso 3):
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'menu_item'
  AND column_name IN ('image_url', 'base_price')
ORDER BY column_name;
-- Resultado esperado: 2 filas

-- ROLLBACK (Paso 3):
-- ALTER TABLE public.menu_item
--     DROP COLUMN IF EXISTS image_url,
--     DROP COLUMN IF EXISTS base_price;


-- =============================================================================
-- PASO 4 — Poblar configuración inicial del tenant activo (La Isla Pizzería)
-- WHY: Las nuevas columnas tienen defaults razonables pero no reflejan
--   la configuración real del negocio. Se populan con valores reales.
--
-- ACCIÓN REQUERIDA: Confirmar con el cliente los valores de:
--   - logo_url: URL pública del logo (puede ser null si no tiene imagen todavía)
--   - descripcion: texto corto de presentación del local
--   - brand_color: color hexadecimal de marca (ej: '#C8102E' para rojo)
--   - delivery_min_order: monto mínimo real para delivery en €
--
-- Por ahora se insertan valores de ejemplo que deben reemplazarse.
-- =============================================================================

UPDATE public.restaurante
SET
    descripcion      = 'Pizzas artesanales y menú mediterráneo en Las Palmas de Gran Canaria.',
    brand_color      = '#C8102E',
    delivery_enabled = true,
    pickup_enabled   = true,
    delivery_min_order = 12.00
WHERE id = 1;

-- logo_url se deja NULL hasta tener la URL real del logo subido.

-- VERIFICACIÓN POST-MIGRACIÓN (Paso 4):
SELECT id, nombre, slug, descripcion, brand_color,
       delivery_enabled, pickup_enabled, delivery_min_order,
       logo_url
FROM public.restaurante
WHERE id = 1;
-- Resultado esperado: todos los campos rellenos excepto logo_url (NULL por ahora)

-- ROLLBACK (Paso 4):
-- UPDATE public.restaurante
-- SET descripcion = NULL, brand_color = '#E63946',
--     delivery_enabled = true, pickup_enabled = true,
--     delivery_min_order = 0.00
-- WHERE id = 1;


-- =============================================================================
-- VERIFICACIÓN GLOBAL — Estado final tras los 4 pasos
-- =============================================================================

-- Columnas nuevas en restaurante:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'restaurante'
  AND column_name IN (
      'logo_url', 'descripcion', 'brand_color',
      'delivery_enabled', 'pickup_enabled', 'delivery_min_order'
  )
ORDER BY column_name;
-- Resultado esperado: 6 filas

-- Columnas nuevas en menu_item:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'menu_item'
  AND column_name IN ('image_url', 'base_price')
ORDER BY column_name;
-- Resultado esperado: 2 filas

-- Estado completo del tenant activo:
SELECT id, nombre, slug, zona_horaria,
       payment_methods,
       delivery_enabled, pickup_enabled, delivery_min_order,
       brand_color, descripcion,
       CASE WHEN logo_url IS NOT NULL THEN 'CON LOGO' ELSE 'SIN LOGO (pendiente)' END AS logo_estado,
       CASE WHEN datos_bancarios IS NOT NULL THEN 'CONFIGURADO' ELSE 'PENDIENTE' END AS banco_estado
FROM public.restaurante
WHERE id = 1;
