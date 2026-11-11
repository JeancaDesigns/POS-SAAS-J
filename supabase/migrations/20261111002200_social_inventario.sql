-- ============================================================================
-- Inventario y recetas de Social (generado por scripts/importar-social.mjs desde gestion-personal).
-- 148 insumos y 71 recetas. Stock inicial 0: se llena con el primer conteo.
-- Idempotente: no duplica insumos (por clave) y solo llena recetas sin ingredientes.
-- Deshacer (borra TODO lo importado, también movimientos de esos insumos):
--   delete from public.recipes where product_id in (select id from public.products where restaurant_id =
--     (select id from public.restaurants where slug = 'social')) and not exists (select 1 from public.recipe_items ri
--     join public.inventory_items i on i.id = ri.inventory_item_id where ri.recipe_id = recipes.id and i.clave is null);
--   delete from public.inventory_items where clave is not null and restaurant_id = (select id from public.restaurants where slug = 'social');
-- ============================================================================
do $import$
declare
  r uuid;
begin
  select id into r from public.restaurants where slug = 'social';
  if r is null then raise notice 'No existe el restaurante social: nada que importar'; return; end if;

  insert into public.inventory_items (restaurant_id, clave, name, categoria, unit, stock, stock_bodega, min_stock, stock_ideal, compra_nombre, compra_cantidad, cost, available)
  values
    (r, 'buchanans-deluxe', 'Buchanan''s Deluxe', 'licores', 'ml', 0, 0, 1500, 3000, 'botella', 750, 0, false),
    (r, 'buchanans-master', 'Buchanan''s Master', 'licores', 'ml', 0, 0, 0, null, 'botella', 750, 0, false),
    (r, 'black-label', 'Johnnie Walker Black Label', 'licores', 'ml', 0, 0, 2000, 4000, 'botella', 1000, 0, false),
    (r, 'double-black', 'Johnnie Walker Double Black', 'licores', 'ml', 0, 0, 1500, 3000, 'botella', 750, 0, false),
    (r, 'red-label', 'Johnnie Walker Red Label', 'licores', 'ml', 0, 0, 750, 1500, 'botella', 750, 0, false),
    (r, 'old-parr', 'Old Parr', 'licores', 'ml', 0, 0, 750, 2250, 'botella', 750, 0, false),
    (r, 'antioqueno-1050', 'Aguardiente Antioqueño tetrapack 1,05 L', 'licores', 'ml', 0, 0, 1050, 2100, 'tetrapack', 1050, 0, false),
    (r, 'antioqueno-tapa-azul', 'Aguardiente Antioqueño Tapa Azul 750 ml', 'licores', 'ml', 0, 0, 1500, 3000, 'botella', 750, 0, false),
    (r, 'antioqueno-tapa-verde', 'Aguardiente Antioqueño Tapa Verde 750 ml', 'licores', 'ml', 0, 0, 1500, 3000, 'botella', 750, 0, false),
    (r, 'aguardiente-amarillo', 'Aguardiente Amarillo', 'licores', 'ml', 0, 0, 1500, 3000, 'botella', 750, 0, false),
    (r, 'vdc-carta-oro', 'Ron Viejo de Caldas 8 años 750 ml', 'licores', 'ml', 0, 0, 1500, 3000, 'botella', 750, 0, false),
    (r, 'vdc-tradicional', 'Ron Viejo de Caldas Tradicional 750 ml', 'licores', 'ml', 0, 0, 1500, 3000, 'botella', 750, 0, false),
    (r, 'vdc-tradicional-grande', 'Ron Viejo de Caldas garrafa', 'licores', 'ml', 0, 0, 0, null, 'garrafa', 1750, 0, false),
    (r, 'ron-blanco', 'Ron blanco', 'licores', 'ml', 0, 0, 0, null, 'botella', 750, 0, false),
    (r, 'bosque-de-indias', 'Ginebra Bosque de Indias', 'licores', 'ml', 0, 0, 750, 1500, 'botella', 750, 0, false),
    (r, 'malibu', 'Malibú', 'licores', 'ml', 0, 0, 750, 1500, 'botella', 750, 0, false),
    (r, 'vodka', 'Absolut Vodka', 'licores', 'ml', 0, 0, 750, 2250, 'botella', 750, 0, false),
    (r, 'smirnoff-tamarindo', 'Vodka Smirnoff Spicy Tamarindo', 'licores', 'ml', 0, 0, 1500, 2250, 'botella', 750, 0, false),
    (r, 'jose-cuervo', 'José Cuervo', 'licores', 'ml', 0, 0, 750, 2250, 'botella', 750, 0, false),
    (r, 'baileys', 'Baileys', 'licores', 'ml', 0, 0, 750, 1500, 'botella', 750, 0, false),
    (r, 'campari', 'Campari', 'licores', 'ml', 0, 0, 750, 750, 'botella', 750, 0, false),
    (r, 'triple-sec-convier', 'Triple Sec Convier', 'licores', 'ml', 0, 0, 750, 1500, 'botella', 750, 0, false),
    (r, 'licor-cafe', 'Licor de café', 'licores', 'ml', 0, 0, 750, 1500, 'botella', 750, 0, false),
    (r, 'vina-maipo', 'Vino Viña Maipo', 'licores', 'ml', 0, 0, 750, 1500, 'botella', 750, 0, false),
    (r, 'aguila', 'Águila', 'cervezas', 'und', 0, 0, 20, 48, 'unidad', 1, 0, false),
    (r, 'poker', 'Póker', 'cervezas', 'und', 0, 0, 20, 48, 'unidad', 1, 0, false),
    (r, 'club-colombia', 'Club Colombia', 'cervezas', 'und', 0, 0, 20, 48, 'unidad', 1, 0, false),
    (r, 'costenita', 'Costeñita', 'cervezas', 'und', 0, 0, 36, 90, 'unidad', 1, 0, false),
    (r, 'stella', 'Stella Artois', 'cervezas', 'und', 0, 0, 20, 36, 'unidad', 1, 0, false),
    (r, 'coronita', 'Coronita', 'cervezas', 'und', 0, 0, 20, 48, 'unidad', 1, 0, false),
    (r, 'budweiser', 'Budweiser', 'cervezas', 'und', 0, 0, 20, 48, 'unidad', 1, 0, false),
    (r, 'modelo', 'Modelo', 'cervezas', 'und', 0, 0, 12, 24, 'unidad', 1, 0, false),
    (r, 'cola-pola', 'Cola y Pola', 'cervezas', 'und', 0, 0, 6, 12, 'unidad', 1, 0, false),
    (r, 'reds-rose', 'Red''s Rosé', 'cervezas', 'und', 0, 0, 0, null, 'unidad', 1, 0, false),
    (r, 'smirnoff-ice-verde', 'Smirnoff Ice verde (botellita)', 'cervezas', 'und', 0, 0, 12, 24, 'unidad', 1, 0, false),
    (r, 'smirnoff-ice-rojo', 'Smirnoff Ice rojo (botellita)', 'cervezas', 'und', 0, 0, 12, 24, 'unidad', 1, 0, false),
    (r, 'coca-cola-250', 'Coca-Cola 250 ml', 'bebidas', 'und', 0, 0, 12, 24, 'unidad', 1, 0, false),
    (r, 'coca-cola-400', 'Coca-Cola 400 ml', 'bebidas', 'und', 0, 0, 12, 24, 'unidad', 1, 0, false),
    (r, 'coca-cola-zero', 'Coca-Cola Zero', 'bebidas', 'und', 0, 0, 12, 24, 'unidad', 1, 0, false),
    (r, 'kola-romana', 'Kola Román 350 ml', 'bebidas', 'ml', 0, 0, 4200, 8400, 'botella', 350, 0, false),
    (r, 'agua-brisa', 'Agua Brisa grande', 'bebidas', 'und', 0, 0, 24, 60, 'unidad', 1, 0, false),
    (r, 'gatorade', 'Gatorade', 'bebidas', 'und', 0, 0, 12, 24, 'unidad', 1, 0, false),
    (r, 'electrolit', 'Electrolit', 'bebidas', 'und', 0, 0, 12, 24, 'unidad', 1, 0, false),
    (r, 'jugo-del-valle', 'Jugo Del Valle (naranja)', 'bebidas', 'ml', 0, 0, 1000, 2000, 'unidad', 1000, 0, false),
    (r, 'jugo-mandarina', 'Jugo de mandarina', 'bebidas', 'ml', 0, 0, 1000, 1000, 'unidad', 1000, 0, false),
    (r, 'bretana', 'Bretaña', 'mixers', 'und', 0, 0, 24, 48, 'unidad', 1, 0, false),
    (r, 'ginger-ale', 'Ginger (ginger ale)', 'mixers', 'und', 0, 0, 24, 48, 'unidad', 1, 0, false),
    (r, 'ginger-beer', 'Ginger beer', 'mixers', 'und', 0, 0, 6, 16, 'unidad', 1, 0, false),
    (r, 'sirope-kiwi', 'Sirope de kiwi', 'siropes', 'und', 0, 0, 1, 2, 'botella', 1, 0, false),
    (r, 'sirope-passion-fruit', 'Sirope de passion fruit', 'siropes', 'und', 0, 0, 1, 1, 'botella', 1, 0, false),
    (r, 'sirope-maracuya', 'Sirope de maracuyá', 'siropes', 'ml', 0, 0, 375, 750, 'botella', 750, 0, false),
    (r, 'sirope-mango', 'Sirope de mango', 'siropes', 'ml', 0, 0, 750, 1500, 'botella', 750, 0, false),
    (r, 'sirope-blue-curacao', 'Sirope Blue Curaçao', 'siropes', 'ml', 0, 0, 750, 1500, 'botella', 750, 0, false),
    (r, 'sirope-granadina', 'Sirope de granadina', 'siropes', 'ml', 0, 0, 750, 1500, 'botella', 750, 0, false),
    (r, 'kanaloa-coco', 'Kanaloa Coco', 'siropes', 'und', 0, 0, 1, 2, 'botella', 1, 0, false),
    (r, 'kanaloa-sandia', 'Kanaloa Sandía', 'siropes', 'ml', 0, 0, 750, 1500, 'botella', 750, 0, false),
    (r, 'real-coco', 'Real Coco (crema de coco)', 'siropes', 'ml', 0, 0, 1000, 1000, 'unidad', 1000, 0, false),
    (r, 'zumo-limon', 'Zumo de limón 250 ml', 'siropes', 'ml', 0, 0, 4500, 6750, 'botellita', 250, 0, false),
    (r, 'mezcla-helado', 'Mezcla para helado', 'siropes', 'und', 0, 0, 4, 10, 'unidad', 1, 0, false),
    (r, 'pulpa-maracuya', 'Pulpa de maracuyá', 'siropes', 'und', 0, 0, 4, 16, 'pulpa', 1, 0, false),
    (r, 'pulpa-guanabana', 'Pulpa de guanábana', 'siropes', 'und', 0, 0, 4, 16, 'pulpa', 1, 0, false),
    (r, 'pulpa-mango', 'Pulpa de mango', 'siropes', 'und', 0, 0, 4, 16, 'pulpa', 1, 0, false),
    (r, 'mora', 'Mora congelada', 'siropes', 'und', 0, 0, 1, 3, 'unidad', 1, 0, false),
    (r, 'fresa', 'Fresa congelada', 'siropes', 'und', 0, 0, 1, 3, 'unidad', 1, 0, false),
    (r, 'frutos-rojos', 'Frutos rojos machacados (casero)', 'preparados', 'ml', 0, 0, 0, null, 'frasco', 500, 0, false),
    (r, 'jarra-cafe', 'Jarra de café (preparado)', 'preparados', 'und', 0, 0, 0, null, 'jarra', 1, 0, false),
    (r, 'jarra-maracuya', 'Jarra de maracuyá (preparado)', 'preparados', 'und', 0, 0, 0, null, 'jarra', 1, 0, false),
    (r, 'sirope-simple', 'Sirope simple (casero)', 'preparados', 'ml', 0, 0, 0, null, 'botella', 750, 0, false),
    (r, 'kiwi-licuado', 'Kiwi licuado (casero)', 'preparados', 'ml', 0, 0, 0, null, 'frasco', 500, 0, false),
    (r, 'zumo-pina', 'Zumo de piña (casero)', 'preparados', 'ml', 0, 0, 0, null, 'frasco', 500, 0, false),
    (r, 'limon', 'Limones', 'frescos', 'und', 0, 0, 4, 10, 'unidad', 1, 0, false),
    (r, 'kiwi', 'Kiwis', 'frescos', 'und', 0, 0, 4, 10, 'unidad', 1, 0, false),
    (r, 'pina', 'Piña', 'frescos', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'arandanos', 'Arándanos', 'frescos', 'und', 0, 0, 2, 3, 'caja', 1, 0, false),
    (r, 'lychees', 'Lychees', 'frescos', 'ml', 0, 0, 400, 800, 'lata', 400, 0, false),
    (r, 'hierbabuena', 'Hierbabuena', 'frescos', 'und', 0, 0, 0, null, 'atado', 1, 0, false),
    (r, 'hielo', 'Hielo', 'frescos', 'und', 0, 0, 0, null, 'bolsa', 1, 0, false),
    (r, 'huevos', 'Huevos', 'frescos', 'und', 0, 0, 4, 12, 'unidad', 1, 0, false),
    (r, 'leche', 'Leche 1.100 ml', 'lacteos', 'ml', 0, 0, 6600, 19800, 'unidad', 1100, 0, false),
    (r, 'leche-condensada', 'Leche condensada', 'lacteos', 'und', 0, 0, 1, 2, 'unidad', 1, 0, false),
    (r, 'crema-chantilli', 'Crema chantilly', 'lacteos', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'leche-klim', 'Leche Klim', 'lacteos', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'cafe-grano', 'Café en grano Dorado', 'cafe-te', 'und', 0, 0, 1, 1, 'paquete', 1, 0, false),
    (r, 'te-verde-pina', 'Té verde con piña', 'cafe-te', 'und', 0, 0, 2, 3, 'caja', 1, 0, false),
    (r, 'te-frutos-bosque', 'Té frutos del bosque', 'cafe-te', 'und', 0, 0, 2, 3, 'caja', 1, 0, false),
    (r, 'milo', 'Milo', 'cafe-te', 'und', 0, 0, 1, 2, 'unidad', 1, 0, false),
    (r, 'palitos-queso', 'Palitos de queso', 'comida', 'und', 0, 0, 4, 10, 'unidad', 1, 0, false),
    (r, 'palitos-bocadillo', 'Palitos de bocadillo con queso', 'comida', 'und', 0, 0, 2, 6, 'unidad', 1, 0, false),
    (r, 'empanadas-carne', 'Empanadas de carne', 'comida', 'und', 0, 0, 6, 12, 'unidad', 1, 0, false),
    (r, 'empanadas-pollo', 'Empanadas de pollo', 'comida', 'und', 0, 0, 6, 12, 'unidad', 1, 0, false),
    (r, 'arepas-mixtas', 'Arepas mixtas', 'comida', 'und', 0, 0, 6, 12, 'unidad', 1, 0, false),
    (r, 'papas-himalaya', 'Papas Monterojo sal rosada del Himalaya', 'comida', 'und', 0, 0, 4, 12, 'unidad', 1, 0, false),
    (r, 'torta-chocolate', 'Torta de chocolate con cookies and cream', 'comida', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'torta-durazno', 'Torta de durazno', 'comida', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'oreo', 'Oreo', 'comida', 'und', 0, 0, 4, 16, 'paquete', 1, 0, false),
    (r, 'mym', 'M&M', 'comida', 'und', 0, 0, 2, 6, 'paquete', 1, 0, false),
    (r, 'salsa-chocolate', 'Salsa de chocolate', 'comida', 'und', 0, 0, 1, 2, 'unidad', 1, 0, false),
    (r, 'salsa-caramelo', 'Salsa de caramelo', 'comida', 'und', 0, 0, 1, 2, 'unidad', 1, 0, false),
    (r, 'flores', 'Flores comestibles', 'decoracion', 'und', 0, 0, 2, 4, 'caja', 1, 0, false),
    (r, 'limon-deshidratado', 'Limón deshidratado', 'decoracion', 'und', 0, 0, 0, null, 'paquete', 1, 0, false),
    (r, 'naranja-deshidratada', 'Naranja deshidratada', 'decoracion', 'und', 0, 0, 0, null, 'paquete', 1, 0, false),
    (r, 'azucar-rosada', 'Azúcar rosada', 'decoracion', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'azucar-morada', 'Azúcar morada', 'decoracion', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'azucar-verde', 'Azúcar verde', 'decoracion', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'tajin', 'Tajín', 'decoracion', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'chamoy', 'Chamoy', 'decoracion', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'miel', 'Miel', 'decoracion', 'ml', 0, 0, 1000, 1000, 'unidad', 1000, 0, false),
    (r, 'aji', 'Ají', 'decoracion', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'ojos', 'Ojos de goma (decoración)', 'decoracion', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'palitos-decorar', 'Palitos para decorar', 'decoracion', 'und', 0, 0, 0, null, 'paquete', 1, 0, false),
    (r, 'azucar', 'Azúcar', 'basicos', 'und', 0, 0, 1, 1, 'bolsa', 1, 0, false),
    (r, 'azucar-bolsita', 'Azúcar en bolsita', 'basicos', 'und', 0, 0, 0, null, 'paquete', 1, 0, false),
    (r, 'sal', 'Sal', 'basicos', 'und', 0, 0, 1, 1, 'bolsa', 1, 0, false),
    (r, 'vasos-9oz', 'Vasos 9 oz', 'desechables', 'und', 0, 0, 12, 36, 'paquete', 1, 0, false),
    (r, 'vasos-16oz', 'Vasos 16 oz', 'desechables', 'und', 0, 0, 12, 36, 'paquete', 1, 0, false),
    (r, 'tapas', 'Tapas para vasos', 'desechables', 'und', 0, 0, 12, 36, 'paquete', 1, 0, false),
    (r, 'pitillos-bambu', 'Pitillos de bambú', 'desechables', 'und', 0, 0, 1, 2, 'paquete', 1, 0, false),
    (r, 'palitos-cafe', 'Palitos de café', 'desechables', 'und', 0, 0, 1, 1, 'paquete', 1, 0, false),
    (r, 'cucharitas', 'Cucharitas', 'desechables', 'und', 0, 0, 1, 1, 'paquete', 1, 0, false),
    (r, 'cucharas-negras', 'Cucharas negras', 'desechables', 'und', 0, 0, 1, 1, 'paquete', 1, 0, false),
    (r, 'potecitos-tartara', 'Potecitos de tártara', 'desechables', 'und', 0, 0, 1, 1, 'paquete', 1, 0, false),
    (r, 'portas-torta', 'Portas de torta negros', 'desechables', 'und', 0, 0, 1, 1, 'paquete', 1, 0, false),
    (r, 'bolsas-negras', 'Bolsas negras', 'desechables', 'und', 0, 0, 1, 1, 'paquete', 1, 0, false),
    (r, 'bolsas-carton', 'Bolsas de cartón', 'desechables', 'und', 0, 0, 1, 1, 'paquete', 1, 0, false),
    (r, 'servilletas', 'Servilletas', 'desechables', 'und', 0, 0, 1, 2, 'paquete', 1, 0, false),
    (r, 'servilletas-cocina', 'Servilletas de cocina', 'desechables', 'und', 0, 0, 1, 2, 'paquete', 1, 0, false),
    (r, 'desinfectante-bicarbonato', 'Desinfectante de bicarbonato', 'aseo', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'limpido', 'Límpido', 'aseo', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'jabon-polvo', 'Jabón en polvo', 'aseo', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'toallas-arruru', 'Toallas húmedas Arrurrú', 'aseo', 'und', 0, 0, 1, 1, 'paquete', 1, 0, false),
    (r, 'toallas-desinfectantes', 'Toallas húmedas desinfectantes', 'aseo', 'und', 0, 0, 1, 1, 'paquete', 1, 0, false),
    (r, 'desengrasante', 'Desengrasante', 'aseo', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'varsol', 'Varsol emulsionado', 'aseo', 'und', 0, 0, 0, null, 'unidad', 1, 0, false),
    (r, 'guantes', 'Guantes', 'aseo', 'und', 0, 0, 0, null, 'par', 1, 0, false),
    (r, 'bolsas-basura', 'Bolsas de basura', 'aseo', 'und', 0, 0, 1, 2, 'paquete', 1, 0, false),
    (r, 'esponjas', 'Esponjas de lavar loza', 'aseo', 'und', 0, 0, 1, 2, 'unidad', 1, 0, false),
    (r, 'jabon-loza-taza', 'Jabón de loza en taza', 'aseo', 'und', 0, 0, 1, 2, 'unidad', 1, 0, false),
    (r, 'jabon-loza-liquido', 'Jabón de loza líquido', 'aseo', 'und', 0, 0, 0, null, 'unidad', 1, 0, false),
    (r, 'veneno', 'Veneno (plagas)', 'aseo', 'und', 0, 0, 0, null, 'unidad', 1, 0, false),
    (r, 'toallas-limpiar', 'Toallas para limpiar', 'aseo', 'und', 0, 0, 1, 3, 'unidad', 1, 0, false),
    (r, 'limpiavidrios', 'Limpiavidrios', 'aseo', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'lapiceros', 'Lapiceros', 'papeleria', 'und', 0, 0, 1, 1, 'unidad', 1, 0, false),
    (r, 'papel-comandas', 'Papel para comandas', 'papeleria', 'und', 0, 0, 0, null, 'unidad', 1, 0, false),
    (r, 'claras-pasteurizadas', 'Claras de huevo pasteurizadas', 'lacteos', 'ml', 0, 0, 1000, 1000, 'unidad', 1000, 0, false),
    (r, 'crema-de-leche', 'Crema de leche', 'lacteos', 'ml', 0, 0, 1000, 1000, 'unidad', 1000, 0, false),
    (r, 'agua-trabajadores', 'Agua trabajadores', 'bebidas', 'und', 0, 0, 12, 36, 'unidad', 1, 0, false),
    (r, 'cerezas', 'Cerezas', 'decoracion', 'und', 0, 0, 1, 1, 'frasco', 1, 0, false),
    (r, 'chocolate-polvo', 'Chocolate en polvo', 'decoracion', 'und', 0, 0, 1, 1, 'paquete', 1, 0, false)
  on conflict (restaurant_id, clave) where clave is not null do nothing;

  -- Arepa mixta
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Arepa mixta' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('arepas-mixtas', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Arepa mixta'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Empanada de carne
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Empanada de carne' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('empanadas-carne', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Empanada de carne'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Empanada de pollo
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Empanada de pollo' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('empanadas-pollo', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Empanada de pollo'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Palito de bocadillo y queso
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Palito de bocadillo y queso' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('palitos-bocadillo', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Palito de bocadillo y queso'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Palito de queso
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Palito de queso' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('palitos-queso', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Palito de queso'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Agua grande
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Agua grande' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('agua-brisa', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Agua grande'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Águila
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Águila' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('aguila', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Águila'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Budweiser
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Budweiser' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('budweiser', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Budweiser'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Club Colombia Dorada
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Club Colombia Dorada' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('club-colombia', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Club Colombia Dorada'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Coca-Cola 400 ml
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Coca-Cola 400 ml' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('coca-cola-400', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Coca-Cola 400 ml'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Coca-Cola Zero 250 ml
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Coca-Cola Zero 250 ml' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('coca-cola-zero', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Coca-Cola Zero 250 ml'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Cola & Pola
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Cola & Pola' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('cola-pola', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Cola & Pola'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Coronita
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Coronita' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('coronita', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Coronita'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Costeñita
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Costeñita' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('costenita', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Costeñita'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Electrolit maracuyá
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Electrolit maracuyá' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('electrolit', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Electrolit maracuyá'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Gatorade
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Gatorade' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('gatorade', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Gatorade'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Ginger
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Ginger' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('ginger-ale', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Ginger'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Poker
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Poker' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('poker', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Poker'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Red's Rosé
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Red''s Rosé' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('reds-rose', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Red''s Rosé'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Soda Bretaña
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Soda Bretaña' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('bretana', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Soda Bretaña'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Stella Artois
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Stella Artois' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('stella', 1::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Stella Artois'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Blue Lagoon
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Blue Lagoon' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('zumo-limon', 22.5::numeric), ('sirope-blue-curacao', 30::numeric), ('vodka', 45::numeric), ('bretana', 0.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Blue Lagoon'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Cuba Libre
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Cuba Libre' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('zumo-limon', 15::numeric), ('vdc-tradicional', 60::numeric), ('coca-cola-250', 0.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Cuba Libre'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Daiquiri
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Daiquiri' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('sirope-simple', 22.5::numeric), ('zumo-limon', 30::numeric), ('ron-blanco', 60::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Daiquiri'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Dulce o Truco
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Dulce o Truco' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('vodka', 45::numeric), ('real-coco', 30::numeric), ('lychees', 15::numeric), ('zumo-limon', 15::numeric), ('sirope-simple', 7.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Dulce o Truco'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Gin Sour
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Gin Sour' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('sirope-simple', 22.5::numeric), ('zumo-limon', 30::numeric), ('bosque-de-indias', 60::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Gin Sour'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Mal de Ojo
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Mal de Ojo' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('lychees', 15::numeric), ('vodka', 45::numeric), ('zumo-limon', 22.5::numeric), ('sirope-blue-curacao', 22.5::numeric), ('sirope-granadina', 22.5::numeric), ('bretana', 0.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Mal de Ojo'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Mango Colado
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Mango Colado' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('malibu', 60::numeric), ('sirope-mango', 30::numeric), ('leche', 60::numeric), ('real-coco', 45::numeric), ('pulpa-maracuya', 0.25::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Mango Colado'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Margarita
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Margarita' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('sirope-simple', 15::numeric), ('zumo-limon', 30::numeric), ('triple-sec-convier', 30::numeric), ('jose-cuervo', 60::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Margarita'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Margarita Azul
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Margarita Azul' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('sirope-simple', 15::numeric), ('sirope-blue-curacao', 15::numeric), ('triple-sec-convier', 15::numeric), ('zumo-limon', 30::numeric), ('jose-cuervo', 60::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Margarita Azul'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Mojito
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Mojito' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('ron-blanco', 60::numeric), ('zumo-limon', 30::numeric), ('sirope-simple', 30::numeric), ('bretana', 0.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Mojito'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Moscow Mule Ginger Beer
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Moscow Mule Ginger Beer' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('zumo-limon', 22.5::numeric), ('vodka', 60::numeric), ('ginger-beer', 0.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Moscow Mule Ginger Beer'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Moscow Mule Social
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Moscow Mule Social' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('zumo-limon', 22.5::numeric), ('smirnoff-tamarindo', 60::numeric), ('ginger-ale', 0.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Moscow Mule Social'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Orgasmo
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Orgasmo' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('baileys', 30::numeric), ('licor-cafe', 30::numeric), ('red-label', 30::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Orgasmo'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Penicillin
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Penicillin' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('miel', 22.5::numeric), ('zumo-limon', 22.5::numeric), ('red-label', 60::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Penicillin'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Piña Colada
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Piña Colada' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('leche', 15::numeric), ('real-coco', 45::numeric), ('zumo-pina', 90::numeric), ('ron-blanco', 60::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Piña Colada'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Ramos Gin Fizz
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Ramos Gin Fizz' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('claras-pasteurizadas', 15::numeric), ('crema-de-leche', 30::numeric), ('sirope-simple', 22.5::numeric), ('zumo-limon', 30::numeric), ('bosque-de-indias', 60::numeric), ('bretana', 0.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Ramos Gin Fizz'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Social Drinks
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Social Drinks' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('zumo-limon', 15::numeric), ('leche', 15::numeric), ('jugo-mandarina', 45::numeric), ('real-coco', 30::numeric), ('jose-cuervo', 45::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Social Drinks'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Tequila Mandarin
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Tequila Mandarin' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('sirope-simple', 15::numeric), ('zumo-limon', 15::numeric), ('jugo-mandarina', 60::numeric), ('jose-cuervo', 60::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Tequila Mandarin'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Tequila Sunrise
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Tequila Sunrise' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('jugo-del-valle', 90::numeric), ('jose-cuervo', 60::numeric), ('sirope-granadina', 15::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Tequila Sunrise'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Tinto de Verano
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Tinto de Verano' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('sirope-simple', 15::numeric), ('zumo-limon', 15::numeric), ('vina-maipo', 120::numeric), ('bretana', 0.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Tinto de Verano'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Vodka Maracuyá
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Vodka Maracuyá' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('triple-sec-convier', 15::numeric), ('zumo-limon', 22.5::numeric), ('sirope-maracuya', 30::numeric), ('vodka', 60::numeric), ('bretana', 0.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Vodka Maracuyá'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Whiskey Sour
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Whiskey Sour' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('sirope-simple', 22.5::numeric), ('zumo-limon', 30::numeric), ('red-label', 60::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Whiskey Sour'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- White Russian
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'White Russian' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('licor-cafe', 30::numeric), ('vodka', 60::numeric), ('leche', 30::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'White Russian'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Zombie
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Zombie' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('jugo-del-valle', 30::numeric), ('zumo-pina', 30::numeric), ('sirope-simple', 15::numeric), ('zumo-limon', 30::numeric), ('triple-sec-convier', 15::numeric), ('vdc-tradicional', 30::numeric), ('ron-blanco', 30::numeric), ('sirope-granadina', 15::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Zombie'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Aguardiente Amarillo (botella)
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Aguardiente Amarillo (botella)' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('aguardiente-amarillo', 750::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Aguardiente Amarillo (botella)'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Aguardiente Azul (botella)
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Aguardiente Azul (botella)' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('antioqueno-tapa-azul', 750::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Aguardiente Azul (botella)'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Aguardiente Tapa Verde (botella)
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Aguardiente Tapa Verde (botella)' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('antioqueno-tapa-verde', 750::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Aguardiente Tapa Verde (botella)'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Black Label 1.000 ml (botella)
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Black Label 1.000 ml (botella)' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('black-label', 1000::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Black Label 1.000 ml (botella)'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Buchanan's Deluxe (botella)
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Buchanan''s Deluxe (botella)' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('buchanans-deluxe', 750::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Buchanan''s Deluxe (botella)'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Buchanan's Master (botella)
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Buchanan''s Master (botella)' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('buchanans-master', 750::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Buchanan''s Master (botella)'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Double Black (botella)
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Double Black (botella)' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('double-black', 750::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Double Black (botella)'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Ron Caldas (botella)
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Ron Caldas (botella)' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('vdc-tradicional', 750::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Ron Caldas (botella)'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Ron Caldas 8 años (botella)
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Ron Caldas 8 años (botella)' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('vdc-carta-oro', 750::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Ron Caldas 8 años (botella)'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Ron Caldas garrafa (botella)
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Ron Caldas garrafa (botella)' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('vdc-tradicional-grande', 1750::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Ron Caldas garrafa (botella)'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Copa de vino
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Copa de vino' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('vina-maipo', 150::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Copa de vino'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Shot de Black Label
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Shot de Black Label' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('black-label', 57::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Shot de Black Label'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Shot de Buchanan's
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Shot de Buchanan''s' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('buchanans-deluxe', 57::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Shot de Buchanan''s'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Shot de Double Black
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Shot de Double Black' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('double-black', 57::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Shot de Double Black'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Shot de Ginebra
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Shot de Ginebra' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('bosque-de-indias', 57::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Shot de Ginebra'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Shot de Old Parr
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Shot de Old Parr' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('old-parr', 57::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Shot de Old Parr'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Shot de Ron Caldas
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Shot de Ron Caldas' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('vdc-tradicional', 57::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Shot de Ron Caldas'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Shot de Ron Caldas 8 años
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Shot de Ron Caldas 8 años' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('vdc-carta-oro', 57::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Shot de Ron Caldas 8 años'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Shot de Vodka
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Shot de Vodka' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('vodka', 57::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Shot de Vodka'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Batido Alegría
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Batido Alegría' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('pulpa-mango', 0.5::numeric), ('pulpa-maracuya', 0.5::numeric), ('zumo-pina', 90::numeric), ('zumo-limon', 15::numeric), ('sirope-simple', 15::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Batido Alegría'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Batido de guanábana
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Batido de guanábana' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('pulpa-guanabana', 1::numeric), ('sirope-simple', 60::numeric), ('zumo-limon', 22.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Batido de guanábana'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Batido de maracuyá
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Batido de maracuyá' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('pulpa-maracuya', 1::numeric), ('sirope-simple', 60::numeric), ('zumo-limon', 22.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Batido de maracuyá'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Batido Lemon Pink
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Batido Lemon Pink' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('kanaloa-sandia', 52.5::numeric), ('zumo-limon', 30::numeric), ('kola-romana', 75::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Batido Lemon Pink'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Soda de frutos rojos
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Soda de frutos rojos' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('frutos-rojos', 60::numeric), ('zumo-limon', 22.5::numeric), ('sirope-simple', 15::numeric), ('bretana', 0.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Soda de frutos rojos'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Soda de kiwi
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Soda de kiwi' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('kiwi-licuado', 60::numeric), ('zumo-limon', 22.5::numeric), ('sirope-simple', 15::numeric), ('bretana', 0.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Soda de kiwi'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

  -- Soda de Sandía y Liches
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = 'Soda de Sandía y Liches' and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ('kanaloa-sandia', 60::numeric), ('lychees', 30::numeric), ('zumo-limon', 30::numeric), ('bretana', 0.5::numeric)) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = 'Soda de Sandía y Liches'
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);

