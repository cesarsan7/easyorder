-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION pg_database_owner;

COMMENT ON SCHEMA public IS 'standard public schema';

-- DROP SEQUENCE public.config_operativa_id_seq;

CREATE SEQUENCE public.config_operativa_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.delivery_zone_delivery_zone_id_seq;

CREATE SEQUENCE public.delivery_zone_delivery_zone_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.extra_extra_id_seq;

CREATE SEQUENCE public.extra_extra_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.faqs_id_seq;

CREATE SEQUENCE public.faqs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.horarios_id_seq;

CREATE SEQUENCE public.horarios_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.menu_category_menu_category_id_seq;

CREATE SEQUENCE public.menu_category_menu_category_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.menu_id_seq;

CREATE SEQUENCE public.menu_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.menu_item_menu_item_id_seq;

CREATE SEQUENCE public.menu_item_menu_item_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.menu_variant_menu_variant_id_seq;

CREATE SEQUENCE public.menu_variant_menu_variant_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.n8n_chat_histories_id_seq;

CREATE SEQUENCE public.n8n_chat_histories_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.pedidos_id_seq;

CREATE SEQUENCE public.pedidos_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.restaurante_id_seq;

CREATE SEQUENCE public.restaurante_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.usuarios_id_seq;

CREATE SEQUENCE public.usuarios_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;-- public.delivery_zone definition

-- Drop table

-- DROP TABLE public.delivery_zone;

CREATE TABLE public.delivery_zone (
	delivery_zone_id bigserial NOT NULL,
	postal_code varchar(10) NOT NULL,
	zone_name varchar(100) NOT NULL,
	fee numeric(10, 2) NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	description text NULL,
	min_order_amount numeric(10, 2) NULL,
	estimated_minutes_min int4 NULL,
	estimated_minutes_max int4 NULL,
	restaurante_id int4 NULL,
	CONSTRAINT delivery_zone_pkey PRIMARY KEY (delivery_zone_id),
	CONSTRAINT delivery_zone_postal_code_key UNIQUE (postal_code)
);


-- public.extra definition

-- Drop table

-- DROP TABLE public.extra;

CREATE TABLE public.extra (
	extra_id bigserial NOT NULL,
	"name" varchar(120) NOT NULL,
	price numeric(10, 2) DEFAULT 0 NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	allergens varchar(200) NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz NULL,
	restaurante_id int4 NULL,
	CONSTRAINT extra_pkey PRIMARY KEY (extra_id)
);


-- public.menu_category definition

-- Drop table

-- DROP TABLE public.menu_category;

CREATE TABLE public.menu_category (
	menu_category_id bigserial NOT NULL,
	"name" varchar(100) NOT NULL,
	sort_order int4 DEFAULT 0 NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz NULL,
	restaurante_id int4 NULL,
	CONSTRAINT menu_category_pkey PRIMARY KEY (menu_category_id)
);


-- public.menu_variant definition

-- Drop table

-- DROP TABLE public.menu_variant;

CREATE TABLE public.menu_variant (
	menu_variant_id bigserial NOT NULL,
	menu_item_id int8 NOT NULL,
	variant_name varchar(80) NOT NULL,
	price numeric(10, 2) NOT NULL,
	sku varchar(50) NULL,
	is_default bool DEFAULT false NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz NULL,
	restaurante_id int4 NULL,
	CONSTRAINT menu_variant_pkey PRIMARY KEY (menu_variant_id)
);
CREATE INDEX ix_menu_variant_item_active ON public.menu_variant USING btree (menu_item_id, is_active);


-- public.n8n_chat_histories definition

-- Drop table

-- DROP TABLE public.n8n_chat_histories;

CREATE TABLE public.n8n_chat_histories (
	id serial4 NOT NULL,
	session_id varchar(255) NOT NULL,
	message jsonb NOT NULL,
	"timestamp" timestamp NULL,
	CONSTRAINT n8n_chat_histories_pkey PRIMARY KEY (id)
);


-- public.restaurante definition

-- Drop table

-- DROP TABLE public.restaurante;

