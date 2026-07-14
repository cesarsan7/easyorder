-- ============================================================
-- SCRIPT: Copiar menú y configuración de restaurante origen
--         al restaurante destino recién creado en onboarding.
--
-- USO:
--   1. Cambia SOURCE_ID y TARGET_SLUG en el bloque de variables (líneas ~20-21)
--   2. Ejecuta completo en Supabase SQL Editor
--
-- QUÉ COPIA: restaurante_config, config_operativa, horarios,
--            delivery_zone, faqs, menu_category, menu_item,
--            menu_variant, extra, menu_item_extra
-- QUÉ NO COPIA: pedidos, usuarios, contexto, n8n_chat_histories,
--               local_memberships, config bot (whatsapp/chatwoot)
-- ============================================================

DO $$
DECLARE
  SOURCE_ID   INT  := 1;                  -- ← CAMBIAR: id del restaurante origen
  TARGET_SLUG TEXT := 'la-isla-pizzeria'; -- ← CAMBIAR: slug del restaurante destino

  TARGET_ID   INT;
  old_id      BIGINT;
  new_id      BIGINT;
  r           RECORD;
BEGIN

  -- ── 0. Resolver TARGET_ID ─────────────────────────────────────────────────
  SELECT id INTO TARGET_ID FROM public.restaurante WHERE slug = TARGET_SLUG;
  IF TARGET_ID IS NULL THEN
    RAISE EXCEPTION 'No se encontró ningún restaurante con slug = %', TARGET_SLUG;
  END IF;
  RAISE NOTICE 'Copiando restaurante_id=% → id=% (%)', SOURCE_ID, TARGET_ID, TARGET_SLUG;

  -- Tablas temporales para mapeo old_id → new_id (sin hstore)
  CREATE TEMP TABLE IF NOT EXISTS _cat_map   (old_id BIGINT, new_id BIGINT) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _item_map  (old_id BIGINT, new_id BIGINT) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _extra_map (old_id BIGINT, new_id BIGINT) ON COMMIT DROP;
  TRUNCATE _cat_map, _item_map, _extra_map;

  -- ── 1. restaurante_config ─────────────────────────────────────────────────
  INSERT INTO public.restaurante_config
    (restaurante_id, config_key, config_value, description, updated_at)
  SELECT
    TARGET_ID, config_key, config_value, description, NOW()
  FROM public.restaurante_config
  WHERE restaurante_id = SOURCE_ID
    AND config_key NOT IN (
      'bot_activo','whatsapp_number',
      'chatwoot_webhook_prod','chatwoot_webhook_test','chatwoot_inbox_id'
    )
  ON CONFLICT (config_key, restaurante_id)
    DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW();

  RAISE NOTICE '✓ restaurante_config';

  -- ── 2. config_operativa ───────────────────────────────────────────────────
  INSERT INTO public.config_operativa
    (restaurante_id, tiempo_espera_minutos, mensaje_tiempo_espera)
  SELECT TARGET_ID, tiempo_espera_minutos, mensaje_tiempo_espera
  FROM public.config_operativa
  WHERE restaurante_id = SOURCE_ID
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✓ config_operativa';

  -- ── 3. horarios ───────────────────────────────────────────────────────────
  INSERT INTO public.horarios
    (restaurante_id, dia, disponible, apertura_1, cierre_1, apertura_2, cierre_2)
  SELECT TARGET_ID, dia, disponible, apertura_1, cierre_1, apertura_2, cierre_2
  FROM public.horarios
  WHERE restaurante_id = SOURCE_ID
  ON CONFLICT (restaurante_id, dia)
    DO UPDATE SET
      disponible = EXCLUDED.disponible,
      apertura_1 = EXCLUDED.apertura_1,
      cierre_1   = EXCLUDED.cierre_1,
      apertura_2 = EXCLUDED.apertura_2,
      cierre_2   = EXCLUDED.cierre_2;

  RAISE NOTICE '✓ horarios';

  -- ── 4. delivery_zone ──────────────────────────────────────────────────────
  INSERT INTO public.delivery_zone (
    restaurante_id, postal_code, zone_name, fee, is_active,
    description, min_order_amount, estimated_minutes_min, estimated_minutes_max
  )
  SELECT
    TARGET_ID, postal_code, zone_name, fee, is_active,
    description, min_order_amount, estimated_minutes_min, estimated_minutes_max
  FROM public.delivery_zone
  WHERE restaurante_id = SOURCE_ID
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✓ delivery_zone';

  -- ── 5. faqs ───────────────────────────────────────────────────────────────
  INSERT INTO public.faqs (restaurante_id, pregunta, respuesta, activo, created_at)
  SELECT TARGET_ID, pregunta, respuesta, activo, NOW()
  FROM public.faqs
  WHERE restaurante_id = SOURCE_ID
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✓ faqs';

  -- ── 6. menu_category ──────────────────────────────────────────────────────
  FOR r IN
    SELECT * FROM public.menu_category
    WHERE restaurante_id = SOURCE_ID
    ORDER BY sort_order
  LOOP
    INSERT INTO public.menu_category
      (restaurante_id, name, sort_order, is_active, created_at)
    VALUES (TARGET_ID, r.name, r.sort_order, r.is_active, NOW())
    RETURNING menu_category_id INTO new_id;

    INSERT INTO _cat_map VALUES (r.menu_category_id, new_id);
  END LOOP;

  RAISE NOTICE '✓ menu_category (% categorías)', (SELECT COUNT(*) FROM _cat_map);

  -- ── 7. menu_item ──────────────────────────────────────────────────────────
  FOR r IN
    SELECT * FROM public.menu_item
    WHERE restaurante_id = SOURCE_ID
    ORDER BY menu_item_id
  LOOP
    SELECT new_id INTO new_id
    FROM _cat_map WHERE old_id = r.menu_category_id;

    INSERT INTO public.menu_item (
      restaurante_id, menu_category_id, name, description,
      price, is_active, allergens, tags, image_url, created_at
    )
    VALUES (
      TARGET_ID, new_id, r.name, r.description,
      r.price, r.is_active, r.allergens, r.tags, r.image_url, NOW()
    )
    RETURNING menu_item_id INTO new_id;

    INSERT INTO _item_map VALUES (r.menu_item_id, new_id);
  END LOOP;

  RAISE NOTICE '✓ menu_item (% productos)', (SELECT COUNT(*) FROM _item_map);

  -- ── 8. menu_variant ───────────────────────────────────────────────────────
  FOR r IN
    SELECT mv.*
    FROM public.menu_variant mv
    JOIN public.menu_item mi ON mi.menu_item_id = mv.menu_item_id
    WHERE mi.restaurante_id = SOURCE_ID
    ORDER BY mv.menu_variant_id
  LOOP
    SELECT new_id INTO new_id
    FROM _item_map WHERE old_id = r.menu_item_id;

    IF new_id IS NOT NULL THEN
      INSERT INTO public.menu_variant (
        menu_item_id, restaurante_id, variant_name, price,
        sku, is_default, is_active, created_at
      )
      VALUES (
        new_id, TARGET_ID, r.variant_name, r.price,
        r.sku, r.is_default, r.is_active, NOW()
      );
    END IF;
  END LOOP;

  RAISE NOTICE '✓ menu_variant';

  -- ── 9. extra ──────────────────────────────────────────────────────────────
  FOR r IN
    SELECT * FROM public.extra
    WHERE restaurante_id = SOURCE_ID
    ORDER BY extra_id
  LOOP
    INSERT INTO public.extra
      (restaurante_id, name, price, is_active, allergens, created_at)
    VALUES (TARGET_ID, r.name, r.price, r.is_active, r.allergens, NOW())
    RETURNING extra_id INTO new_id;

    INSERT INTO _extra_map VALUES (r.extra_id, new_id);
  END LOOP;

  RAISE NOTICE '✓ extra (% extras)', (SELECT COUNT(*) FROM _extra_map);

  -- ── 10. menu_item_extra ───────────────────────────────────────────────────
  FOR r IN
    SELECT mie.*
    FROM public.menu_item_extra mie
    JOIN public.menu_item mi ON mi.menu_item_id = mie.menu_item_id
    WHERE mi.restaurante_id = SOURCE_ID
  LOOP
    DECLARE
      new_item_id  BIGINT;
      new_extra_id BIGINT;
    BEGIN
      SELECT new_id INTO new_item_id  FROM _item_map  WHERE old_id = r.menu_item_id;
      SELECT new_id INTO new_extra_id FROM _extra_map WHERE old_id = r.extra_id;

      IF new_item_id IS NOT NULL AND new_extra_id IS NOT NULL THEN
        INSERT INTO public.menu_item_extra (menu_item_id, extra_id)
        VALUES (new_item_id, new_extra_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END;
  END LOOP;

  RAISE NOTICE '✓ menu_item_extra';
  RAISE NOTICE '══════════════════════════════════════════════';
  RAISE NOTICE '✅  Listo: id=% → id=% (%)', SOURCE_ID, TARGET_ID, TARGET_SLUG;
  RAISE NOTICE '══════════════════════════════════════════════';

END $$;
