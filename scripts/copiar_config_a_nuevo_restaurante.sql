-- ============================================================
-- SCRIPT: Copiar menú y configuración de restaurante origen
--         al restaurante destino recién creado en onboarding.
--
-- USO:
--   1. Ajusta v_source_id y v_target_slug (líneas ~20-21)
--   2. Ejecuta completo en Supabase SQL Editor
-- ============================================================

DO $$
DECLARE
  v_source_id   INT  := 1;                  -- ← CAMBIAR si es necesario
  v_target_slug TEXT := 'la-isla-pizzeria'; -- ← CAMBIAR si es necesario

  v_target_id   INT;
  v_new_cat_id  BIGINT;
  v_new_item_id BIGINT;
  v_new_xtra_id BIGINT;
  v_mapped_cat  BIGINT;
  v_mapped_item BIGINT;
  v_mapped_xtra BIGINT;
  r             RECORD;
BEGIN

  -- 0. Resolver target ──────────────────────────────────────────────────────
  SELECT id INTO v_target_id
  FROM public.restaurante WHERE slug = v_target_slug;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró restaurante con slug = %', v_target_slug;
  END IF;

  RAISE NOTICE 'Copiando id=% → id=% (%)', v_source_id, v_target_id, v_target_slug;

  -- Tablas temporales con nombres de columna distintos al de la variable
  CREATE TEMP TABLE IF NOT EXISTS _map_cat   (src BIGINT, dst BIGINT) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _map_item  (src BIGINT, dst BIGINT) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _map_extra (src BIGINT, dst BIGINT) ON COMMIT DROP;
  TRUNCATE _map_cat, _map_item, _map_extra;

  -- 1. restaurante_config ───────────────────────────────────────────────────
  INSERT INTO public.restaurante_config
    (restaurante_id, config_key, config_value, description, updated_at)
  SELECT v_target_id, config_key, config_value, description, NOW()
  FROM public.restaurante_config
  WHERE restaurante_id = v_source_id
    AND config_key NOT IN (
      'bot_activo','whatsapp_number',
      'chatwoot_webhook_prod','chatwoot_webhook_test','chatwoot_inbox_id'
    )
  ON CONFLICT (config_key, restaurante_id)
    DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW();

  RAISE NOTICE '✓ restaurante_config';

  -- 2. config_operativa ─────────────────────────────────────────────────────
  INSERT INTO public.config_operativa
    (restaurante_id, tiempo_espera_minutos, mensaje_tiempo_espera)
  SELECT v_target_id, tiempo_espera_minutos, mensaje_tiempo_espera
  FROM public.config_operativa
  WHERE restaurante_id = v_source_id
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✓ config_operativa';

  -- 3. horarios ─────────────────────────────────────────────────────────────
  INSERT INTO public.horarios
    (restaurante_id, dia, disponible, apertura_1, cierre_1, apertura_2, cierre_2)
  SELECT v_target_id, dia, disponible, apertura_1, cierre_1, apertura_2, cierre_2
  FROM public.horarios
  WHERE restaurante_id = v_source_id
  ON CONFLICT (restaurante_id, dia)
    DO UPDATE SET
      disponible = EXCLUDED.disponible,
      apertura_1 = EXCLUDED.apertura_1,
      cierre_1   = EXCLUDED.cierre_1,
      apertura_2 = EXCLUDED.apertura_2,
      cierre_2   = EXCLUDED.cierre_2;

  RAISE NOTICE '✓ horarios';

  -- 4. delivery_zone ────────────────────────────────────────────────────────
  INSERT INTO public.delivery_zone (
    restaurante_id, postal_code, zone_name, fee, is_active,
    description, min_order_amount, estimated_minutes_min, estimated_minutes_max
  )
  SELECT
    v_target_id, postal_code, zone_name, fee, is_active,
    description, min_order_amount, estimated_minutes_min, estimated_minutes_max
  FROM public.delivery_zone
  WHERE restaurante_id = v_source_id
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✓ delivery_zone';

  -- 5. faqs ─────────────────────────────────────────────────────────────────
  INSERT INTO public.faqs (restaurante_id, pregunta, respuesta, orden)
  SELECT v_target_id, pregunta, respuesta, orden
  FROM public.faqs
  WHERE restaurante_id = v_source_id
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✓ faqs';

  -- 6. menu_category ────────────────────────────────────────────────────────
  FOR r IN
    SELECT * FROM public.menu_category
    WHERE restaurante_id = v_source_id
    ORDER BY sort_order
  LOOP
    INSERT INTO public.menu_category
      (restaurante_id, name, sort_order, is_active, created_at)
    VALUES (v_target_id, r.name, r.sort_order, r.is_active, NOW())
    RETURNING menu_category_id INTO v_new_cat_id;

    INSERT INTO _map_cat (src, dst) VALUES (r.menu_category_id, v_new_cat_id);
  END LOOP;

  RAISE NOTICE '✓ menu_category (% categorías)', (SELECT COUNT(*) FROM _map_cat);

  -- 7. menu_item ────────────────────────────────────────────────────────────
  FOR r IN
    SELECT * FROM public.menu_item
    WHERE restaurante_id = v_source_id
    ORDER BY menu_item_id
  LOOP
    SELECT dst INTO v_mapped_cat FROM _map_cat WHERE src = r.menu_category_id;

    INSERT INTO public.menu_item (
      restaurante_id, menu_category_id, name, description,
      is_active, tags, created_at
    )
    VALUES (
      v_target_id, v_mapped_cat, r.name, r.description,
      r.is_active, r.tags, NOW()
    )
    RETURNING menu_item_id INTO v_new_item_id;

    INSERT INTO _map_item (src, dst) VALUES (r.menu_item_id, v_new_item_id);
  END LOOP;

  RAISE NOTICE '✓ menu_item (% productos)', (SELECT COUNT(*) FROM _map_item);

  -- 8. menu_variant ─────────────────────────────────────────────────────────
  FOR r IN
    SELECT mv.*
    FROM public.menu_variant mv
    JOIN public.menu_item mi ON mi.menu_item_id = mv.menu_item_id
    WHERE mi.restaurante_id = v_source_id
    ORDER BY mv.menu_variant_id
  LOOP
    SELECT dst INTO v_mapped_item FROM _map_item WHERE src = r.menu_item_id;

    IF v_mapped_item IS NOT NULL THEN
      INSERT INTO public.menu_variant (
        menu_item_id, restaurante_id, variant_name, price,
        sku, is_default, is_active, created_at
      )
      VALUES (
        v_mapped_item, v_target_id, r.variant_name, r.price,
        r.sku, r.is_default, r.is_active, NOW()
      );
    END IF;
  END LOOP;

  RAISE NOTICE '✓ menu_variant';

  -- 9. extra ────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT * FROM public.extra
    WHERE restaurante_id = v_source_id
    ORDER BY extra_id
  LOOP
    INSERT INTO public.extra
      (restaurante_id, name, price, is_active, allergens, created_at)
    VALUES (v_target_id, r.name, r.price, r.is_active, r.allergens, NOW())
    RETURNING extra_id INTO v_new_xtra_id;

    INSERT INTO _map_extra (src, dst) VALUES (r.extra_id, v_new_xtra_id);
  END LOOP;

  RAISE NOTICE '✓ extra (% extras)', (SELECT COUNT(*) FROM _map_extra);

  -- 10. menu_item_extra ─────────────────────────────────────────────────────
  FOR r IN
    SELECT mie.*
    FROM public.menu_item_extra mie
    JOIN public.menu_item mi ON mi.menu_item_id = mie.menu_item_id
    WHERE mi.restaurante_id = v_source_id
  LOOP
    SELECT dst INTO v_mapped_item FROM _map_item  WHERE src = r.menu_item_id;
    SELECT dst INTO v_mapped_xtra FROM _map_extra WHERE src = r.extra_id;

    IF v_mapped_item IS NOT NULL AND v_mapped_xtra IS NOT NULL THEN
      INSERT INTO public.menu_item_extra (menu_item_id, extra_id)
      VALUES (v_mapped_item, v_mapped_xtra)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RAISE NOTICE '✓ menu_item_extra';
  RAISE NOTICE '══════════════════════════════════════════════════';
  RAISE NOTICE '✅  Listo: id=% → id=% (%)', v_source_id, v_target_id, v_target_slug;
  RAISE NOTICE '══════════════════════════════════════════════════';

END $$;
