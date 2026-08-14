# Fuentes e ingesta de datos públicos

## Regla de publicación

Ingerir no significa publicar. Cada adaptador escribe primero en el registro versionado de fuentes; una proyección explícita aplica validación, atribución, frescura y privacidad antes de exponer cualquier campo. No existe una API genérica que devuelva `payload` arbitrario.

## Matriz inicial

| Fuente | Datos aprovechables | Método | Estado | Condición |
| --- | --- | --- | --- | --- |
| Repositorio oficial de Cali | Balance, fecha de corte, acopios, albergues y bancos de sangre | HTML identificado y versionado | Implementado | Una petición condicional; `crawl-delay` de 5 segundos |
| SGC Geoportal | Catálogo de sismos, geometría, magnitud, profundidad y tiempo | ArcGIS REST en JSON/GeoJSON | Siguiente adaptador | Conservar atribución y parámetros de consulta |
| DANE MGN | Departamentos, municipios, códigos y límites | Descarga/servicio geográfico oficial | Siguiente adaptador | Fijar versión del marco y no mezclar vigencias |
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

## Operación

Vista previa sin persistencia:

```bash
pnpm --filter @pulso/worker ingest:cali
```

Persistencia después de aplicar las migraciones:

```bash
DATABASE_URL=postgres://pulso:pulso@localhost:5432/pulso \
  pnpm --filter @pulso/worker ingest:cali
```

Consulta pública, limitada a la proyección oficial validada:

```text
GET /v1/public/sources/cali-official-earthquake-repository/snapshot
```

## Próximos adaptadores

1. SGC ArcGIS REST para eventos sísmicos y réplicas.
2. DANE MGN para geometrías oficiales y códigos territoriales.
3. Importador CSV/JSON firmado para organizaciones aliadas.
4. Webhook de necesidades y resolución para plataformas comunitarias con convenio.

Referencias técnicas:

- SGC, catálogo de sismos ArcGIS REST: <https://geoportal.sgc.gov.co/arcgis/rest/services/catalogo_sismos/catalogo_de_sismos_2/MapServer>
- DANE, Marco Geoestadístico Nacional: <https://geoportal.dane.gov.co/descargas/mgn_2023/MGN2023_ManualDeUso.pdf>
- Alcaldía de Cali, repositorio oficial: <https://www.cali.gov.co/gobierno/publicaciones/193607/terremoto-de-cali-repositorio-oficial-de-informacion/>