CREATE TABLE public.restaurante (
	id serial4 NOT NULL,
	nombre text NOT NULL,
	direccion text NULL,
	lat numeric(10, 8) NULL,
	long numeric(11, 8) NULL,
	telefono text NULL,
	zona_horaria text DEFAULT 'Atlantic/Canary'::text NULL,
	radio_cobertura_km numeric(5, 2) DEFAULT 5.0 NULL,
	tarifa_envio_tipo text DEFAULT 'fija'::text NULL,
	tarifa_envio_valor numeric(10, 2) DEFAULT '0'::numeric NULL,
	mensaje_bienvenida text NULL,
	mensaje_cerrado text NULL,
	created_at timestamp DEFAULT now() NULL,
	datos_bancarios jsonb NULL,
	moneda varchar(5) DEFAULT '€'::character varying NULL,
	CONSTRAINT restaurante_pkey PRIMARY KEY (id)
);


-- public.restaurante_config definition

-- Drop table

-- DROP TABLE public.restaurante_config;

CREATE TABLE public.restaurante_config (
	config_key varchar(100) NOT NULL,
	config_value varchar(500) NOT NULL,
	description text NULL,
	updated_at timestamptz DEFAULT now() NULL,
	restaurante_id int4 NULL,
	CONSTRAINT restaurante_config_pkey PRIMARY KEY (config_key)
);


-- public.config_operativa definition

-- Drop table

-- DROP TABLE public.config_operativa;

CREATE TABLE public.config_operativa (
	id serial4 NOT NULL,
	restaurante_id int4 NULL,
	tiempo_espera_minutos int4 DEFAULT 30 NULL,
	mensaje_tiempo_espera text DEFAULT 'Tu pedido estará listo en aproximadamente {minutos} minutos.'::text NULL,
	CONSTRAINT config_operativa_pkey PRIMARY KEY (id),
	CONSTRAINT config_operativa_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE
);


-- public.contexto definition

-- Drop table

-- DROP TABLE public.contexto;

CREATE TABLE public.contexto (
	telefono text NOT NULL,
	contexto text NULL,
	"timestamp" timestamp NOT NULL,
	session_id text NULL,
	session_started_at timestamp NULL,
	restaurante_id int4 NULL,
	CONSTRAINT contexto_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE
);
CREATE INDEX idx_contexto_restaurante ON public.contexto USING btree (restaurante_id);
CREATE INDEX idx_contexto_session ON public.contexto USING btree (session_id);
CREATE INDEX idx_contexto_telefono ON public.contexto USING btree (telefono);


-- public.faqs definition

-- Drop table

-- DROP TABLE public.faqs;

CREATE TABLE public.faqs (
	id serial4 NOT NULL,
	restaurante_id int4 NULL,
	pregunta text NOT NULL,
	respuesta text NOT NULL,
	orden int4 DEFAULT 0 NULL,
	CONSTRAINT faqs_pkey PRIMARY KEY (id),
	CONSTRAINT faqs_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE
);


-- public.horarios definition

-- Drop table

-- DROP TABLE public.horarios;

CREATE TABLE public.horarios (
	id serial4 NOT NULL,
	restaurante_id int4 NULL,
	dia text NOT NULL,
	disponible bool DEFAULT true NULL,
	apertura_1 time NULL,
	cierre_1 time NULL,
	apertura_2 time NULL,
	cierre_2 time NULL,
	CONSTRAINT horarios_pkey PRIMARY KEY (id),
	CONSTRAINT horarios_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE
);


-- public.menu_item definition

-- Drop table

-- DROP TABLE public.menu_item;

CREATE TABLE public.menu_item (
	menu_item_id bigserial NOT NULL,
	menu_category_id int8 NOT NULL,
	"name" varchar(150) NOT NULL,
	description varchar(500) NULL,
	is_pizza bool DEFAULT false NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	tags varchar(300) NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz NULL,
	restaurante_id int4 NULL,
	CONSTRAINT menu_item_pkey PRIMARY KEY (menu_item_id),
	CONSTRAINT menu_item_menu_category_id_fkey FOREIGN KEY (menu_category_id) REFERENCES public.menu_category(menu_category_id)
);
CREATE INDEX ix_menu_item_category_active ON public.menu_item USING btree (menu_category_id, is_active);


