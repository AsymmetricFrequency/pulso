-- Vías bloqueadas y aeropuertos cerrados: el dato que teníamos y estábamos botando.
--
-- Sale de auditar el rendimiento real de cada importador contra su fuente. Gravitas publica 14
-- puntos de categoría `logistica` —cierres de vía por derrumbe, aeropuertos sin operación— con
-- `address_text: null` y coordenadas a nivel de ciudad: cero datos personales. El importador los
-- descarta porque `IMPORTABLE_CATEGORIES` solo admite `centro_acopio`.
--
-- No se arregló de una vez a propósito. `report_type` solo admite 'rescate' | 'pmu' | 'necesidad',
-- y meter una vía cerrada como 'pmu' le diría a un coordinador que hay un puesto de mando en el
-- aeropuerto de Buenaventura. Es falso, y en coordinación de rescate una etiqueta falsa cuesta más
-- que un dato ausente. Necesita su propio tipo, y eso es una migración, no un parche.

INSERT INTO project_tasks
  (id, code, title, summary, acceptance, technical, priority, size, roles, horizon, depends_on, sort_order)
VALUES

  (gen_random_uuid(), 'P0-10', 'Vías bloqueadas y aeropuertos cerrados en el mapa',
   'Un equipo de rescate necesita saber por dónde puede llegar antes de saber a dónde va. Hoy Gravitas nos da 14 cierres —derrumbes sobre la calzada, aeropuertos sin operación en Cali, Buenaventura, Cartago, Quibdó, Armenia, Manizales, Pereira, Bogotá, Ibagué— y los descartamos en la ingesta por no tener dónde ponerlos.',
   'Un cierre de vía se ve en el mapa con su propio símbolo, distinto de un acopio y de un PMU, y dice desde cuándo está cerrado. Las 14 fichas de Gravitas entran sin quedar etiquetadas como otra cosa.',
   E'**Por qué no es de una línea**\n'
   'La tentación es añadir `logistica` a `IMPORTABLE_CATEGORIES` en `apps/worker/src/gravitas.ts` y '
   'listo. No lo hagas: `mapGravitasFeature` fija `reportType: "pmu"`, así que una vía cerrada '
   'entraría al mapa como Puesto de Mando Unificado. Un coordinador leería que hay mando en el '
   'aeropuerto de Buenaventura. Es peor que no tener el dato.\n\n'
   '**Qué hay que tocar**\n'
   '1. Migración: ampliar el CHECK de `community_reports.report_type` con `via`. Mira cómo lo hizo '
   '`024_rescue_reports.sql` con `rescate` —hay que soltar la restricción y recrearla.\n'
   '2. `packages/schemas/src/community-report.ts`: el tipo nuevo en los esquemas público y de '
   'operaciones. Es un paquete **compilado**: `pnpm --filter @pulso/schemas build` antes de que los '
   'consumidores lo vean.\n'
   '3. `apps/worker/src/gravitas.ts`: admitir `logistica` y derivar el tipo de la categoría en vez '
   'de fijarlo. `category_fields.tipo` trae `ruta_bloqueada`; `detalle` trae si el cierre es total '
   'y si hay hora estimada de reapertura.\n'
   '4. `atlas-map.tsx` y `leaflet-map.tsx`: símbolo propio y entrada en la leyenda. Un cierre no es '
   'un punto de ayuda; que no se parezcan.\n\n'
   '**Lo que NO se importa**\n'
   'Las otras dos categorías de Gravitas siguen fuera y por una razón que no cambia con este '
   'ticket: `persona_disponible` trae domicilios de voluntarios y `edificio` puede señalar la casa '
   'de alguien. Ver el comentario en `gravitas.ts` antes de tocar ese Set.\n\n'
   '**Cómo se comprueba**\n'
   'Las 14 fichas son verificables contra medios: los cierres citan El Tiempo y Univisión en su '
   'propio campo `description`. Si el mapa muestra una vía abierta que la prensa da por cerrada, '
   'el error es nuestro.',
   'P0', 'M', ARRAY['backend','frontend','data'], 'urgente', '{}', 95)

ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, acceptance = EXCLUDED.acceptance,
  technical = EXCLUDED.technical, priority = EXCLUDED.priority, size = EXCLUDED.size,
  roles = EXCLUDED.roles, horizon = EXCLUDED.horizon, sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Corrección de PL-12. Se creó ayer afirmando que Bogotá publicaba acopios oficiales con horario
