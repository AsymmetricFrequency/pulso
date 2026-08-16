# Fuentes e ingesta de datos públicos

## Regla de publicación

Ingerir no significa publicar. Cada adaptador escribe primero en el registro versionado de fuentes; una proyección explícita aplica validación, atribución, frescura y privacidad antes de exponer cualquier campo. No existe una API genérica que devuelva `payload` arbitrario.

## Matriz inicial

| Fuente | Datos aprovechables | Método | Estado | Condición |
| --- | --- | --- | --- | --- |
| Repositorio oficial de Cali | Balance, fecha de corte, acopios, albergues y bancos de sangre | HTML identificado y versionado | Implementado | Una petición condicional; `crawl-delay` de 5 segundos |
| SGC, sismos de los últimos cinco días | Identificador, magnitud, profundidad, ubicación, tiempo y estado de revisión | Feed JSON oficial, petición condicional | Implementado | El feed usa `[latitud, longitud, profundidad]`; el adaptador normaliza el orden explícitamente |
| DANE MGN 2023 | 33 departamentos, 1.121 municipios, códigos y límites | ArcGIS FeatureServer oficial en GeoJSON | Implementado | Vigencia 2023 fijada; la carga falla cerrada si el conjunto está incompleto |
| Alcaldía de Cali, comunicados | Títulos, fecha, URL y categoría | Sitemap/publicaciones | Candidato | Indexar metadatos; revisión editorial para afirmaciones |
| Aquí Hace Falta | Necesidades y estados comunitarios | Convex/API del propietario | Requiere acuerdo | No consumir el backend descubierto en el cliente sin permiso |
| SUMA | Necesidades, albergues, acopios, sangre y personal | Supabase/API del propietario | Requiere acuerdo | Solicitar exportación, API key y términos de uso |
| terremoto.com.co | Daños, atrapados, desaparecidos y acopios | API o exportación del propietario | Requiere acuerdo | Separar señales críticas de casos personales |
| Colombia te busca / SIRDEC | Personas desaparecidas | Integración autorizada | Restringido | No hacer scraping nominal; base legal, consentimiento y protocolo de cierre |
| Redes sociales y WhatsApp | Señales, fotos, ubicación y necesidades | Canal remitido por el usuario | Restringido | Consentimiento, minimización, caducidad y revisión humana |

## Campos importados desde Cali

La primera ejecución real del 14 de agosto de 2026 produjo 18 registros:

- 5 métricas oficiales;
- 4 centros de acopio, incluyendo estado abierto o cerrado;
- 4 albergues temporales;
- 5 bancos de sangre con horario, dirección publicada y enlace cartográfico.

El importador no recoge los nombres, teléfonos o fotografías de personas desaparecidas, aunque una página pública pueda mostrarlos. Tampoco descarga automáticamente el PDF enlazado porque la ruta está excluida por `robots.txt`; conserva únicamente el enlace oficial.

## Ciclo de una fuente

1. Registrar propietario, autoridad, URL, clasificación y método permitido.
2. Consultar con identificación de PULSO VIDA, límite de frecuencia y petición condicional.
3. Validar un contrato estricto y poner en cuarentena cualquier cambio inesperado.
4. Calcular hash y conservar una versión únicamente cuando el contenido cambia.
5. Marcar registros ausentes para revisión; no eliminarlos automáticamente.
6. Resolver territorio y posibles duplicados sin perder el identificador de origen.
7. Publicar solo una proyección segura con fuente y fecha de corte.

## SGC y DANE

La vista previa verificada el 14 de agosto de 2026 recuperó 689 eventos del SGC ocurridos desde el inicio configurado de la emergencia (`10 ago, 07:34 COT`), además de los 33 departamentos y 1.121 municipios del MGN 2023. Estas cantidades son controles de ingestión, no cifras de afectación.

Los eventos del SGC se publican como **eventos sísmicos**. PULSO VIDA no los presenta automáticamente como réplicas: atribuir una relación con el evento principal exige análisis del SGC. El mapa público limita la visualización regional a eventos de magnitud 2 o superior y conserva la atribución oficial.

Las geometrías DANE se incorporan primero al registro versionado y, cuando existe `PULSO_INCIDENT_CODE`, también actualizan la jerarquía operacional `departamento → municipio`. La portada intenta cargar esta proyección oficial y conserva una capa local como respaldo de disponibilidad.

## Operación

Vista previa sin persistencia:

```bash
pnpm --filter @pulso/worker ingest:cali
pnpm --filter @pulso/worker ingest:sgc
pnpm --filter @pulso/worker ingest:dane
```

Persistencia después de aplicar las migraciones:

```bash
DATABASE_URL=postgres://pulso:pulso@localhost:5432/pulso \
  pnpm --filter @pulso/worker ingest:cali

DATABASE_URL=postgres://pulso:pulso@localhost:5432/pulso \
PULSO_INCIDENT_STARTED_AT=2026-08-10T07:34:00-05:00 \
  pnpm --filter @pulso/worker ingest:sgc

DATABASE_URL=postgres://pulso:pulso@localhost:5432/pulso \
PULSO_INCIDENT_CODE=colombia-2026 \
  pnpm --filter @pulso/worker ingest:dane
```