end
$import$;

-- Supuestos (confirmar y corregir en Admin › Inventario si no cuadran):
--   · Buchanan's Deluxe: botella de 750 ml
--   · Buchanan's Master: botella de 750 ml
--   · Johnnie Walker Double Black: botella de 750 ml
--   · Johnnie Walker Red Label: botella de 750 ml
--   · Old Parr: botella de 750 ml
--   · Ron blanco: botella de 750 ml
--   · Ginebra Bosque de Indias: botella de 750 ml
--   · Malibú: botella de 750 ml
--   · Absolut Vodka: botella de 750 ml
--   · Vodka Smirnoff Spicy Tamarindo: botella de 750 ml
--   · José Cuervo: botella de 750 ml
--   · Baileys: botella de 750 ml
--   · Campari: botella de 750 ml
--   · Triple Sec Convier: botella de 750 ml
--   · Licor de café: botella de 750 ml
--   · Vino Viña Maipo: botella de 750 ml
--   · Jugo Del Valle (naranja): unidad de 1000 ml
--   · Jugo de mandarina: unidad de 1000 ml
--   · Sirope de maracuyá: botella de 750 ml
--   · Sirope de mango: botella de 750 ml
--   · Sirope Blue Curaçao: botella de 750 ml
--   · Sirope de granadina: botella de 750 ml
--   · Kanaloa Sandía: botella de 750 ml
--   · Real Coco (crema de coco): unidad de 1000 ml
--   · Frutos rojos machacados (casero): frasco de 500 ml
--   · Sirope simple (casero): botella de 750 ml
--   · Kiwi licuado (casero): frasco de 500 ml
--   · Zumo de piña (casero): frasco de 500 ml
--   · Lychees: lata de 400 ml
--   · Miel: unidad de 1000 ml
--   · Claras de huevo pasteurizadas: unidad de 1000 ml
--   · Crema de leche: unidad de 1000 ml
--   · "top" de Bretaña = ½ unidad
--   · "top" de Ginger (ginger ale) = ½ unidad
--   · "top" de Ginger beer = ½ unidad
--   · "top" de Coca-Cola 250 ml = ½ unidad
--   · "y 3" de Zumo de limón 250 ml = 0.75 oz
--   · "y 2" de Sirope simple (casero) = 0.5 oz
--   · Copa de vino = 150 ml de Viña Maipo
--   · Shot = 57 ml (1,9 oz)
-- Ingredientes que no se descuentan (sin medida exacta): Campari (3 gotas); Sal (pizca); Hielo (1 pala); Hierbabuena (8 hojas); Azúcar (1 cucharadita); Hielo (1½ pala); Liche picado (1 al fondo); Infusión de frutos rojos (1 bolsita); Infusión de té verde (1 bolsita)
-- Productos del POS sin receta (no descuentan inventario): Afogato; Americano; Capuchino; Expreso; Frapuchino; Latte; Milo caliente; Milo frío; Mocca; Agua pequeña; Michelada; Smirnoff Ice; Soda Social; Tres Cordilleras Rosada; Zumo de limón; Social Cream de M&M's; Social Cream de Oro; Torta del día; Vaso de helado
