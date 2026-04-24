INSERT INTO public.restaurante (nombre,direccion,lat,long,telefono,zona_horaria,radio_cobertura_km,tarifa_envio_tipo,tarifa_envio_valor,mensaje_bienvenida,mensaje_cerrado,created_at,datos_bancarios,moneda) VALUES
	 ('La Isla','Tarragon 22 Arrecife',-33.43720000,-70.65060000,'+56912345678','Atlantic/Canary',5.00,'fija',2500.00,'Bienvenido a Isla 🍝 Tu auténtica experiencia italiana en Santiago.','Gracias por contactarnos. Actualmente estamos cerrados. Nuestro horario es de lunes a domingo de 12:00 a 23:00.','2026-03-27 19:22:35.317631',NULL,'€');

INSERT INTO public.restaurante_config (config_key,config_value,description,updated_at,restaurante_id) VALUES
	 ('modify_window_minutes','10','Ventana para modificar pedido confirmado','2026-04-02 20:22:29.712346-04',1),
	 ('cart_expiry_minutes','60','Minutos hasta expirar un carrito activo','2026-04-02 20:22:29.712346-04',1),
	 ('timezone','America/New_York','Zona horaria del restaurante','2026-04-02 20:22:29.712346-04',1),
	 ('tax_rate','0.00','Porcentaje de impuesto','2026-04-02 20:22:29.712346-04',1),
	 ('estimated_time_pickup','30','Tiempo en minutos de entrega de Pedidos para retiro en Local','2026-04-02 20:22:29.712346-04',1),
	 ('estimated_time_delivery','50','Tiempo en minutos de entrega de Pedidos conde delivery','2026-04-02 20:22:29.712346-04',1),
	 ('pickup_eta_minutes','20','Tiempo estimado por defecto para retiro en minutos','2026-04-18 22:01:15.50642-04',1),
	 ('delivery_eta_min_minutes','30','Tiempo mínimo estimado por defecto para delivery en minutos','2026-04-18 22:01:15.50642-04',1),
	 ('delivery_eta_max_minutes','45','Tiempo máximo estimado por defecto para delivery en minutos','2026-04-18 22:01:15.50642-04',1);


INSERT INTO public.config_operativa (restaurante_id,tiempo_espera_minutos,mensaje_tiempo_espera) VALUES
	 (1,35,'Tu pedido estará listo en aproximadamente 35 minutos.');

INSERT INTO public.delivery_zone (postal_code,zone_name,fee,is_active,description,min_order_amount,estimated_minutes_min,estimated_minutes_max,restaurante_id) VALUES
	 ('35500','ARRECIFE',2.50,true,'ARRECIFE',20.00,30,45,1),
	 ('3509','PLAYA HONDA',1.30,true,'PLAYA HONDA',20.00,30,45,1),
	 ('35571','TAICHE',3.60,true,'TAICHE',20.00,30,45,1);

INSERT INTO public.extra ("name",price,is_active,allergens,created_at,updated_at,restaurante_id) VALUES
	 ('Extra Queso Mozzarella',1.50,true,'lactosa','2026-02-28 21:27:29.643-05',NULL,1),
	 ('Extra Pepperoni',1.80,true,NULL,'2026-02-28 21:27:29.643-05',NULL,1),
	 ('Extra Bacon',1.80,true,NULL,'2026-02-28 21:27:29.643-05',NULL,1),
	 ('Extra Aguacate',1.50,true,NULL,'2026-02-28 21:27:29.643-05',NULL,1),
	 ('Doble Carne',2.50,true,NULL,'2026-02-28 21:27:29.643-05',NULL,1),
	 ('Salsa Especial de la Casa',0.80,true,NULL,'2026-02-28 21:27:29.643-05',NULL,1),
	 ('Queso Cheddar Extra',1.50,true,'lactosa','2026-02-28 21:27:29.643-05',NULL,1),
	 ('Jalapeños',0.80,true,NULL,'2026-02-28 21:27:29.643-05',NULL,1),
	 ('Champiñones',1.00,true,NULL,'2026-02-28 21:27:29.643-05',NULL,1),
	 ('Sin Cebolla',0.00,true,NULL,'2026-02-28 21:27:29.643-05',NULL,1);
INSERT INTO public.extra ("name",price,is_active,allergens,created_at,updated_at,restaurante_id) VALUES
	 ('Sin Gluten (base)',2.00,true,'gluten-trazas','2026-02-28 21:27:29.643-05',NULL,1),
	 ('Salsa BBQ Extra',0.80,true,NULL,'2026-02-28 21:27:29.643-05',NULL,1);

