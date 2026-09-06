-- Hallazgo 3: Eliminar duplicados en public.faqs
-- Mantiene el registro con el id más bajo por cada combinación (restaurante_id, pregunta)
-- Seguro de ejecutar: usa CTE + DELETE con subquery

-- Paso 1 (opcional): ver cuántos duplicados hay antes de borrar
SELECT restaurante_id, pregunta, COUNT(*) AS total
FROM public.faqs
GROUP BY restaurante_id, pregunta
HAVING COUNT(*) > 1
ORDER BY total DESC;

-- Paso 2: eliminar duplicados, conservando el id más bajo
DELETE FROM public.faqs
WHERE id NOT IN (
  SELECT MIN(id)
  FROM public.faqs
  GROUP BY restaurante_id, pregunta
);

-- Paso 3 (opcional): agregar restricción UNIQUE para evitar futuros duplicados
-- ALTER TABLE public.faqs
--   ADD CONSTRAINT uq_faqs_restaurante_pregunta UNIQUE (restaurante_id, pregunta);
