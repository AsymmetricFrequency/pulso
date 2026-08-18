-- Requerimientos técnicos de cada ticket.
--
-- Un ticket con criterio de aceptación dice **cuándo está terminado**. No dice por dónde se empieza,
-- qué archivos toca, ni qué decisiones ya están tomadas y no hay que volver a tomar. Esa diferencia
-- es la que hace que alguien que llega hoy pueda tomar un ticket sin escribir «¿por dónde empiezo?»
-- en un canal y esperar a que alguien conteste — que en una emergencia puede ser mañana.
--
-- Va en columna propia y no dentro de `summary` porque se lee en otro momento: el resumen se lee
-- para decidir si tomarlo, esto se lee después de haberlo tomado.
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS technical text;

UPDATE project_tasks SET technical = v.technical, updated_at = now() FROM (VALUES

('P0-1', E'**Dónde**\n'
 '`apps/web/app/operations/` para la vista, `apps/api/src/app.ts` para la ruta.\n\n'
 '**Backend**\n'
 'Ya existe `GET /v1/operations/incidents/:incidentId/community-reports`. Añade un filtro por tipo '
 'en vez de crear una ruta nueva. El orden lo pone Postgres, no el cliente: reusa el criterio de '
 '`listPublicByIncident` en `postgres-community-report-repository.ts` — rescate primero, luego '
 'señales de vida (yes, unknown, no), luego antigüedad.\n\n'
 '**Estado de atención**\n'
 'Hace falta una columna nueva (`rescue_handled_at`, `rescue_handled_by_actor_id`). **No reuses '
 '`status`**: ese campo es el estado de *revisión* del reporte y mezclarlos hace imposible '
 'preguntar «cuántos rescates siguen sin equipo».\n\n'
 '**Frontend**\n'
 'Vista propia, no una pestaña más en la lista existente. Máximo tres segundos para saber cuál '
 'atender: señales de vida visibles sin abrir el detalle, y tiempo transcurrido en grande.\n\n'
 '**No hagas**\n'
 'Borrar el rescate atendido. Sale de la cola activa y sigue en el historial.'),

('P0-2', E'**Dónde**\n'
 '`apps/web/app/components/community-report-form.tsx` y la cola de `apps/web/app/field/`.\n\n'
 '**Qué reusar**\n'
 'La cola IndexedDB de Pulso Campo ya existe (`docs/14-persistence-field-offline.md`). No escribas '
 'una segunda: una cola que se sincroniza distinto a la otra es un origen de duplicados difícil de '
 'rastrear.\n\n'
 '**Idempotencia**\n'
 'Ya resuelta: `clientMutationId` es UNIQUE por incidente y el `INSERT` hace `ON CONFLICT DO '
 'UPDATE`. Genera el uuid **al abrir el formulario**, no al enviar, o un reintento crea dos.\n\n'
 '**La mitad del trabajo es la interfaz**\n'
 'Decir «guardado, se enviará solo» sin que parezca «enviado». Si la persona cree que ya salió y no '
 'salió, es peor que el error actual. Estado visible del pendiente y reintento manual.\n\n'
 '**Cómo se prueba**\n'
 'Modo avión, enviar, volver la señal. El reporte llega una sola vez.'),

('P0-3', E'**Dónde**\n'
 '`apps/web/app/components/community-report-detail.tsx`, ruta pública nueva en `app.ts`.\n\n'
 '**Backend**\n'
 '`POST /v1/public/incidents/:incidentCode/community-reports/:reportId/responders`. Sin cuenta, con '
 'el mismo límite de tasa que crear un reporte — mira `#consumeRateLimit` en '
 '`postgres-community-report-repository.ts`.\n\n'
 '**Lo importante**\n'
 'Es una **señal ciudadana, no un cierre**. No puede sacar el rescate de la cola por sí sola: '
 'acumula confirmaciones y quien coordina decide. Una sola persona equivocada no puede hacer que un '
 'punto deje de recibir equipos.\n\n'
 '**Frontend**\n'
 'El marcador cambia de aspecto, no de color de estado: el rojo crítico se queda mientras haya '
 'gente debajo.'),

('P0-4', E'**No requiere código.**\n\n'
 '**Qué hace falta**\n'
 'Una pieza corta y compartible —imagen o video de menos de 30 segundos— que explique que se puede '
 'reportar un punto con personas atrapadas desde pulso.my, y cómo.\n\n'
 '**La frase obligatoria**\n'
 '«Llama al 123 primero.» Sin ella no se publica. Pulso no despacha equipos, y una pieza que lo '
 'insinúe produce gente esperando en vez de gente llamando.\n\n'
 '**Dónde llevarla**\n'
 'Grupos de barrio de las zonas afectadas, cuentas que ya publican mapas de la emergencia, '
 'organismos de socorro. Tres canales concretos, no «redes sociales».\n\n'
 '**Cómo se mide**\n'
 'Se puede nombrar dónde llegó. Si además entran rescates reportados, mejor.'),

('P0-5', E'**Dónde**\n'
 '`apps/worker/src/contract-triage.ts` — ya está escrito y probado. Ver `docs/31-contract-triage.md`.\n\n'
 '**Pasos**\n'
 '1. `ANTHROPIC_API_KEY` en `/opt/pulso/.env`.\n'
 '2. `PULSO_TRIAGE_LIMIT=20 pnpm --filter @pulso/worker triage:contracts`\n'
 '3. Leer los 20 `rationale` en la cola de Operaciones y decidir si el criterio sirve.\n'
 '4. Solo entonces, correr el resto.\n\n'
 '**Por qué la tanda de prueba**\n'
 'Los 357 cuestan unos 3 USD y el trabajo es reanudable (`triage_at IS NULL`), así que parar a '
 'mirar no cuesta nada. Soltar los 357 con un criterio malo sí.\n\n'
 '**No toques**\n'
 '`emergency_relevance`. Ese campo lo escribe una persona; el triaje solo ordena la cola.'),

('P0-6', E'**Dónde**\n'
 '`apps/api/src/app.ts` (ruta pública de creación), `apps/api/src/discord.ts`.\n\n'
 '**Qué reusar**\n'
 '`DiscordClient.alert()` ya existe y ya se traga sus propios errores. Falta `DISCORD_WEBHOOK_ALERTS` '
 'en el `.env` y llamarlo tras crear un reporte de tipo `rescate`.\n\n'
 '**La regla que no se rompe**\n'
 'El aviso va **después** de escribir en la base y su fallo no se propaga. Un rescate que no se '
 'guarda porque Discord estaba caído es el peor fallo posible de este sistema.\n\n'
 '**Contenido del aviso**\n'
 'Personas, señales de vida, si hay rescatistas, y enlace al punto. Nada más: quien lo lee está '
 'decidiendo si sale, no leyendo un informe.\n\n'
 '**Segunda vía**\n'
 'Discord no puede ser el único canal — no todo organismo de socorro lo usa. Deja el envío detrás de '
 'una interfaz con una implementación, para poder añadir otra sin tocar la ruta.'),

('P0-7', E'**Dónde**\n'
 '`apps/web/app/` ruta nueva, `apps/api/src/app.ts`.\n\n'
 '**Backend**\n'
 'Una consulta por ciudad que devuelva los puntos agrupados por tipo. La caja delimitadora ya está '
 'soportada (`bbox=` en `/community-reports`) y el índice GiST sobre `location` ya existe. Los '
 'municipios DANE dan la geometría: `/v1/public/incidents/:code/territories?level=municipality`.\n\n'
 '**Qué mostrar, en este orden**\n'
 'Rescates abiertos · PMU · alojamientos y albergues · centros de acopio · necesidades sin cubrir. '
 'Los rescates arriba y visualmente separados del resto.\n\n'
 '**No esperes a PL-1**\n'
 'Esta vista puede salir con lo que hay hoy. Si se ata al motor de mapa único, se queda parada '
 'esperando una decisión que todavía no está tomada.\n\n'
 '**Rendimiento**\n'
 'Con caja delimitadora el universo ya viene acotado; no hace falta el recorte de 800 de la vista '
 'de país.'),

('P0-8', E'**Dónde**\n'
 'Migración nueva, `packages/schemas/src/community-report.ts`, formulario y mapa.\n\n'
 '**Modelo**\n'
 'Categoría nueva o tipo nuevo — decídelo en `#solutions` antes de escribir. Un alojamiento lleva '
 'capacidad y ocupación aproximadas; un acopio no. Mira cómo `024_rescue_reports.sql` añadió campos '
 'que solo aplican a un tipo, con `CHECK` que los deja en NULL para el resto.\n\n'
 '**Reclasificar lo ya ingerido**\n'
 'Las fuentes externas ya trajeron albergues mezclados con acopios. Se reclasifican **conservando '
 '`external_source_id` y `external_key`**. Nada de borrar y volver a importar: se pierde la '
 'procedencia y las referencias.\n\n'
 '**Mapa**\n'
 'Distinguibles a simple vista, sin abrir el detalle. Icono distinto, no solo color.'),

('P1-1', E'**Dónde**\n'
 '`packages/schemas/`, `packages/domain/`, `apps/api/src/`. La migración `012` ya existe: '
 '`affected_people`, `affected_households`, `affected_places`, `disaster_cases`, `source_records`.\n\n'
 '**Se puede partir en tres PRs**\n'
 '1. Esquemas Zod y contratos de dominio.\n'
 '2. Repositorio dual — memoria y Postgres. Las pruebas corren contra el de memoria, así que si '
 'divergen, lo verificado no es lo que se despliega.\n'
 '3. Rutas de operaciones.\n\n'
 '**Respeta la máquina de estados**\n'
 'Los ocho estados de `docs/25-day-four-affected-people.md` están decididos. Una señal ciudadana '
 'nunca salta directo a «caracterizado oficialmente».\n\n'
 '**Privacidad — revisión de Maintainer obligatoria**\n'
 'Documentos y teléfonos van cifrados con `apps/api/src/field-encryption.ts` y **no salen por '
 'ninguna ruta pública**. El identificador público es un código de caso aleatorio. Para comparar '
 'identificadores sin exponerlos, huellas HMAC con sal del incidente.\n\n'
 '**Una persona sin documento no queda bloqueada.** Es requisito, no caso borde.'),

('PL-10', E'**Dónde**\n'
 '`apps/api/src/app.ts`.\n\n'
 '**Qué**\n'
 '`@fastify/rate-limit` sobre las rutas públicas de lectura. Hoy solo el `POST` de reportes tiene '
 'límite, y el listado del mapa devuelve hasta 20.000 puntos.\n\n'
 '**Cuidado con el número**\n'
 'Un límite agresivo tumba el mapa para un barrio entero detrás de un mismo NAT. Mide primero con '
 'una prueba de carga y elige a partir del dato, no de la intuición.\n\n'
 '**Respuesta**\n'
 '`429` con `Retry-After`. Y el mapa tiene que degradar con un mensaje, no quedarse en blanco.\n\n'
 '**Nunca limites**\n'
 'La creación de un reporte de rescate más de lo que ya está. Ahí el riesgo de bloquear a alguien '
 'real supera al del abuso.')

) AS v(code, technical) WHERE project_tasks.code = v.code;
