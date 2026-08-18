-- La lista completa de entes de control y autoridades del censo, y un hallazgo que no requiere pedir
-- permiso a nadie.
--
-- `P1-4` deja de ser «hay que escribir una carta»: la carta ya está escrita, en
-- `docs/38-entes-de-control.md`. Lo que queda es que un Maintainer la envíe y anote la respuesta, así
-- que el ticket pasa a `en_revision` — no está hecho, pero tampoco está sin empezar, y dejarlo en
-- `libre` haría que alguien volviera a escribirla desde cero.
UPDATE project_tasks SET
  status = 'en_revision',
  summary = coalesce(summary || ' ', '')
    || '**El borrador está listo (18/08)** en `docs/38-entes-de-control.md`, con los canales de la '
    || 'UNGRD verificados el mismo día. Lo que falta es enviarlo y anotar la respuesta. La solicitud '
    || 'cita el conjunto abierto de la propia UNGRD y arranca diciendo que NO pedimos datos '
    || 'personales, que es lo que le quita a la entidad el mayor motivo para negarse.',
  updated_at = now()
WHERE code = 'P1-4';

-- Y un ticket nuevo por lo encontrado en el Humanitarian Data Exchange.
--
-- **Es dato de esta emergencia, con licencia abierta, y nadie lo ha mirado.** Microsoft AI for Good
-- Lab corrió su modelo de daño sobre imagen satelital de Cali (Airbus, 8-10/08) y de Pereira
-- (Vantor, 12/08): 621 y 613 edificaciones señaladas como dañadas. HOT OSM publica edificaciones y
-- vías cartografiadas por la respuesta humanitaria, **actualizadas el 18/08**.
--
-- Va como ticket y no lo ingiero de una porque hay una decisión que no es técnica: **una predicción
-- de un modelo sobre una foto de satélite no es una edificación evaluada.** Es el mismo tipo de dato
-- que la intensidad del USGS —dice dónde ir a mirar, no qué pasó— y si entra dibujado como daño
-- confirmado, el mapa afirma algo que nadie verificó. Con 863 daños de fuentes ciudadanas ya en el
-- mapa, sumar 1.234 predicciones sin distinguirlas duplicaría la capa y borraría la diferencia.
INSERT INTO project_tasks (
  id, code, title, summary, acceptance, priority, size, roles, horizon, status,
  depends_on, sort_order, created_at, updated_at, technical
)
SELECT gen_random_uuid(), 'P1-5',
  'Conectar la evaluación de daño por satélite del HDX',
  'En el Humanitarian Data Exchange hay tres conjuntos de esta emergencia con licencia abierta que '
  || 'nadie ha mirado: Microsoft AI for Good Lab con evaluación de daño por IA sobre imagen '
  || 'satelital de Cali (621 edificaciones señaladas, CC BY) y de Pereira (613, CC BY), y HOT OSM '
  || 'con edificaciones y vías cartografiadas por la respuesta humanitaria (ODbL, actualizado el '
  || '18/08). Es la primera evaluación de daño de esta emergencia que no depende de que alguien '
  || 'reporte.',
  'Las edificaciones señaladas por el modelo se ven en el mapa **distinguibles de un daño reportado '
  || 'por una persona**, con la fecha de la imagen y el modelo a la vista. Un equipo que mire el '
  || 'mapa puede decir cuál de los dos está viendo sin abrir el detalle.',
  'P1', 'M', ARRAY['datos', 'gis'], 'urgente', 'libre',
  ARRAY[]::text[], 41, now(), now(),
  '**La decisión antes del código.** Una predicción de un modelo sobre una foto de satélite no es '
  || 'una edificación evaluada. Hoy hay 863 daños en el mapa reportados por fuentes ciudadanas; '
  || 'sumar 1.234 predicciones sin distinguirlas duplica la capa y borra la diferencia entre '
  || '«alguien vio esto» y «un modelo lo señaló».' || chr(10) || chr(10)
  || 'La salida más probable es un valor propio de precisión o de origen, como se hizo con '
  || '`geocoded` en `public_location_precision`: el dato entra, y entra diciendo de dónde viene. '
  || 'Ver `038_geocoded_addresses.sql` para el precedente.' || chr(10) || chr(10)
  || '**Lo que hay que mirar antes de ingerir:** los geopackage pesan entre 10 y 77 MB e incluyen '
  || 'TODAS las huellas de edificación, no solo las dañadas. Hay que filtrar a las señaladas antes '
  || 'de escribir nada — 621 y 613 puntos, no 400.000.' || chr(10) || chr(10)
  || '**Y una limitación que conviene ver antes de emocionarse:** los dos conjuntos de Microsoft '
  || 'cubren Cali y Pereira, las dos ciudades donde ya tenemos más densidad. **Ninguno cubre los 44 '
  || 'municipios en silencio del Chocó.** Suma verificación cruzada, no cobertura nueva.' || chr(10)
  || chr(10)
  || '**Atribución obligatoria:** CC BY para los de Microsoft, ODbL para HOT OSM. La licencia se '
  || 'respeta o no se usa el dato.'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE code = 'P1-5');

INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P1', 'Ruta institucional para el censo', 'parcial',
  'Los interlocutores están mapeados en `docs/38-entes-de-control.md` (18/08): UNGRD, Defensoría, '
  || 'Procuraduría, Contraloría, DANE, los CDGRD de los cinco departamentos, CMGRD y alcaldías, '
  || 'personerías, organismos de socorro, MinVivienda y Prosperidad Social, más el sistema '
  || 'humanitario internacional. Canales de UNGRD y Defensoría verificados; el resto marcado como '
  || 'sin verificar a propósito. **Ninguna conversación abierta todavía** — eso es lo que falta, y '
  || 'no lo puede hacer un desarrollador.',
  'P1-4', now()
WHERE NOT EXISTS (
  SELECT 1 FROM project_capabilities
  WHERE priority = 'P1' AND name = 'Ruta institucional para el censo'
);
