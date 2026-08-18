-- Tickets del rastreo de fuentes nuevas del 16 de agosto.
--
-- Salen de una constatación incómoda: de las cinco plataformas candidatas, **solo una publica datos
-- abiertos con licencia de reutilización**. Las demás exigirían deducir su API interna, que es lo
-- mismo que rodear el 403 de Cali. Por eso hay un ticket de código y dos de conversación — y el de
-- conversación vale más, porque un acuerdo sobrevive a que cambien su frontend y un scraper no.

INSERT INTO project_tasks
  (id, code, title, summary, acceptance, technical, priority, size, roles, horizon, depends_on, sort_order)
VALUES

  (gen_random_uuid(), 'P0-9', 'Pedir los datos de mapadelterremoto.com',
   'Tienen 3.110 puntos en 363 municipios, incluidos 66 edificios colapsados —donde puede haber gente debajo— y 2.838 escuelas afectadas. Cubren todo el país frente a nuestro foco en Cali. Es el dato que más nos falta y no se saca con un scraper: no tienen API pública y deducir la interna es lo mismo que rodear el 403 de Cali.',
   'Existe una respuesta suya, sea cual sea. Si es que sí, hay un formato acordado y una primera importación. Si es que no, queda anotado en docs/35-alianzas.md para no volver a intentarlo por el mismo camino.',
   E'**No requiere código todavía.**\n\n'
   '**Qué llevar a la conversación**\n'
   'Un enlace que ya funcione (pulso.my/auditoria sirve), la petición concreta —el volcado de puntos '
   'de daño con su procedencia— y qué damos a cambio: procedencia por dato, código Apache-2.0, y una '
   'regla de privacidad que cumplimos incluso cuando cuesta.\n\n'
   '**Qué NO hacer**\n'
   'Leer sus chunks de JavaScript para encontrar el endpoint interno. Funcionaría el martes y se '
   'rompería el miércoles, y quema una relación que vale más que los datos de esta semana.\n\n'
   '**Dato util**\n'
   'Dicen en su propio sitio que publicaran en formato abierto tras el 30/11/2026. Ya hay voluntad; '
   'lo que se pide es adelantarlo mientras la emergencia esta viva.',
   'P0', 'S', ARRAY['contributor'], 'extrema', '{}', 90),

  (gen_random_uuid(), 'PL-12', 'Ingerir los acopios oficiales de Bogotá (IDECA)',
   'La única candidata del rastreo que se puede conectar hoy sin pedir permiso: portal oficial de datos abiertos con licencia de reutilización. Trae centros de acopio con qué falta en cada uno y su horario, que es justo lo que hoy no tenemos fuera de Cali y Pereira.',
   'Los acopios de Bogotá aparecen en el mapa con su procedencia, y la corrida queda registrada en source_ingestion_runs como cualquier otra fuente.',
   E'**Dónde**\n'
   '`apps/worker/src/ideca-bogota.ts` y entrada `ingest:ideca` en el package.json del worker.\n\n'
   '**Primer paso, antes de escribir nada**\n'
   'Localizar el conjunto exacto en datosabiertos.bogota.gov.co. El portal lo administra IDECA '
   '(Catastro Distrital) y expone servicios ArcGIS; el mapa publico vive en Mapas Bogota. Anota la '
   'URL del servicio en `external_sources.source_url`.\n\n'
   '**Qué reusar**\n'
   'La forma de `redcaliayuda-acopio.ts`, que ya modela un acopio con horario. Y '
   '`ingestion-run-log.ts` para registrar la corrida, tambien cuando falle.\n\n'
   '**external_key estable**\n'
   'El identificador del propio conjunto, no un hash del contenido: si cambian el horario, tiene que '
   'actualizar la ficha en vez de crear una nueva.\n\n'
   '**No olvides**\n'
   'Añadir la fuente a `externalSourceLabels` en `community-report-form.tsx`. Sin eso sus puntos '
   'salen en el mapa sin decir de donde vienen.',
   'PL', 'M', ARRAY['data'], 'urgente', '{}', 200),

  (gen_random_uuid(), 'PL-13', 'Acordar un formato común con las plataformas ciudadanas',
   'Siete plataformas están mapeando la misma emergencia y ninguna comparte formato, así que cada una reingiere a las demás con un raspador propio que se rompe cuando alguien cambia su frontend. Un formato mínimo de intercambio —punto, tipo, procedencia, fecha— le ahorra ese trabajo a todas y hace a Pulso el conector en vez de la octava plataforma.',
   'Existe un documento de formato publicado y al menos otra plataforma dice que lo adopta o lo comenta. No hace falta que lo adopten todas para que valga.',
   E'**Empieza por lo que ya tenemos**\n'
   '`publicCommunityReportSchema` ya es casi ese formato: punto, tipo, categoría, estado, '
   'procedencia y fecha. Publicarlo como especificación cuesta poco.\n\n'
   '**Con quién hablar primero**\n'
   'cuidarcolombia.vercel.app: ya declara que no publica datos personales, así que comparte la '
   'postura que hace difícil el acuerdo con otros.\n\n'
   '**El limite del formato**\n'
   'No incluye datos de contacto de terceros. Si el formato los llevara, adoptarlo obligaria a cada '
   'plataforma a republicar datos personales — y seria un formato que Pulso no podria usar.',
   'PL', 'M', ARRAY['data','backend'], 'media', '{}', 210)

ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, acceptance = EXCLUDED.acceptance,
  technical = EXCLUDED.technical, priority = EXCLUDED.priority, size = EXCLUDED.size,
  roles = EXCLUDED.roles, horizon = EXCLUDED.horizon, sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO project_capabilities (id, priority, name, status, note, task_code, sort_order) VALUES
  (gen_random_uuid(), 'P0', 'Daños estructurales fuera de Cali', 'falta',
   'mapadelterremoto.com tiene 66 edificios colapsados en 363 municipios. Nosotros, ninguno fuera de lo reportado por ciudadanos.', 'P0-9', 110),
  (gen_random_uuid(), 'PL', 'Acopios oficiales fuera de Cali y Pereira', 'falta',
   'Bogotá publica los suyos en datos abiertos con licencia. Es la única candidata conectable hoy sin pedir permiso.', 'PL-12', 130),
  (gen_random_uuid(), 'PL', 'Formato común con las otras plataformas', 'falta',
   'Siete plataformas mapean lo mismo sin formato compartido. Es lo que haría de Pulso el conector y no la octava.', 'PL-13', 140)
ON CONFLICT (priority, name) DO UPDATE SET
  status = EXCLUDED.status, note = EXCLUDED.note, task_code = EXCLUDED.task_code,
  sort_order = EXCLUDED.sort_order, updated_at = now();
