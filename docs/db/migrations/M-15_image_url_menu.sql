-- M-15: Add image_url to menu_item
-- Safe: nullable column, no default required, retrocompatible.
-- Run once on production after deploying API + frontend that handles null gracefully.

ALTER TABLE public.menu_item
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) NULL;

-- Index not needed: image_url is never filtered, only SELECTed.

COMMENT ON COLUMN public.menu_item.image_url IS
  'Optional URL pointing to the product image. Stored as-is; no CDN transformation applied at DB level.';