-- public.menu_item_extra definition

-- Drop table

-- DROP TABLE public.menu_item_extra;

CREATE TABLE public.menu_item_extra (
	menu_item_id int8 NOT NULL,
	extra_id int8 NOT NULL,
	is_default bool DEFAULT false NOT NULL,
	CONSTRAINT menu_item_extra_pkey PRIMARY KEY (menu_item_id, extra_id),
	CONSTRAINT menu_item_extra_extra_id_fkey FOREIGN KEY (extra_id) REFERENCES public.extra(extra_id),
	CONSTRAINT menu_item_extra_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_item(menu_item_id)
);


-- public.usuarios definition

-- Drop table

-- DROP TABLE public.usuarios;

CREATE TABLE public.usuarios (
	id serial4 NOT NULL,
	restaurante_id int4 NULL,
	telefono text NOT NULL,
	nombre text NULL,
	direccion_frecuente text NULL,
	lat_frecuente numeric(10, 8) NULL,
	long_frecuente numeric(11, 8) NULL,
	contexto text NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT usuarios_pkey PRIMARY KEY (id),
	CONSTRAINT usuarios_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE
);
CREATE INDEX idx_usuarios_restaurante ON public.usuarios USING btree (restaurante_id);
CREATE INDEX idx_usuarios_telefono ON public.usuarios USING btree (telefono);
CREATE UNIQUE INDEX usuarios_telefono_key ON public.usuarios USING btree (telefono);


-- public.pedidos definition

-- Drop table

-- DROP TABLE public.pedidos;

CREATE TABLE public.pedidos (
	id serial4 NOT NULL,
	restaurante_id int4 NULL,
	usuario_id int4 NULL,
	telefono text NOT NULL,
	items jsonb DEFAULT '[]'::jsonb NULL,
	subtotal numeric(10, 2) DEFAULT '0'::numeric NULL,
	tipo_despacho text NULL,
	direccion text NULL,
	lat numeric(10, 8) NULL,
	lng numeric(11, 8) NULL,
	distancia_km numeric(5, 2) NULL,
	tiempo_estimado text NULL,
	costo_envio numeric(10, 2) DEFAULT '0'::numeric NULL,
	total numeric(10, 2) DEFAULT '0'::numeric NULL,
	metodo_pago text NULL,
	estado text DEFAULT 'en_curso'::text NULL,
	notas text NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	session_id text NULL,
	session_started_at timestamp NULL,
	pedido_numero int4 DEFAULT 1 NULL,
	pedido_codigo varchar(20) NULL,
	CONSTRAINT pedidos_pkey PRIMARY KEY (id),
	CONSTRAINT pedidos_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE,
	CONSTRAINT pedidos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_pedidos_estado ON public.pedidos USING btree (estado);
CREATE INDEX idx_pedidos_pedido_codigo ON public.pedidos USING btree (pedido_codigo);
CREATE INDEX idx_pedidos_restaurante ON public.pedidos USING btree (restaurante_id);
CREATE INDEX idx_pedidos_session_id ON public.pedidos USING btree (session_id);
CREATE INDEX idx_pedidos_telefono ON public.pedidos USING btree (telefono);
CREATE INDEX idx_pedidos_telefono_updated_at ON public.pedidos USING btree (telefono, updated_at DESC);
CREATE UNIQUE INDEX pedidos_session_pedido_unique ON public.pedidos USING btree (session_id, pedido_numero);
CREATE UNIQUE INDEX ux_pedidos_pedido_codigo ON public.pedidos USING btree (pedido_codigo) WHERE (pedido_codigo IS NOT NULL);

-- Table Triggers

create trigger trg_set_pedido_codigo before
insert
    on
    public.pedidos for each row execute function fn_set_pedido_codigo();
create trigger tg_set_pedido_codigo before
insert
    on
    public.pedidos for each row execute function trg_set_pedido_codigo();



-- DROP FUNCTION public.fn_get_rest_config_int(text, int4);

CREATE OR REPLACE FUNCTION public.fn_get_rest_config_int(p_key text, p_default integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE((SELECT NULLIF(trim(config_value),'')::int FROM public.restaurante_config WHERE config_key = p_key), p_default)
$function$
;

-- DROP FUNCTION public.fn_listar_pedidos_modificables(text);

CREATE OR REPLACE FUNCTION public.fn_listar_pedidos_modificables(p_telefono text)
 RETURNS TABLE(pedido_id text, pedido_codigo text, estado text, tipo_despacho text, total numeric, updated_at timestamp without time zone, es_modificable boolean)
 LANGUAGE sql
 STABLE
AS $function$
  WITH cfg AS (
    SELECT public.fn_get_rest_config_int('cart_expiry_minutes',60) cart_expiry_minutes,
           public.fn_get_rest_config_int('modify_window_minutes',30) modify_window_minutes
  )
  SELECT
    p.id::text AS pedido_id,
    p.pedido_codigo,
    p.estado,
    p.tipo_despacho,
    p.total,
    p.updated_at,
    CASE
      WHEN lower(COALESCE(p.estado,'en_curso')) IN ('en_curso','draft') THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes FROM cfg))
      WHEN lower(COALESCE(p.estado,'en_curso')) IN ('pendiente_pago','confirmado','pagado','paid') THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
      ELSE false
    END AS es_modificable
  FROM public.pedidos p
  WHERE p.telefono = p_telefono
  ORDER BY COALESCE(p.updated_at,p.created_at) DESC, p.id DESC;
