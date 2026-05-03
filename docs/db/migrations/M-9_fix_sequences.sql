-- =============================================================================
-- Migration M-9: Reset desync'd sequences
-- Problem:  DML inserts used explicit IDs (via OVERRIDING SYSTEM VALUE or
--           direct inserts on bigserial columns), leaving sequences behind
--           the actual max ID. Any INSERT now fails with:
--           "duplicate key value violates unique constraint <table>_pkey"
-- Fix:      setval() each affected sequence to MAX(id) so the next
--           generated value is max + 1.
-- Safe:     setval with is_called=true means next INSERT uses max+1.
-- =============================================================================

-- menu_category: seq at 5, max id = 12
SELECT setval(
  'public.menu_category_menu_category_id_seq',
  (SELECT MAX(menu_category_id) FROM public.menu_category)
);

-- menu_item: seq stalled, max id = 105
SELECT setval(
  'public.menu_item_menu_item_id_seq',
  (SELECT MAX(menu_item_id) FROM public.menu_item)
);

-- menu_variant: seq at 1, max id = 120
SELECT setval(
  'public.menu_variant_menu_variant_id_seq',
  (SELECT MAX(menu_variant_id) FROM public.menu_variant)
);

-- extra: seq at 2, max id = 12
SELECT setval(
  'public.extra_extra_id_seq',
  (SELECT MAX(extra_id) FROM public.extra)
);

-- delivery_zone: seq at 5, max id = 5 (borderline — fix anyway)
SELECT setval(
  'public.delivery_zone_delivery_zone_id_seq',
  (SELECT MAX(delivery_zone_id) FROM public.delivery_zone)
);

-- =============================================================================
-- VERIFY (run after applying):
-- =============================================================================
-- SELECT
--   schemaname,
--   sequencename,
--   last_value
-- FROM pg_sequences
-- WHERE schemaname = 'public'
--   AND sequencename IN (
--     'menu_category_menu_category_id_seq',
--     'menu_item_menu_item_id_seq',
--     'menu_variant_menu_variant_id_seq',
--     'extra_extra_id_seq',
--     'delivery_zone_delivery_zone_id_seq'
--   );
