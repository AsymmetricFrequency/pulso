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