Consulta pública, limitada a la proyección oficial validada:

```text
GET /v1/public/sources/cali-official-earthquake-repository/snapshot
GET /v1/public/sources/sgc-realtime-earthquakes/snapshot
GET /v1/public/incidents/colombia-2026/territories?level=department
GET /v1/public/incidents/colombia-2026/territories?level=municipality&departmentCode=76
```

## Próximos adaptadores

1. Importador CSV/JSON firmado para organizaciones aliadas.
2. Webhook de necesidades y resolución para plataformas comunitarias con convenio.
3. Automatización programada de SGC, DANE y Cali con alertas de cambio de contrato.

Referencias técnicas:

- SGC, feed oficial de los últimos cinco días: <https://archive.sgc.gov.co/feed/v1.0.1/summary/five_days_all.json>
- SGC, visor de sismicidad: <https://www.sgc.gov.co/sismos>
- DANE, FeatureServer MGN 2023: <https://geoportal.dane.gov.co/mparcgis/rest/services/MGN2023/Serv_CapasMGN_2023/FeatureServer>
- Alcaldía de Cali, repositorio oficial: <https://www.cali.gov.co/gobierno/publicaciones/193607/terremoto-de-cali-repositorio-oficial-de-informacion/>

## Estado real en producción (16 ago 2026)

El worker corre en el VPS con `SOURCE_INGESTION_ENABLED=true`. Cada fuente tiene su propia
cadencia, elegida por el `crawl-delay` o la ventana de caché que declara la fuente — no hay un
intervalo único de 20 minutos para todas, y forzarlo solo re-descargaría el mismo snapshot cacheado:

| Fuente | Cadencia | Estado observado |
| --- | --- | --- |
| SGC (sismos) | 5 min | corre limpio · 639 registros |
| contemos | 10 min | corre, con **404/500 intermitentes de su propio feed** · 1.986 registros |
| gravitas | 10 min | corre limpio · 200 puntos |
| ayudaspereira | 15 min | corre limpio · 480 registros |
| redcaliayuda (necesidades) | 15 min | corre limpio · 500 registros |
| redcaliayuda (acopio) | 15 min | corre limpio · 127 puntos |
| publicación del informe | 20 min | corre limpio (no es ingesta externa) |
| terremotocolombia | 4 h | corre limpio · 220 registros (su CDN cachea 4 h) |
| DANE MGN | 24 h | corre limpio · 1.154 territorios |
| **Cali oficial** | 30 min | **falla siempre — HTTP 403** |

### Cali bloquea al servidor

`cali.gov.co` responde 200 a la misma URL desde una conexión residencial colombiana y **403 desde
el VPS**, con cualquier User-Agent. No es el parser ni el rate-limit propio: es un bloqueo por
origen de la petición (IP de datacenter o geografía). La última ingesta exitosa fue justo antes de
migrar el worker al servidor.

No se intenta rodear ese bloqueo. La vía correcta es la que ya plantea el plan P0: pedir la misma
información por el portal de datos abiertos (`datos.gov.co`) o por solicitud formal bajo la Ley
1712, que además entrega datos estructurados y versionables en vez de HTML raspado.

## Registro de corridas

Durante un tiempo solo `sgc`, `cali` y `dane` escribían en `source_ingestion_runs`, y **ningún
fallo se registraba nunca**. Por eso Cali estuvo devolviendo 403 en veinte corridas seguidas sin
que ninguna consulta a la base lo mostrara: una fuente podía estar caída y el sistema se veía sano.

La causa no era el olvido de seis módulos, era dónde vivía el registro. Cada fuente lo resolvía
dentro de sí misma, y el fallo casi siempre ocurre en la descarga — lo primero que hace el módulo,
antes de abrir su conexión a la base. **Un HTTP 403 no deja rastro si el único que puede anotarlo
es quien acaba de caerse.**

Ahora el registro vive en `runIngestionSourceWithLog` (`apps/worker/src/scheduler.ts`), que abre la
conexión primero, anota la corrida como `running`, invoca a la fuente y cierra la fila con el
resultado — o con el error y su código HTTP si lanzó. El error se vuelve a lanzar después de
anotarlo, porque BullMQ tiene que seguir viendo el trabajo como fallido para reintentarlo.

Las fuentes oficiales siguen escribiendo su propio detalle (etag, hash del contenido, conteo
exacto de registros) sobre esa misma fila, gracias al `runId` que reciben. La condición
`status = 'running'` al cerrar es lo que permite que ambos convivan: si la fuente ya cerró la fila
con su detalle, el envoltorio no la toca; si no la cerró —todas las comunitarias— es lo único que
la cierra. Sin esa condición el envoltorio pisaba el detalle y dejaba `http_status` en nulo y
`records_seen` en cero, cosa que solo apareció al probarlo contra una base real.

Las corridas que quedan en `running` tras un reinicio del worker se cierran al arrancar, para no
confundir un despliegue con una ingesta colgada.