INSERT INTO public.faqs (restaurante_id,pregunta,respuesta,orden) VALUES
	 (1,'¿Cuál es la dirección del local?','Estamos en Av. Italia 1234, Providencia, Santiago. A 2 cuadras del Metro Los Leones.',1),
	 (1,'¿Hacen delivery?','Sí, hacemos delivery dentro de un radio de 5 km. El costo de envío es de $2.500.',2),
	 (1,'¿Cuáles son los métodos de pago?','Aceptamos efectivo y transferencia bancaria. Si es transferencia, te enviamos los datos al confirmar el pedido.',3),
	 (1,'¿Tienen opciones vegetarianas?','Sí, tenemos Pizza Margherita, Pizza Cuatro Quesos, y Ravioles de Ricotta como opciones vegetarianas.',4),
	 (1,'¿Cuánto demora el delivery?','El delivery demora entre 30 y 45 minutos dependiendo de la distancia.',5),
	 (1,'¿Tienen promociones?','Los martes y miércoles: 2x1 en pizzas familiares. Consulta por otras promos vigentes.',6),
	 (1,'¿Cuál es la dirección del local?','Estamos en Av. Italia 1234, Providencia, Santiago. A 2 cuadras del Metro Los Leones.',1),
	 (1,'¿Hacen delivery?','Sí, hacemos delivery dentro de un radio de 5 km. El costo de envío es de $2.500.',2),
	 (1,'¿Cuáles son los métodos de pago?','Aceptamos efectivo y transferencia bancaria. Si es transferencia, te enviamos los datos al confirmar el pedido.',3),
	 (1,'¿Tienen opciones vegetarianas?','Sí, tenemos Pizza Margherita, Pizza Cuatro Quesos, y Ravioles de Ricotta como opciones vegetarianas.',4);
INSERT INTO public.faqs (restaurante_id,pregunta,respuesta,orden) VALUES
	 (1,'¿Cuánto demora el delivery?','El delivery demora entre 30 y 45 minutos dependiendo de la distancia.',5),
	 (1,'¿Tienen promociones?','Los martes y miércoles: 2x1 en pizzas familiares. Consulta por otras promos vigentes.',6),
	 (1,'¿Cuál es la dirección del local?','Estamos en Av. Italia 1234, Providencia, Santiago. A 2 cuadras del Metro Los Leones.',1),
	 (1,'¿Hacen delivery?','Sí, hacemos delivery dentro de un radio de 5 km. El costo de envío es de $2.500.',2),
	 (1,'¿Cuáles son los métodos de pago?','Aceptamos efectivo y transferencia bancaria. Si es transferencia, te enviamos los datos al confirmar el pedido.',3),
	 (1,'¿Tienen opciones vegetarianas?','Sí, tenemos Pizza Margherita, Pizza Cuatro Quesos, y Ravioles de Ricotta como opciones vegetarianas.',4),
	 (1,'¿Cuánto demora el delivery?','El delivery demora entre 30 y 45 minutos dependiendo de la distancia.',5),
	 (1,'¿Tienen promociones?','Los martes y miércoles: 2x1 en pizzas familiares. Consulta por otras promos vigentes.',6),
	 (1,'¿Cuál es la dirección del local?','Estamos en Av. Italia 1234, Providencia, Santiago. A 2 cuadras del Metro Los Leones.',1),
	 (1,'¿Hacen delivery?','Sí, hacemos delivery dentro de un radio de 5 km. El costo de envío es de $2.500.',2);
INSERT INTO public.faqs (restaurante_id,pregunta,respuesta,orden) VALUES
	 (1,'¿Cuáles son los métodos de pago?','Aceptamos efectivo y transferencia bancaria. Si es transferencia, te enviamos los datos al confirmar el pedido.',3),
	 (1,'¿Tienen opciones vegetarianas?','Sí, tenemos Pizza Margherita, Pizza Cuatro Quesos, y Ravioles de Ricotta como opciones vegetarianas.',4),
	 (1,'¿Cuánto demora el delivery?','El delivery demora entre 30 y 45 minutos dependiendo de la distancia.',5),
	 (1,'¿Tienen promociones?','Los martes y miércoles: 2x1 en pizzas familiares. Consulta por otras promos vigentes.',6);