$function$
;

-- DROP FUNCTION public.fn_menu_catalog();

CREATE OR REPLACE FUNCTION public.fn_menu_catalog()
 RETURNS TABLE(categoria text, producto text, descripcion text, variante text, precio numeric, extras_disponibles text, disponible boolean, tags text, is_pizza boolean, producto_display text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH extras AS (
    SELECT
      mie.menu_item_id,
      string_agg(
        e.name ||
        CASE
          WHEN COALESCE(e.price, 0) > 0
            THEN ' (' || replace(to_char(e.price, 'FM999999990.00'), '.', ',') || '€)'
          ELSE ''
        END,
        ', ' ORDER BY e.name
      ) AS extras_disponibles
    FROM public.menu_item_extra mie
    JOIN public.extra e
      ON e.extra_id = mie.extra_id
    WHERE COALESCE(e.is_active, true)
    GROUP BY mie.menu_item_id
  )
  SELECT
    mc.name::text AS categoria,
    mi.name::text AS producto,
    mi.description::text AS descripcion,
    mv.variant_name::text AS variante,
    mv.price::numeric AS precio,
    ex.extras_disponibles::text,
    (
      COALESCE(mc.is_active, true)
      AND COALESCE(mi.is_active, true)
      AND COALESCE(mv.is_active, true)
    ) AS disponible,
    mi.tags::text AS tags,
    COALESCE(mi.is_pizza, false) AS is_pizza,
    CASE
      WHEN mv.variant_name IS NULL OR btrim(mv.variant_name) = ''
        THEN mi.name::text
      ELSE mi.name::text || ' - ' || mv.variant_name::text
    END AS producto_display
  FROM public.menu_item mi
  JOIN public.menu_category mc
    ON mc.menu_category_id = mi.menu_category_id
  LEFT JOIN public.menu_variant mv
    ON mv.menu_item_id = mi.menu_item_id
  LEFT JOIN extras ex
    ON ex.menu_item_id = mi.menu_item_id
  WHERE
    COALESCE(mc.is_active, true)
    AND COALESCE(mi.is_active, true)
    AND (
      mv.menu_variant_id IS NULL
      OR COALESCE(mv.is_active, true)
    );
$function$
;

-- DROP FUNCTION public.fn_menu_lookup(text);

CREATE OR REPLACE FUNCTION public.fn_menu_lookup(p_search text DEFAULT NULL::text)
 RETURNS TABLE(categoria text, producto text, descripcion text, variante text, precio numeric, extras_disponibles text, disponible boolean, tags text, is_pizza boolean, producto_display text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT *
  FROM public.fn_menu_catalog() c
  WHERE p_search IS NULL
     OR p_search = ''
     OR lower(unaccent(COALESCE(c.categoria,''))) LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.producto,''))) LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.variante,''))) LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.producto_display,''))) LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.extras_disponibles,''))) LIKE '%' || lower(unaccent(p_search)) || '%'
  ORDER BY c.categoria, c.producto, c.precio;