`publish-situation-report` no aparece en esta tabla a propósito: agrega datos que ya son nuestros,
no ingiere nada de afuera, y anotarlo como fuente externa sería inventar una fuente que no existe.

### Cómo se consulta el estado

```sql
SELECT source_id, status, http_status, records_seen, error_message,
       round(extract(epoch FROM (now() - started_at)) / 60) AS hace_min
FROM source_ingestion_runs r
WHERE started_at = (
  SELECT max(started_at) FROM source_ingestion_runs x WHERE x.source_id = r.source_id
)
ORDER BY status DESC, source_id;
```

Primera corrida completa con el registro unificado (16 ago 2026): nueve fuentes anotadas, ocho
correctas —contemos 1.986 registros, DANE 1.154, SGC 639, ayudaspereira 480, redcaliayuda 500 y
127, terremotocolombia 220, gravitas 200— y Cali `failed` con `http_status 403`, que es
exactamente el estado que antes no se veía.

## USGS ShakeMap — intensidad sísmica por territorio

Aporta lo que ninguna otra fuente de Pulso daba: **dónde sacudió más fuerte**. El SGC publica los
sismos —dónde y de qué magnitud— pero no el campo de sacudida sobre el territorio, así que las 33
capas de daño del mapa decían "sin datos publicados" sin más matiz posible.

**La intensidad no es daño.** Un municipio con MMI 7 recibió una sacudida muy fuerte, lo que no
dice cuántas casas cayeron: eso depende de cómo estén construidas. Por eso vive en su propia tabla
(`territory_shaking`), su propia ruta (`/v1/public/incidents/:code/shaking`) y con rótulo propio.
Mezclarla con la capa de afectación haría que un municipio apareciera "con daño severo" sin que
nadie haya ido a mirar, que es exactamente el error que este proyecto evita en todo lo demás.

### Cómo se calcula

El USGS publica la sacudida como una malla CoverageJSON de 171×172 = 29.412 celdas. El cruce contra
los 1.154 polígonos del DANE se hace en PostGIS (`ST_Contains` sobre el índice GiST), no en
memoria: en JavaScript sería un producto cartesiano de 34 millones de comparaciones.

Dos detalles que importan:

- La URL del ShakeMap **lleva la marca de tiempo de la versión** y el USGS revisa el modelo durante
  días. Se resuelve desde el evento en cada corrida; congelarla dejaría a Pulso publicando una
  versión vieja sin enterarse.
- Los valores llegan aplanados en el orden que declara `axisNames`. Respetarlo es lo único que
  separa una malla correcta de una **espejada**, que asignaría la sacudida del Pacífico a los
  Llanos sin que ningún total lo delate. Hay una prueba dedicada a eso.

### Resultado verificado

21 departamentos y 680 municipios con intensidad. El orden reproduce la geografía real del evento
—epicentro a 12 km de San José del Palmar, Chocó—:

| Departamento | MMI máx | Percepción |
| --- | --- | --- |
| Valle del Cauca | 7.8 | Severo |
| Risaralda | 7.7 | Severo |
| Chocó | 7.6 | Severo |
| Caldas | 7.5 | Severo |
| Quindío | 7.4 | Muy fuerte |

Los municipios más sacudidos son Cartago, Pereira y Ulloa — el norte del Valle y Risaralda, lo más
cercano al epicentro. Coincide de forma independiente con el índice de criticidad municipal que
publica Laboratorio TerrarIA, que sitúa a Toro y Roldanillo (norte del Valle) en los primeros
puestos.

## Copernicus EMS: no hay ruta pública

La activación **EMSR916** cubre este sismo con evaluación de daño por satélite —356 edificaciones
clasificadas en Destruida / Dañada / Posiblemente dañada sobre Cali norte, Cali centro y
Buenaventura—, que es justo el dato que falta para `rapid_assessments`. **No se pudo ingerir.**

Lo comprobado:

- La página de la activación (`mapping.emergency.copernicus.eu/activations/EMSR916/`) responde 200
  pero es una cáscara: los productos los carga un visor compilado a WebAssembly.
- El backend de Rapid Mapping (`rapidmapping.emergency.copernicus.eu/backend/activations/{code}`)
  existe y responde JSON, pero contesta `"No Activation matches the given query"` para EMSR916: esa
  activación vive en el portal de On Demand Mapping, que es otro sistema.
- Los nombres exactos de los productos son conocidos
  (`EMSR916_AOI01_GRA_PRODUCT_builtUpP_v1.json`, `EMSR916_AOI06_GRA_MONIT01_builtUpP_v2.json`,
  documentados por Laboratorio TerrarIA), pero ninguna de las rutas de descarga habituales
  responde: el bucket S3 del visor devuelve 403 y el patrón `system/files/components/*.zip` del
  portal antiguo, 404.

La licencia no es el obstáculo —Copernicus EMS es de uso abierto con atribución—, sino el acceso.
Las salidas razonables son pedirle a Copernicus el acceso a los vectores, o acordar con Laboratorio
TerrarIA el uso de su extracción con atribución, ya que ellos sí la resolvieron.