INSERT INTO public.horarios (restaurante_id,dia,disponible,apertura_1,cierre_1,apertura_2,cierre_2) VALUES
	 (1,'Lunes',true,'12:00:00','15:30:00','19:00:00','23:00:00'),
	 (1,'Martes',true,'12:00:00','15:30:00','19:00:00','23:00:00'),
	 (1,'Miércoles',true,'12:00:00','15:30:00','19:00:00','23:00:00'),
	 (1,'Jueves',true,'12:00:00','15:30:00','19:00:00','23:00:00'),
	 (1,'Viernes',true,'12:00:00','15:30:00','19:00:00','23:30:00'),
	 (1,'Sábado',true,'12:00:00','16:00:00','19:00:00','23:30:00'),
	 (1,'Domingo',true,'12:00:00','16:00:00','19:00:00','22:00:00');

INSERT INTO public.menu_category ("name",sort_order,is_active,created_at,updated_at,restaurante_id) VALUES
	 ('Pizzas',1,true,'2026-02-28 21:23:16.764-05',NULL,1),
	 ('Hamburguesas',2,true,'2026-02-28 21:23:16.764-05',NULL,1),
	 ('Entradas',3,true,'2026-02-28 21:23:16.764-05',NULL,1),
	 ('Bebidas',4,true,'2026-02-28 21:23:16.764-05',NULL,1),
	 ('Postres',5,true,'2026-02-28 21:23:16.764-05',NULL,1),
	 ('Panes',2,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 ('Ensaladas',3,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 ('Entrantes',4,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 ('Pescados',5,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 ('Papas',6,true,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_category ("name",sort_order,is_active,created_at,updated_at,restaurante_id) VALUES
	 ('Carnes',7,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 ('Pastas',8,true,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_item (menu_category_id,"name",description,is_pizza,is_active,tags,created_at,updated_at,restaurante_id) VALUES
	 (1,'Margarita','Salsa de tomate, mozzarella fresca y albahaca',true,true,'veg,clasica','2026-02-28 21:25:21.072-05',NULL,1),
	 (1,'Pepperoni','Salsa de tomate, mozzarella y pepperoni artesanal',true,true,'clasica','2026-02-28 21:25:21.072-05',NULL,1),
	 (1,'Cuatro Quesos','Mozzarella, gorgonzola, parmesano y provolone',true,true,'veg,sin-gluten-opcion','2026-02-28 21:25:21.072-05',NULL,1),
	 (1,'Barbacoa Pollo','Salsa BBQ, pechuga de pollo, cebolla caramelizada y mozzarella',true,true,'sin-cerdo','2026-02-28 21:25:21.072-05',NULL,1),
	 (1,'Vegana Suprema','Salsa pesto, verduras asadas, mozzarella vegana',true,true,'veg,vegana,glutenfree','2026-02-28 21:25:21.072-05',NULL,1),
	 (2,'Clásica','Carne de res 150g, lechuga, tomate, cebolla y salsa especial',false,true,'clasica','2026-02-28 21:25:21.072-05',NULL,1),
	 (2,'BBQ Bacon','Carne 200g, bacon crujiente, queso cheddar y salsa BBQ',false,true,'bestseller','2026-02-28 21:25:21.072-05',NULL,1),
	 (2,'Doble Veggie','Doble medallón de garbanzos, aguacate, rúcula y tomate',false,true,'veg,vegana','2026-02-28 21:25:21.072-05',NULL,1),
	 (2,'Pollo Crispy','Pechuga empanizada, queso suizo, pepinillos y mayonesa',false,true,NULL,'2026-02-28 21:25:21.072-05',NULL,1),
	 (3,'Papas Fritas','Papas corte fino con sal marina y kétchup casero',false,true,'veg,vegana','2026-02-28 21:25:21.072-05',NULL,1);
INSERT INTO public.menu_item (menu_category_id,"name",description,is_pizza,is_active,tags,created_at,updated_at,restaurante_id) VALUES
	 (3,'Aros de Cebolla','Rebozados en cerveza con salsa de queso azul',false,true,'veg','2026-02-28 21:25:21.072-05',NULL,1),
	 (3,'Alitas BBQ','Alitas de pollo glaseadas con salsa barbacoa y miel',false,true,NULL,'2026-02-28 21:25:21.072-05',NULL,1),
	 (3,'Mozzarella Sticks','Palitos de mozzarella fritos con marinara',false,true,'veg','2026-02-28 21:25:21.072-05',NULL,1),
	 (4,'Refresco','Coca-Cola, Pepsi, Fanta o Sprite — lata 330 ml',false,true,'veg,vegana','2026-02-28 21:25:21.072-05',NULL,1),
	 (4,'Agua Mineral','Botella 500 ml con o sin gas',false,true,'veg,vegana','2026-02-28 21:25:21.072-05',NULL,1),
	 (5,'Brownie con Helado','Brownie de chocolate caliente con bola de helado de vainilla',false,true,'veg','2026-02-28 21:25:21.072-05',NULL,1),
	 (1,'Tropical','Tomate, queso, jamón, plátano y piña',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Vegetariana','Tomate, queso, champiñones, cebolla, alcachofas, pimiento y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Al Tono','Tomate, queso, atún, cebolla y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Coloseo','Tomate, queso, bacon, cebolla y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_item (menu_category_id,"name",description,is_pizza,is_active,tags,created_at,updated_at,restaurante_id) VALUES
	 (1,'Diabola','Tomate, queso, chorizo picante y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'La Graciosa','Tomate, queso, ajo, guindilla, gambas y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Alegranza','Tomate, queso, jamón, huevo, pimiento, cebolla y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Lanzarote','Tomate, queso, queso de cabra, tomate natural, dátiles y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Puerto Calero','Tomate, queso, jamón y huevo',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'4 Quesos','Tomate, queso, queso Edam, mozarella, roquefort, queso cabra y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'4 Estaciones','Tomate, queso, jamón, champiñones, gambas, alcachofas y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Caprichosa','Tomate, queso, jamón, champiñones, ajo, tomate natural y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Calzone','Tomate, queso, jamón, champiñones, gambas y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Marinera','Tomate, queso, gambas, cangrejo y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_item (menu_category_id,"name",description,is_pizza,is_active,tags,created_at,updated_at,restaurante_id) VALUES
	 (1,'Frutti di Mare','Tomate, queso, atún, cangrejo, gambas y mejillones',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Especial de la Casa','Tomate, queso, carne, jamón, champiñones, cebolla y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Volcan','Tomate, queso, carne, jamón, champiñones, gambas y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Barbacoa','Tomate, queso, jamón, bacon, pollo, carne, salsa barbacoa y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Pollo','Tomate, queso, pollo, jamón, huevo, ajo y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Italiana','Tomate, queso, pepperoni, jamón, champiñones y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Montaña Clara','Tomate, queso, atún, gambas y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Gran Canaria','Tomate, queso, atún, jamón, gambas y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Fuerteventura','Tomate, queso, bacon, queso cabra, dátiles y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Carbonara','Queso, jamón, bacon, cebolla, huevo, salsa carbonara y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_item (menu_category_id,"name",description,is_pizza,is_active,tags,created_at,updated_at,restaurante_id) VALUES
	 (1,'La Isla (pizza)','Tomate, queso, jamón, pollo kebab, pepperoni, tomate seco y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (1,'Cavernicola','Tomate, queso, bacon, salchicha, chorizo picante, pepperoni y orégano',true,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (6,'Pan de ajo',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (6,'Pan de ajo con tomate',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (6,'Pan con queso',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (6,'Pan de ajo con queso y tomate natural',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (6,'Pan de ajo con queso y chorizo picante',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (6,'Pan de ajo con queso y jamon',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (6,'Pan de ajo con roquefort',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (6,'Pan Frutti','Atún, cangrejo, queso, gambas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_item (menu_category_id,"name",description,is_pizza,is_active,tags,created_at,updated_at,restaurante_id) VALUES
	 (7,'Ensalada La isla','Escarola, tomate, cebolla, queso cabra, millo, pimiento, zanahoria y aceitunas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (7,'Ensalada Atún','Escarola, tomate, cebolla, atún, millo, pimiento, zanahoria y aceitunas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (7,'Ensalada Pollo','Escarola, tomate, pimiento, manzana, pollo, salsa rosa y zanahoria',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (7,'Ensalada Frutos del mar','Escarola, tomate, cebolla, atún, cangrejo, gambas y salsa rosa',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (7,'Coctel de gambas','Escarola, manzana, gambas, piña, salsa rosa',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (7,'Ensalada César','Escarola, tomate natural, pollo, picatoste, queso parmesano, salsa César',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (8,'Gambas al ajillo',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (8,'Datiles con bacon',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (8,'Queso frito con salsa de arandanos (7 unid)',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (8,'Nuggets de pollo (8 unids)',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_item (menu_category_id,"name",description,is_pizza,is_active,tags,created_at,updated_at,restaurante_id) VALUES
	 (8,'Tequeños de queso con salsa de arandanos (6 unid)',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (8,'Palitos de mozarella (8 unid)',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (8,'Ración de nachos con queso, carne mechada, salsa mexicana, jalapeños y salsa cheddar, guacamole',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (8,'Alitas Broaster (8 unid)',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (8,'Alitas Barbacoa (8 unid)',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (9,'Matrimonio (calamares y pescado rebozado)','Servido con ensalada y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (9,'Pescado a la plancha con ajo y perejil','Servido con ensalada y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (9,'Calamares a la romana','Servido con ensalada y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (9,'Pescado rebozado','Servido con ensalada y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (10,'Papas fritas',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_item (menu_category_id,"name",description,is_pizza,is_active,tags,created_at,updated_at,restaurante_id) VALUES
	 (10,'Papas fritas con Queso',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (10,'Papas fritas con salchichas',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (10,'Papas gajo',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (10,'Papas Americanas','papas gajo, bacon crujiente y salsa cheddar',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (10,'Papas la isla','papas fritas, salchichas, queso, pollo kebab, cebolla crujiente',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (10,'Salsa a elegir (unidad a parte)','Ketchup, Mayonesa, Barbacoa, Guacamole, Salsa de Piña, Ali-oli, Salsa Rosada, Salsa cheddar',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Entrecort a la plancha','Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Entrecort a la cebolla','Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Entrecort con salsa de champiñones','Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Entrecort con salsa pimienta','Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_item (menu_category_id,"name",description,is_pizza,is_active,tags,created_at,updated_at,restaurante_id) VALUES
	 (11,'Escalope empanado','Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Escalope la romana','Tomate triturado, queso, oregano. Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Escalope en salsa champiñones','Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Escalope en salsa pimienta','Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Pechuga de pollo empanada','Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Pechuga de pollo a la plancha','Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Pechuga de pollo a la plancha con ajo y perejil','Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Pechuga de pollo empanada en salsa de champiñones','Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Pechuga de pollo empanada en salsa de pimienta','Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Pechuga de pollo en salsa especial','Servido con arroz y papas fritas',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_item (menu_category_id,"name",description,is_pizza,is_active,tags,created_at,updated_at,restaurante_id) VALUES
	 (11,'Salsa a elegir (Champiñones/Mexicana/Pimienta/Roquefort)',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Salsa especial con gambas',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (11,'Salsa aparte',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (12,'Lasaña de carne',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (12,'Espaguetis Napolitana',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (12,'Espaguetis a ajillo','Gambas, ajo, perejil y guindilla',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (12,'Espaguetis con una salsa a elegir','Carbonara, Boloñesa, Frutti di mari, Maremonti',false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (4,'Refrescos 33 c',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (4,'Refrescos 1.5 L',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (4,'Cerveza Tropical',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_item (menu_category_id,"name",description,is_pizza,is_active,tags,created_at,updated_at,restaurante_id) VALUES
	 (4,'Agua 1.5 L',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (4,'Zumo Bio Fruta Tropical',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (4,'Postobon manzana',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (4,'Postobon colombiana',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1),
	 (4,'Postobon uva',NULL,false,true,NULL,'2026-03-08 10:37:05.885-04',NULL,1);
	 
INSERT INTO public.menu_item_extra (menu_item_id,extra_id,is_default) VALUES
	 (1,1,false),
	 (1,2,false),
	 (1,9,false),
	 (1,11,false),
	 (2,1,false),
	 (2,2,false),
	 (2,3,false),
	 (2,8,false),
	 (2,11,false),
	 (3,1,false);
INSERT INTO public.menu_item_extra (menu_item_id,extra_id,is_default) VALUES
	 (3,9,false),
	 (3,11,false),
	 (4,1,false),
	 (4,12,false),
	 (4,8,false),
	 (4,11,false),
	 (5,9,false),
	 (5,11,false),
	 (6,3,false),
	 (6,4,false);
INSERT INTO public.menu_item_extra (menu_item_id,extra_id,is_default) VALUES
	 (6,5,false),
	 (6,6,false),
	 (6,10,false),
	 (7,3,false),
	 (7,5,false),
	 (7,7,false),
	 (7,8,false),
	 (7,12,false),
	 (8,4,false),
	 (8,9,false);
INSERT INTO public.menu_item_extra (menu_item_id,extra_id,is_default) VALUES
	 (8,6,false),
	 (9,7,false),
	 (9,6,false),
	 (9,8,false),
	 (9,10,false),
	 (10,6,false),
	 (10,8,false),
	 (12,12,false),
	 (12,8,false),
	 (13,1,false);

INSERT INTO public.menu_variant (menu_item_id,variant_name,price,sku,is_default,is_active,created_at,updated_at,restaurante_id) VALUES
	 (1,'Personal (25 cm)',8.90,'PIZ-MAR-PER',false,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (1,'Mediana (32 cm)',12.90,'PIZ-MAR-MED',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (1,'Familiar (45 cm)',18.90,'PIZ-MAR-FAM',false,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (2,'Personal (25 cm)',9.90,'PIZ-PEP-PER',false,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (2,'Mediana (32 cm)',13.90,'PIZ-PEP-MED',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (2,'Familiar (45 cm)',20.90,'PIZ-PEP-FAM',false,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (3,'Personal (25 cm)',10.50,'PIZ-4QS-PER',false,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (3,'Mediana (32 cm)',14.90,'PIZ-4QS-MED',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (3,'Familiar (45 cm)',21.90,'PIZ-4QS-FAM',false,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (4,'Personal (25 cm)',10.90,'PIZ-BBP-PER',false,true,'2026-02-28 21:25:38.314-05',NULL,1);
INSERT INTO public.menu_variant (menu_item_id,variant_name,price,sku,is_default,is_active,created_at,updated_at,restaurante_id) VALUES
	 (4,'Mediana (32 cm)',15.50,'PIZ-BBP-MED',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (4,'Familiar (45 cm)',22.90,'PIZ-BBP-FAM',false,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (5,'Personal (25 cm)',10.50,'PIZ-VEG-PER',false,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (5,'Mediana (32 cm)',14.90,'PIZ-VEG-MED',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (5,'Familiar (45 cm)',21.50,'PIZ-VEG-FAM',false,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (6,'Estándar',10.50,'BUR-CLA-STD',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (7,'Estándar',13.90,'BUR-BBQ-STD',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (8,'Estándar',11.90,'BUR-VEG-STD',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (9,'Estándar',11.50,'BUR-POL-STD',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (10,'Ración',4.50,'ENT-PAP-RAC',true,true,'2026-02-28 21:25:38.314-05',NULL,1);
INSERT INTO public.menu_variant (menu_item_id,variant_name,price,sku,is_default,is_active,created_at,updated_at,restaurante_id) VALUES
	 (10,'Ración Grande',6.50,'ENT-PAP-GRA',false,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (11,'Ración (8 uds)',5.90,'ENT-ARO-RAC',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (12,'Ración (8 uds)',8.90,'ENT-ALI-RAC',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (12,'Ración Grande (14 uds)',13.50,'ENT-ALI-GRA',false,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (13,'Ración (6 uds)',6.50,'ENT-MOZ-RAC',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (14,'Lata 330 ml',2.20,'BEB-REF-LAT',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (14,'Botella 1.5 L',3.90,'BEB-REF-BOT',false,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (15,'Botella 500 ml',1.80,'BEB-AGU-500',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (16,'Ración Individual',5.90,'POS-BRW-IND',true,true,'2026-02-28 21:25:38.314-05',NULL,1),
	 (1,'Única',7.20,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_variant (menu_item_id,variant_name,price,sku,is_default,is_active,created_at,updated_at,restaurante_id) VALUES
	 (17,'Única',9.20,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (18,'Única',9.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (19,'Única',8.60,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (20,'Única',8.60,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (21,'Única',8.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (2,'Única',8.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (22,'Única',8.80,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (23,'Única',9.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (24,'Única',9.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (25,'Única',8.60,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_variant (menu_item_id,variant_name,price,sku,is_default,is_active,created_at,updated_at,restaurante_id) VALUES
	 (26,'Única',9.20,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (27,'Única',10.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (28,'Única',9.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (29,'Única',10.20,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (30,'Única',9.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (31,'Única',10.40,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (32,'Única',10.90,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (33,'Única',11.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (34,'Única',12.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (35,'Única',9.70,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_variant (menu_item_id,variant_name,price,sku,is_default,is_active,created_at,updated_at,restaurante_id) VALUES
	 (36,'Única',10.20,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (37,'Única',9.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (38,'Única',10.20,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (39,'Única',10.20,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (40,'Única',10.90,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (41,'Única',10.90,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (42,'Única',10.90,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (43,'Única',1.80,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (44,'Única',2.10,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (45,'Única',2.30,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_variant (menu_item_id,variant_name,price,sku,is_default,is_active,created_at,updated_at,restaurante_id) VALUES
	 (46,'Única',2.80,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (47,'Única',2.80,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (48,'Única',2.80,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (49,'Única',2.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (50,'Única',3.90,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (51,'Única',6.20,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (52,'Única',6.20,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (53,'Única',6.30,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (54,'Única',7.80,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (55,'Única',7.10,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_variant (menu_item_id,variant_name,price,sku,is_default,is_active,created_at,updated_at,restaurante_id) VALUES
	 (56,'Única',7.30,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (57,'Única',8.20,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (58,'Única',7.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (59,'Única',7.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (60,'Única',4.90,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (61,'Única',7.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (62,'Única',4.90,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (63,'Única',8.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (64,'Única',7.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (65,'Única',7.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_variant (menu_item_id,variant_name,price,sku,is_default,is_active,created_at,updated_at,restaurante_id) VALUES
	 (66,'Única',12.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (67,'Única',10.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (68,'Única',12.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (69,'Única',10.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (70,'Única',3.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (71,'Única',4.10,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (72,'Única',4.10,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (73,'Única',4.10,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (74,'Única',5.80,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (75,'Única',6.90,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_variant (menu_item_id,variant_name,price,sku,is_default,is_active,created_at,updated_at,restaurante_id) VALUES
	 (76,'Única',0.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (77,'Única',12.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (78,'Única',13.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (79,'Única',13.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (80,'Única',13.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (81,'Única',9.70,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (82,'Única',10.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (83,'Única',10.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (84,'Única',10.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (85,'Única',9.70,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_variant (menu_item_id,variant_name,price,sku,is_default,is_active,created_at,updated_at,restaurante_id) VALUES
	 (86,'Única',9.70,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (87,'Única',10.20,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (88,'Única',10.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (89,'Única',10.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (90,'Única',11.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (91,'Única',2.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (92,'Única',3.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (93,'Única',1.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (94,'Única',9.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (95,'Única',9.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1);
INSERT INTO public.menu_variant (menu_item_id,variant_name,price,sku,is_default,is_active,created_at,updated_at,restaurante_id) VALUES
	 (96,'Única',9.50,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (97,'Única',9.00,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (98,'Única',1.80,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (99,'Única',3.60,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (100,'Única',1.90,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (101,'Única',1.40,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (102,'Única',1.80,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (103,'Única',2.60,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (104,'Única',2.60,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1),
	 (105,'Única',2.60,NULL,true,true,'2026-03-08 10:37:05.885-04',NULL,1);

INSERT INTO public.pedidos (restaurante_id,usuario_id,telefono,items,subtotal,tipo_despacho,direccion,lat,lng,distancia_km,tiempo_estimado,costo_envio,total,metodo_pago,estado,notas,created_at,updated_at,session_id,session_started_at,pedido_numero,pedido_codigo) VALUES
	 (1,3,'+15162849708','[{"notas": null, "nombre": "Lanzarote - Única", "cantidad": 1, "subtotal": 9.5, "precio_unitario": 9.5}, {"notas": null, "nombre": "Barbacoa Pollo - Personal (25 cm)", "cantidad": 1, "subtotal": 10.9, "precio_unitario": 10.9}]',20.40,NULL,NULL,NULL,NULL,NULL,NULL,0.00,20.40,NULL,'en_curso',NULL,'2026-04-19 02:42:00.048235','2026-04-19 02:48:00.619101','26981102-4b4f-4039-adf5-1fa3bd776f1e','2026-04-19 02:42:00.048235',1,'260419-1001'),
	 (1,3,'+15162849708','[{"notas": null, "nombre": "Lanzarote - Única", "cantidad": 1, "subtotal": 9.5, "precio_unitario": 9.5}, {"notas": null, "nombre": "Barbacoa - Única", "cantidad": 1, "subtotal": 12, "precio_unitario": 12}, {"notas": null, "nombre": "Barbacoa Pollo - Mediana (32 cm)", "cantidad": 1, "subtotal": 15.5, "precio_unitario": 15.5}, {"notas": null, "nombre": "Ración de nachos con queso, carne mechada, salsa mexicana, jalapeños y salsa cheddar, guacamole - Única", "cantidad": 1, "subtotal": 8, "precio_unitario": 8}]',45.00,'retiro',NULL,NULL,NULL,NULL,'20 min',0.00,45.00,'efectivo','en_curso',NULL,'2026-04-19 13:25:46.371738','2026-04-19 13:28:05.402803','d8333375-f12d-4dae-a789-5016f6db6e98','2026-04-19 13:25:46.371738',2,'260419-1002'),
	 (1,3,'+15162849708','[{"notas": null, "nombre": "Barbacoa - Única", "cantidad": 1, "subtotal": 12, "precio_unitario": 12}, {"notas": null, "nombre": "Brownie con Helado - Ración Individual", "cantidad": 1, "subtotal": 5.9, "precio_unitario": 5.9}, {"notas": null, "nombre": "Postobon Uva - Única", "cantidad": 1, "subtotal": 2.6, "precio_unitario": 2.6}]',20.50,NULL,NULL,NULL,NULL,NULL,NULL,0.00,20.50,'efectivo','confirmado',NULL,'2026-04-19 13:31:10.251491','2026-04-19 13:54:15.626663','23ee8d30-b6e5-4cc6-8ad7-944491752a80','2026-04-19 13:31:10.251491',3,'260419-1003'),
	 (1,3,'+15162849708','[{"notas": null, "nombre": "Cerveza Tropical - Única", "cantidad": 1, "subtotal": 1.9, "precio_unitario": 1.9}, {"notas": null, "nombre": "Lanzarote - Única", "cantidad": 1, "subtotal": 9.5, "precio_unitario": 9.5}, {"notas": null, "nombre": "Barbacoa - Única", "cantidad": 1, "subtotal": 12, "precio_unitario": 12}]',23.40,'delivery','Calle de Agustín Millares Sall, 1 35500 Arrecife Las Palmas, Spain',NULL,NULL,NULL,'30-45 min',2.50,25.90,'efectivo','confirmado',NULL,'2026-04-19 16:09:35.314844','2026-04-19 16:12:40.892139','d0a0f984-4351-4814-90a3-78bc5c6afefc','2026-04-19 16:09:35.314844',4,'260419-1004'),
	 (1,3,'+15162849708','[{"notas": null, "nombre": "Barbacoa - Única", "cantidad": 1, "subtotal": 12, "precio_unitario": 12}, {"notas": null, "nombre": "Pollo Crispy - Estándar", "cantidad": 1, "subtotal": 11.5, "precio_unitario": 11.5}]',23.50,'delivery','Calle de Agustín Millares Sall, 1 35571 taiche Las Palmas, Spain',NULL,NULL,NULL,'30-45 min',3.60,27.10,'transferencia','pendiente_pago',NULL,'2026-04-19 16:26:54.636677','2026-04-19 16:34:03.639337','3642dcee-3c00-4e51-bb5b-74643b93d37b','2026-04-19 16:26:54.636677',5,'260419-1005'),
	 (1,3,'+15162849708','[{"notas": null, "nombre": "Calamares a la romana - Única", "cantidad": 1, "subtotal": 12, "precio_unitario": 12}, {"notas": null, "nombre": "Ensalada Atún - Única", "cantidad": 1, "subtotal": 6.2, "precio_unitario": 6.2}]',18.20,'retiro',NULL,NULL,NULL,NULL,'20 min',0.00,18.20,'transferencia','pendiente_pago',NULL,'2026-04-19 23:38:24.89889','2026-04-19 23:40:07.468179','dcfb5a0b-e4bc-40b6-b5cd-f31eace5891e','2026-04-19 23:38:24.89889',6,'260419-1006');

INSERT INTO public.usuarios (restaurante_id,telefono,nombre,direccion_frecuente,lat_frecuente,long_frecuente,contexto,created_at,updated_at) VALUES
	 (1,'+56912345678','Carlos',NULL,NULL,NULL,'Cliente recurrente. Última vez pidió Pizza Margherita y Coca Cola.','2026-03-27 19:22:35.334339','2026-03-27 19:22:35.334339'),
	 (1,'+56937569677','Carlos',NULL,NULL,NULL,NULL,'2026-03-27 20:08:56.045437','2026-03-27 20:08:56.045437'),
	 (1,'+15162849708','Augusto Gutierrez','Calle de Agustín Millares Sall, 1 35571 taiche Las Palmas, Spain',NULL,NULL,NULL,'2026-04-15 19:51:40.395581','2026-04-19 23:40:19.807757');