$function$
;

-- DROP FUNCTION public.fn_next_pedido_codigo(date);

CREATE OR REPLACE FUNCTION public.fn_next_pedido_codigo(p_fecha date DEFAULT CURRENT_DATE)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  prefijo text := to_char(p_fecha, 'YYMMDD');
  siguiente int;
BEGIN
  SELECT COALESCE(MAX(RIGHT(pedido_codigo,4)::int), 1000) + 1
    INTO siguiente
  FROM public.pedidos
  WHERE pedido_codigo ~ ('^' || prefijo || '-[0-9]{4}$');

  RETURN prefijo || '-' || LPAD(siguiente::text, 4, '0');
END;
$function$
;

-- DROP FUNCTION public.fn_next_pedido_numero();

CREATE OR REPLACE FUNCTION public.fn_next_pedido_numero()
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(MAX(pedido_numero),0) + 1 FROM public.pedidos
$function$
;

-- DROP FUNCTION public.fn_resolver_pedido_modificable(text, text);

CREATE OR REPLACE FUNCTION public.fn_resolver_pedido_modificable(p_telefono text, p_referencia text)
 RETURNS TABLE(pedido_id text, pedido_codigo text, estado text, tipo_despacho text, total numeric, updated_at timestamp without time zone, es_modificable boolean)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    r.pedido_id,
    r.pedido_codigo,
    r.estado,
    r.tipo_despacho,
    r.total,
    r.updated_at,
    r.es_modificable
  FROM public.fn_resolver_pedido_referencia(p_telefono, p_referencia) r
  WHERE r.es_modificable
  LIMIT 1;
$function$
;

-- DROP FUNCTION public.fn_resolver_pedido_referencia(text, text);

CREATE OR REPLACE FUNCTION public.fn_resolver_pedido_referencia(p_telefono text, p_referencia text)
 RETURNS TABLE(pedido_id text, pedido_codigo text, estado text, tipo_despacho text, subtotal numeric, total numeric, updated_at timestamp without time zone, items jsonb, direccion text, tiempo_estimado text, metodo_pago text, es_modificable boolean)
 LANGUAGE sql
 STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes', 60)  AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
  ),
  ref AS (
    SELECT
      trim(COALESCE(p_referencia, '')) AS r,
      regexp_replace(COALESCE(p_referencia, ''), '[^0-9]', '', 'g') AS digits
  ),
  base AS (
    SELECT
      p.id::text AS pedido_id,
      p.pedido_codigo,
      p.estado,
      p.tipo_despacho,
      p.subtotal,
      p.total,
      p.updated_at,
      p.items,
      p.direccion,
      p.tiempo_estimado,
      p.metodo_pago,
      CASE
        WHEN lower(COALESCE(p.estado, 'en_curso')) IN ('en_curso', 'draft')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes FROM cfg))
        WHEN lower(COALESCE(p.estado, 'en_curso')) IN ('pendiente_pago', 'confirmado', 'pagado', 'paid')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_modificable
    FROM public.pedidos p
    WHERE p.telefono = p_telefono
  )
  SELECT
    b.pedido_id,
    b.pedido_codigo,
    b.estado,
    b.tipo_despacho,
    b.subtotal,
    b.total,
    b.updated_at,
    b.items,
    b.direccion,
    b.tiempo_estimado,
    b.metodo_pago,
    b.es_modificable
  FROM base b
  CROSS JOIN ref
  WHERE
    lower(COALESCE(b.pedido_codigo, '')) = lower(ref.r)
    OR lower(COALESCE(b.pedido_codigo, '')) LIKE lower(ref.r) || '%'
    OR b.pedido_id = ref.r
    OR (length(ref.digits) >= 3 AND right(COALESCE(b.pedido_codigo, ''), length(ref.digits)) = ref.digits)
  ORDER BY
    CASE WHEN lower(COALESCE(b.pedido_codigo, '')) = lower(ref.r) THEN 0 ELSE 1 END,
    CASE WHEN b.pedido_id = ref.r THEN 0 ELSE 1 END,
    CASE WHEN length(ref.digits) >= 3 AND right(COALESCE(b.pedido_codigo, ''), length(ref.digits)) = ref.digits THEN 0 ELSE 1 END,
    COALESCE(b.updated_at, NOW()) DESC,
    b.pedido_id DESC
  LIMIT 1;
