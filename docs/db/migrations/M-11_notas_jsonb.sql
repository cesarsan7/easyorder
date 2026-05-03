-- M-11: Convertir pedidos.notas de TEXT a JSONB
-- Cada item puede tener su propia nota.
-- Formato: [{"item": "Pollo Crispy - Estándar", "nota": "término medio"}]
-- Los registros legacy con notas TEXT se migran a [{item: "general", nota: <texto>}]

ALTER TABLE pedidos
  ALTER COLUMN notas TYPE JSONB
  USING CASE
    WHEN notas IS NULL OR TRIM(notas) = '' THEN NULL
    ELSE jsonb_build_array(
      jsonb_build_object('item', 'general', 'nota', TRIM(notas))
    )
  END;

COMMENT ON COLUMN pedidos.notas IS
  'Notas del pedido por ítem. Formato: [{"item": "nombre_item", "nota": "texto"}]. Generado por el agente WhatsApp o por el cliente en el checkout web.';
