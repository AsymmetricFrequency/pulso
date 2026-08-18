-- El censo entra al tablero con la parte que ya está y la que falta, separadas.
--
-- `P1-1` sigue tomado y sin avance: lo dejo como está y no lo toco. Lo que se hizo hoy **no es**
-- `P1-1` —no hay expediente de nadie, ni ruta que lo cree— y meterlo ahí haría creer que el censo
-- avanzó cuando lo que avanzó es saber dónde falta.
INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P1', 'Dónde falta censar', 'listo',
  'Publicado el 18/08 en pulso.my/#censo y en /v1/public/incidents/colombia-2026/census-coverage. '
  || 'Cruza sacudida del USGS (680 municipios con lectura), señal ciudadana y estado declarado del '
  || 'censo. Resultado: **44 municipios con sacudida fuerte a severa, cero reportes y cero censo '
  || 'reportado** —casi todos en Chocó— y 223 con señal de gente afectada y sin censo. Sin un solo '
  || 'dato personal: responde dónde no ha ido nadie, no quién vive ahí.',
  NULL, now()
WHERE NOT EXISTS (
  SELECT 1 FROM project_capabilities WHERE priority = 'P1' AND name = 'Dónde falta censar'
);

-- Y la parte que no se puede hacer sola. Va como capacidad en `falta` y no como ticket porque no es
-- trabajo de programación: es una conversación con una entidad, y ponerla en la cola de tickets la
-- dejaría esperando a que un desarrollador la tome.
INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P1', 'Cifras oficiales de censo por municipio', 'falta',
  'La tabla está lista para recibirlas y usa el vocabulario de la UNGRD (DIVIPOLA, personas/'
  || 'familias reportadas contra rud_personas/rud_familias inscritas). Lo que falta es la fuente: '
  || 'el conjunto abierto de la UNGRD en datos.gov.co llega hasta 2024 y no cubre esta emergencia, '
  || 'y el balance diario se publica como noticia, no como dato. Hay que pedirlo. Mientras no '
  || 'llegue, cada municipio queda en «sin dato», que es la verdad y no un hueco.',
  NULL, now()
WHERE NOT EXISTS (
  SELECT 1 FROM project_capabilities
  WHERE priority = 'P1' AND name = 'Cifras oficiales de censo por municipio'
);

-- Un ticket nuevo, y deliberadamente no de programación.
--
-- Es el que desbloquea todo lo demás del censo, y lo puede hacer alguien que no escriba código:
-- pedirle a la UNGRD el consolidado por municipio en formato consultable. El argumento ya está
-- construido —la tabla existe, usa sus nombres y su DIVIPOLA— así que la petición no es «danos
-- datos», es «esto que ya publican en PDF, ¿lo pueden publicar en CSV?».
INSERT INTO project_tasks (
  id, code, title, summary, acceptance, priority, size, roles, horizon, status,
  depends_on, sort_order, created_at, updated_at, technical
)
SELECT gen_random_uuid(), 'P1-4',
  'Pedir a la UNGRD el consolidado de damnificados por municipio',
  'La Defensoría dijo el 13/08 que la falta de censo impide saber cuántos son. La UNGRD publica el '
  || 'balance diario como noticia —185.016 personas y 54.382 familias al 16/08— pero no por '
  || 'municipio y no en formato consultable. Su propio conjunto abierto en datos.gov.co '
  || '(`rgre-6ak4`) tiene exactamente la estructura que hace falta, con DIVIPOLA y con '
  || '`rud_personas`/`rud_familias` aparte de las reportadas, pero llega hasta 2024.',
  'Existe una respuesta escrita de la UNGRD: o el enlace al consolidado por municipio en formato '
  || 'consultable, o la constancia de que no lo publican y por qué. Las dos respuestas cierran el '
  || 'ticket — lo que no lo cierra es no haber preguntado.',
  'P1', 'S', ARRAY['gestor', 'datos'], 'urgente', 'libre',
  ARRAY[]::text[], 40, now(), now(),
  '**No hay que escribir código.** El trabajo es redactar y enviar la solicitud, y hacerle '
  || 'seguimiento.' || chr(10) || chr(10)
  || '**Lo que ya está hecho y conviene citar en la solicitud:** la tabla `territory_census_status` '
  || 'usa los nombres de columna de su propio conjunto abierto y el código DIVIPOLA, así que lo que '
  || 'nos manden entra sin traducción y lo que salga de aquí lo pueden leer sin traducción. Eso '
  || 'convierte la petición en algo concreto en vez de una idea.' || chr(10) || chr(10)
  || '**La vía formal es la Ley 1712 de 2014** (solicitud de acceso a información pública, con '
  || 'plazo de respuesta). Vale la pena intentar primero por el canal informal, porque una solicitud '
  || 'formal a veces cierra la puerta a la conversación.' || chr(10) || chr(10)
  || '**El límite que no se cruza:** no pedimos datos personales de nadie. La petición es por '
  || 'agregados por municipio. Que la primera frase sea «no queremos sus datos personales» quita el '
  || 'mayor motivo para decir que no — ver `docs/35-alianzas.md`.'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE code = 'P1-4');