-- y qué falta en cada uno. Al ir a construirlo, el catálogo CKAN del portal dice otra cosa: cero
-- resultados para «acopio», «terremoto» y «sismo» referidos a esta emergencia, y de los 90
-- conjuntos actualizados desde el 1 de agosto ninguno la menciona. Lo más cercano —la Bitácora de
-- Emergencias del IDIGER— llega hasta el 31/12/2025 y está bajo CC-BY-NC, que además nos obligaría
-- a marcar esos puntos como no reutilizables comercialmente mientras el resto del mapa no lo está.
--
-- El ticket no se borra: se convierte en lo que de verdad falta averiguar. Que la única candidata
-- «lista para conectar» resultara no existir es el argumento más fuerte para P0-9 y PL-13 — pedir
-- y acordar, en vez de esperar que aparezca un portal con lo que necesitamos.
UPDATE project_tasks SET
  title = 'Buscar la fuente oficial de acopios fuera de Cali y Pereira',
  summary = 'Se creó suponiendo que el portal de datos abiertos de Bogotá publicaba los acopios de esta emergencia. Se comprobó contra su API CKAN y no existe: ni «acopio» ni «sismo» devuelven nada del terremoto, y de los 90 conjuntos actualizados desde el 1 de agosto ninguno lo menciona. Fuera de Cali y Pereira seguimos sin acopios oficiales, y ahora sabemos que no van a llegar solos.',
  acceptance = 'Existe una respuesta verificable por ciudad —Bogotá, Medellín, Manizales, Armenia, Ibagué— diciendo dónde publica sus acopios o que no los publica. Un «no publican» anotado vale tanto como un enlace: cierra la búsqueda para el siguiente.',
  technical = E'**Lo que ya se descartó, para no repetirlo**\n'
   '`datosabiertos.bogota.gov.co` tiene API CKAN abierta: '
   '`/api/3/action/package_search?q=<termino>`. Consultado el 16/08/2026 con «acopio», «sismo», '
   '«terremoto», «albergue», «donacion» y «humanitaria»: nada de esta emergencia. La Bitácora de '
   'Emergencias del IDIGER llega hasta 31/12/2025 y es CC-BY-NC.\n\n'
   '**Ojo con la licencia**\n'
   'CC-BY-NC no es «datos abiertos» para nuestros efectos: obligaría a marcar esos puntos como no '
   'reutilizables comercialmente mientras el resto del mapa no lo está. Antes de ingerir cualquier '
   'portal, lee el campo `license_id`, no el nombre del portal.\n\n'
   '**Dónde seguir**\n'
   '`datos.gov.co` (Socrata) permite el mismo tipo de búsqueda por catálogo. Y las alcaldías suelen '
   'publicar el acopio en su sala de prensa antes que en su portal de datos: eso no se raspa, se '
   'pide. Ver `docs/35-alianzas.md`.',
  size = 'S',
  roles = ARRAY['data','contributor'],
  horizon = 'media',
  updated_at = now()
WHERE code = 'PL-12';

UPDATE project_capabilities SET
  note = 'Bogotá no los publica: se verificó contra su API CKAN el 16/08/2026. Fuera de Cali y Pereira no hay fuente oficial conocida, y hay que preguntar ciudad por ciudad.',
  updated_at = now()
WHERE priority = 'PL' AND name = 'Acopios oficiales fuera de Cali y Pereira';

INSERT INTO project_capabilities (id, priority, name, status, note, task_code, sort_order) VALUES
  (gen_random_uuid(), 'P0', 'Estado de las vías de acceso', 'falta',
   'Gravitas publica 14 cierres de vía y aeropuertos sin operación, sin datos personales. La ingesta los descarta porque no existe un tipo de reporte donde quepan.', 'P0-10', 115)
ON CONFLICT (priority, name) DO UPDATE SET
  status = EXCLUDED.status, note = EXCLUDED.note, task_code = EXCLUDED.task_code,
  sort_order = EXCLUDED.sort_order, updated_at = now();
