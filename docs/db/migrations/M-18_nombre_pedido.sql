-- M-18: nombre_pedido
-- Agrega columna opcional `nombre_pedido` a la tabla pedidos.
-- Representa el nombre de la persona PARA QUIEN se hace el pedido,
-- que puede ser distinta del titular de la cuenta (nombre_cliente).
-- Cuando es NULL se usa nombre_cliente en la UI.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS nombre_pedido VARCHAR(120) DEFAULT NULL;

COMMENT ON COLUMN public.pedidos.nombre_pedido IS
  'Nombre para el pedido (puede diferir del titular de la cuenta). NULL = usar nombre_cliente.';
