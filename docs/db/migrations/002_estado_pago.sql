-- Migración 002 (cuando se decida implementar)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS estado_pago text 
    DEFAULT 'no_aplica' NOT NULL;
-- Valores: no_aplica | pendiente | pagado | rechazado

-- Migrar registros existentes
UPDATE public.pedidos
SET estado_pago = CASE
  WHEN estado = 'pendiente_pago'                                   THEN 'pendiente'
  WHEN estado IN ('confirmado','recibido','en_preparacion','listo',
                  'en_camino','entregado','pagado')
   AND metodo_pago IN ('transferencia','online','bizum')           THEN 'pagado'
  ELSE 'no_aplica'  -- efectivo: se cobra en mano, no necesita tracking digital
END;