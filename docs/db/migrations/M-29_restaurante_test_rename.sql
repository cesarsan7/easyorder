-- M-29: Renombrar restaurante id=1 → "Restaurante Test"
-- El restaurante id=1 pasa a ser el entorno de pruebas/demos.
-- El restaurante productivo de La Isla se creará mediante el onboarding.

UPDATE public.restaurante
SET
  nombre = 'Restaurante Test',
  slug   = 'restaurante-test'
WHERE id = 1;