$function$
;

-- DROP FUNCTION public.fn_select_pedido_reutilizable(text, text, int8);

CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(p_telefono text, p_session_id text DEFAULT NULL::text, p_pedido_id bigint DEFAULT NULL::bigint)
 RETURNS SETOF pedidos
 LANGUAGE sql
 STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes', 60)  AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
  ),
  cand AS (
    SELECT
      p.id,
      p.restaurante_id,
      p.usuario_id,
      p.telefono,
      p.items,
      p.subtotal,
      p.tipo_despacho,
      p.direccion,
      p.lat,
      p.lng,
      p.distancia_km,
      p.tiempo_estimado,
      p.costo_envio,
      p.total,
      p.metodo_pago,
      p.estado,
      p.notas,
      p.created_at,
      p.updated_at,
      p.session_id,
      p.session_started_at,
      p.pedido_numero,
      p.pedido_codigo,
      COALESCE(p.updated_at, p.created_at, NOW()) AS ref_ts,
      CASE WHEN jsonb_typeof(COALESCE(p.items, '[]'::jsonb)) = 'array' AND jsonb_array_length(COALESCE(p.items, '[]'::jsonb)) > 0 THEN true ELSE false END AS has_items,
      CASE
        WHEN lower(COALESCE(p.estado, 'en_curso')) IN ('en_curso', 'draft')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes FROM cfg))
        WHEN lower(COALESCE(p.estado, 'en_curso')) IN ('pendiente_pago', 'confirmado', 'pagado', 'paid')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_reutilizable
    FROM public.pedidos p
    WHERE p.telefono = p_telefono
  )
  SELECT
    c.id,
    c.restaurante_id,
    c.usuario_id,
    c.telefono,
    c.items,
    c.subtotal,
    c.tipo_despacho,
    c.direccion,
    c.lat,
    c.lng,
    c.distancia_km,
    c.tiempo_estimado,
    c.costo_envio,
    c.total,
    c.metodo_pago,
    c.estado,
    c.notas,
    c.created_at,
    c.updated_at,
    c.session_id,
    c.session_started_at,
    c.pedido_numero,
    c.pedido_codigo
  FROM cand c
  WHERE c.es_reutilizable
  ORDER BY
    CASE WHEN p_pedido_id IS NOT NULL AND c.id = p_pedido_id THEN 0 ELSE 1 END,
    CASE WHEN p_session_id IS NOT NULL AND COALESCE(c.session_id, '') = p_session_id THEN 0 ELSE 1 END,
    CASE WHEN c.has_items THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado, 'en_curso')) = 'en_curso' THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.id DESC
  LIMIT 1;
$function$
;

-- DROP FUNCTION public.fn_select_pedido_reutilizable(text, text, text, bool);

CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(p_telefono text, p_session_id text DEFAULT NULL::text, p_pedido_id text DEFAULT NULL::text, p_forzar_pedido_nuevo boolean DEFAULT false)
 RETURNS TABLE(id character varying, restaurante_id integer, usuario_id integer, telefono text, items jsonb, subtotal numeric, tipo_despacho text, direccion text, lat numeric, lng numeric, distancia_km numeric, tiempo_estimado text, costo_envio numeric, total numeric, metodo_pago text, estado text, notas text, created_at timestamp without time zone, updated_at timestamp without time zone, session_id text, session_started_at timestamp without time zone, pedido_numero integer, pedido_codigo text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes', 60)  AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
  ),
  ref AS (
    SELECT
      trim(COALESCE(p_pedido_id, '')) AS pedido_ref,
      regexp_replace(COALESCE(p_pedido_id, ''), '[^0-9]', '', 'g') AS pedido_digits
  ),
  cand AS (
    SELECT
      p.id,
      p.restaurante_id,
      p.usuario_id,
      p.telefono,
      p.items,
      p.subtotal,
      p.tipo_despacho,
      p.direccion,
      p.lat,
      p.lng,
      p.distancia_km,
      p.tiempo_estimado,
      p.costo_envio,
      p.total,
      p.metodo_pago,
      p.estado,
      p.notas,
      p.created_at,
      p.updated_at,
      p.session_id,
      p.session_started_at,
      p.pedido_numero,
      p.pedido_codigo,
      COALESCE(p.updated_at, p.created_at, NOW()) AS ref_ts,
      CASE WHEN jsonb_typeof(COALESCE(p.items, '[]'::jsonb)) = 'array' AND jsonb_array_length(COALESCE(p.items, '[]'::jsonb)) > 0 THEN true ELSE false END AS has_items,
      CASE
        WHEN p_forzar_pedido_nuevo THEN false
        WHEN lower(COALESCE(p.estado, 'en_curso')) IN ('en_curso', 'draft')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes FROM cfg))
        WHEN lower(COALESCE(p.estado, 'en_curso')) IN ('pendiente_pago', 'confirmado', 'pagado', 'paid')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_reutilizable
    FROM public.pedidos p
    WHERE p.telefono = p_telefono
  )
  SELECT
    c.id::varchar,
    c.restaurante_id,
    c.usuario_id,
    c.telefono,
    c.items,
    c.subtotal,
    c.tipo_despacho,
    c.direccion,
    c.lat,
    c.lng,
    c.distancia_km,
    c.tiempo_estimado,
    c.costo_envio,
    c.total,
    c.metodo_pago,
    c.estado,
    c.notas,
    c.created_at,
    c.updated_at,
    c.session_id,
    c.session_started_at,
    c.pedido_numero,
    c.pedido_codigo
  FROM cand c
  CROSS JOIN ref
  WHERE c.es_reutilizable
  ORDER BY
    CASE
      WHEN ref.pedido_ref <> '' AND (
        c.id::text = ref.pedido_ref
        OR lower(COALESCE(c.pedido_codigo, '')) = lower(ref.pedido_ref)
        OR lower(COALESCE(c.pedido_codigo, '')) LIKE lower(ref.pedido_ref) || '%'
        OR (length(ref.pedido_digits) >= 3 AND right(COALESCE(c.pedido_codigo, ''), length(ref.pedido_digits)) = ref.pedido_digits)
      ) THEN 0
      ELSE 1
    END,
    CASE WHEN p_session_id IS NOT NULL AND COALESCE(c.session_id, '') = p_session_id THEN 0 ELSE 1 END,
    CASE WHEN c.has_items THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado, 'en_curso')) = 'en_curso' THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.id DESC
  LIMIT 1;
$function$
;

-- DROP FUNCTION public.fn_set_pedido_codigo();

CREATE OR REPLACE FUNCTION public.fn_set_pedido_codigo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_prefix text;
  v_next integer;
BEGIN
  IF NEW.pedido_codigo IS NOT NULL AND btrim(NEW.pedido_codigo) <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.created_at IS NULL THEN
    NEW.created_at := NOW();
  END IF;

  v_prefix := to_char((COALESCE(NEW.created_at, NOW()) AT TIME ZONE 'Atlantic/Canary')::date, 'YYMMDD');

  PERFORM pg_advisory_xact_lock(hashtextextended('pedido_codigo_' || v_prefix, 0));

  SELECT COALESCE(MAX(split_part(pedido_codigo, '-', 2)::integer), 1000) + 1
    INTO v_next
  FROM public.pedidos
  WHERE pedido_codigo ~ ('^' || v_prefix || '-[0-9]{4}$');

  NEW.pedido_codigo := v_prefix || '-' || lpad(v_next::text, 4, '0');
  RETURN NEW;
END;
$function$
;

-- DROP FUNCTION public.fn_upsert_usuario_perfil(text, text, text, text);

