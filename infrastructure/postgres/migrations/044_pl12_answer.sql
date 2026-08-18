-- `PL-12` respondido: ninguna ciudad publica sus acopios como dato abierto.
--
-- El ticket pedía «una respuesta verificable por ciudad, diciendo dónde publica sus acopios o que
-- no los publica». La respuesta es que no los publica **ninguna**, y hay que dejarla escrita para
-- que nadie vuelva a gastar una tarde buscando lo que no existe.
--
-- Verificado el 18/08:
--
-- · **datos.gov.co** (catálogo nacional, Socrata): nada de esta emergencia. Buscado por «acopio»,
--   «donacion», «sismo», «ayuda humanitaria» y «albergue».
-- · **Bogotá**: es la única que publica algo, y lo publica como **mapa**, no como dato. La página
--   de la alcaldía remite a Mapas Bogotá / IDECA sin enlazar ningún conjunto ni API. El catálogo
--   ArcGIS público de IDECA sí es consultable y su carpeta `emergencias` tiene amenaza por
--   movimientos en masa, respuesta sísmica y estaciones de bomberos — **ninguna capa de acopios**.
--   Su portal CKAN tampoco (comprobado el 16/08).
-- · **Medellín, Manizales, Armenia, Ibagué**: no tienen portal de datos abiertos propio. Ninguno de
--   los dominios previsibles responde, y en el catálogo nacional no hay nada suyo.
--
-- **Y un dato que importa más que la respuesta:** Bogotá cerró seis puntos de acopio el 17 de
-- agosto. Los acopios abren y cierran en días, así que una fuente oficial que se publicara una vez
-- y no se mantuviera sería peor que no tenerla. Es la misma razón por la que retiramos los puntos
-- que su fuente deja de publicar.
UPDATE project_tasks SET
  status = 'hecho',
  summary = 'RESPONDIDO el 18/08: **ninguna ciudad publica sus acopios como dato abierto**. '
    || 'datos.gov.co no tiene nada de esta emergencia (5 términos buscados). Bogotá es la única que '
    || 'publica algo y lo hace como mapa, no como dato: remite a Mapas Bogotá / IDECA sin enlazar '
    || 'conjunto ni API, y el catálogo ArcGIS de IDECA no tiene capa de acopios. Medellín, '
    || 'Manizales, Armenia e Ibagué no tienen portal propio. El detalle está en docs/37-fuentes.md.',
  updated_at = now()
WHERE code = 'PL-12';

UPDATE project_capabilities SET
  note = 'Ninguna ciudad los publica como dato abierto — verificado ciudad por ciudad el 18/08. '
    || 'Los 79 que tenemos fuera de Cali y Pereira vienen de cuidarcolombia por geocodificación. '
    || 'La vía que queda es pedirlos, no buscarlos.',
  updated_at = now()
WHERE priority = 'PL' AND name = 'Acopios oficiales fuera de Cali y Pereira';
