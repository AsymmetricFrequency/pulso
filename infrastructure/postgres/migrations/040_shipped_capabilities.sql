-- Lo que se construyó el 16 y 17 de agosto y el tablero todavía no reflejaba.
--
-- El inventario de capacidades vale exactamente lo que valga su honestidad: si dice «falta» algo
-- que ya está, la gente duplica trabajo; si dice «listo» algo que no, alguien cuenta con ello. Esta
-- migración lo pone al día en las dos direcciones — también marca lo que **empeoró** al mirarlo de
-- cerca.

INSERT INTO project_capabilities (id, priority, name, status, note, task_code, sort_order) VALUES

  -- Fuentes y datos --------------------------------------------------------------------------
  (gen_random_uuid(), 'PL', 'Registro nacional de daños ingerido', 'listo',
   '1.089 puntos de mapadelterremoto.com en 351 municipios: 97 colapsos, escuelas, hospitales, patrimonio y vías. Fichero público con ETag; la mayoría de las corridas devuelve 304 y cero bytes.', NULL, 200),

  (gen_random_uuid(), 'P2', 'Acopios y bancos de sangre fuera de Cali y Pereira', 'listo',
   '79 puntos de cuidarcolombia en Bogotá, Medellín, Cartagena, Barranquilla, Cúcuta y otras 8 ciudades. Solo entran los bancos de sangre que siguen recibiendo.', NULL, 60),

  (gen_random_uuid(), 'PL', 'Geocodificar una dirección escrita, con la precisión anotada', 'listo',
   'Valida contra el polígono DANE del municipio declarado, nunca afirma más precisión que «calle», y un CHECK impide geocodificar un rescate o un colapso. El mapa lo dibuja con círculo de precisión.', NULL, 210),

  (gen_random_uuid(), 'PL', 'Alcance en buscadores y asistentes', 'listo',
   'robots.txt, sitemap.xml, JSON-LD (SpecialAnnouncement, Event, Dataset) y llms.txt. El título ya nombra el terremoto: antes era «PULSO» y no contenía una palabra que alguien fuera a buscar.', NULL, 220),

  -- Lo que se descubrió roto al mirarlo ------------------------------------------------------
  (gen_random_uuid(), 'PL', 'Que un dato malo no tumbe la lista pública', 'listo',
   'La ruta validaba el lote entero: una necesidad con un texto largo de más dejó sin lista a las 2.300 buenas. Ahora cada fila se valida sola y las descartadas se cuentan en «unavailable» en vez de desaparecer.', NULL, 230),

  (gen_random_uuid(), 'P2', 'Que una necesidad diga qué se necesita', 'listo',
   '677 necesidades mostraban una dirección donde debía ir el pedido, y contemos descartaba 166 por una categoría válida que faltaba en el mapa. Quedan 33 casos que escribió así quien reportó.', NULL, 70),

  -- Privacidad -------------------------------------------------------------------------------
  (gen_random_uuid(), 'PL', 'Ningún teléfono ni nombre de tercero en el mapa', 'listo',
   'Disparador en la base que tapa teléfonos en cualquier ingesta (30 tapados solo en mapadelterremoto), y filtro que descarta la dirección cuando identifica a la familia cuya casa cayó.', NULL, 240)

ON CONFLICT (priority, name) DO UPDATE SET
  status = EXCLUDED.status, note = EXCLUDED.note, sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Y lo que empeoró al medirlo. `Acopios oficiales fuera de Cali y Pereira` seguía en «falta»
-- diciendo que Bogotá los publicaba. No los publica: se comprobó contra su API. Que una capacidad
-- pase de «casi resuelta» a «no existe la fuente» también es información, y esconderla haría que
-- alguien la tomara esperando encontrar algo.
UPDATE project_capabilities SET
  note = 'Bogotá NO los publica: verificado contra su API CKAN. cuidarcolombia cubre 12 ciudades por geocodificación, pero sigue sin haber una fuente oficial. Hay que preguntar ciudad por ciudad.',
  updated_at = now()
WHERE priority = 'PL' AND name = 'Acopios oficiales fuera de Cali y Pereira';