CREATE OR REPLACE FUNCTION public.fn_upsert_usuario_perfil(p_telefono text, p_nombre text DEFAULT NULL::text, p_direccion text DEFAULT NULL::text, p_tipo_despacho text DEFAULT NULL::text)
 RETURNS TABLE(id integer, telefono text, nombre text, direccion_frecuente text, updated_name boolean, updated_address boolean)
 LANGUAGE sql
AS $function$
WITH prev AS (
  SELECT
    u.id,
    u.telefono,
    u.nombre,
    u.direccion_frecuente
  FROM public.usuarios u
  WHERE u.telefono = p_telefono
  LIMIT 1
),
upserted AS (
  INSERT INTO public.usuarios (
    restaurante_id,
    telefono,
    nombre,
    direccion_frecuente,
    created_at,
    updated_at
  )
  VALUES (
    1,
    p_telefono,
    NULLIF(btrim(p_nombre), ''),
    CASE
      WHEN lower(COALESCE(p_tipo_despacho, '')) IN ('delivery', 'domicilio')
       AND NULLIF(btrim(p_direccion), '') IS NOT NULL
      THEN NULLIF(btrim(p_direccion), '')
      ELSE NULL
    END,
    NOW(),
    NOW()
  )
  ON CONFLICT (telefono)
  DO UPDATE
    SET
      updated_at = NOW(),
      nombre = CASE
        WHEN NULLIF(btrim(p_nombre), '') IS NOT NULL
        THEN NULLIF(btrim(p_nombre), '')
        ELSE public.usuarios.nombre
      END,
      direccion_frecuente = CASE
        WHEN lower(COALESCE(p_tipo_despacho, '')) IN ('delivery', 'domicilio')
         AND NULLIF(btrim(p_direccion), '') IS NOT NULL
        THEN NULLIF(btrim(p_direccion), '')
        ELSE public.usuarios.direccion_frecuente
      END
  RETURNING
    public.usuarios.id,
    public.usuarios.telefono,
    public.usuarios.nombre,
    public.usuarios.direccion_frecuente
)
SELECT
  u.id::int,
  u.telefono::text,
  u.nombre::text,
  u.direccion_frecuente::text,
  (
    NULLIF(btrim(p_nombre), '') IS NOT NULL
    AND (
      (SELECT p.nombre FROM prev p LIMIT 1) IS DISTINCT FROM u.nombre
    )
  ) AS updated_name,
  (
    lower(COALESCE(p_tipo_despacho, '')) IN ('delivery', 'domicilio')
    AND NULLIF(btrim(p_direccion), '') IS NOT NULL
    AND (
      (SELECT p.direccion_frecuente FROM prev p LIMIT 1) IS DISTINCT FROM u.direccion_frecuente
    )
  ) AS updated_address
FROM upserted u;
$function$
;

-- DROP FUNCTION public.trg_set_pedido_codigo();

CREATE OR REPLACE FUNCTION public.trg_set_pedido_codigo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.pedido_codigo IS NULL OR btrim(NEW.pedido_codigo) = '' THEN
    NEW.pedido_codigo := public.fn_next_pedido_codigo(COALESCE(NEW.created_at::date, CURRENT_DATE));
  END IF;
  IF NEW.created_at IS NULL THEN NEW.created_at := NOW(); END IF;
  IF NEW.updated_at IS NULL THEN NEW.updated_at := NOW(); END IF;
  RETURN NEW;
END;
$function$
;

-- DROP FUNCTION public.unaccent(regdictionary, text);

CREATE OR REPLACE FUNCTION public.unaccent(regdictionary, text)
 RETURNS text
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/unaccent', $function$unaccent_dict$function$
;

-- DROP FUNCTION public.unaccent(text);

CREATE OR REPLACE FUNCTION public.unaccent(text)
 RETURNS text
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/unaccent', $function$unaccent_dict$function$
;

-- DROP FUNCTION public.unaccent_init(internal);

CREATE OR REPLACE FUNCTION public.unaccent_init(internal)
 RETURNS internal
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/unaccent', $function$unaccent_init$function$
;

-- DROP FUNCTION public.unaccent_lexize(internal, internal, internal, internal);

CREATE OR REPLACE FUNCTION public.unaccent_lexize(internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/unaccent', $function$unaccent_lexize$function$
;