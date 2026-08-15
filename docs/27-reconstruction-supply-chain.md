# Reconstrucción: de la evaluación de daños a la vivienda reconstruida

## Decisión

Después de reconocer víctimas, lugares y edificaciones dañadas, la pregunta siguiente es
operativa: ¿qué materiales hacen falta, quién los tiene, quién los instala, y cómo se sabe que
una donación específica terminó reconstruyendo una vivienda específica? Esta página conecta esas
cuatro piezas — casos de daño, materiales, mano de obra, proveedores — con las donaciones, para
que el ciclo se pueda rastrear de principio a fin en vez de quedar en cifras sueltas.

## Lo que ya existía y no se estaba usando

Antes de escribir una sola tabla nueva, se revisó el esquema completo. La cadena de suministro de
materiales **ya estaba diseñada por completo** desde una fase temprana del proyecto (ver
[`10-material-donations.md`](./10-material-donations.md)), pero ninguna tabla tenía una sola fila:

```text
material_catalog_items → supply_needs → donation_commitments
                                       → material_lots → quality_inspections
                                       → inventory_movements
                                       → material_allocations → aid_deliveries
```

Igual pasaba con `rapid_assessments` (evaluaciones de daño de campo, alimentadas por Pulso
Campo) y con `disaster_cases`/`affected_places` (ver
[`25-day-four-affected-people.md`](./25-day-four-affected-people.md)), que ya modelan un caso de
tipo `housing_damage` ligado a un lugar afectado. Todo el backend de "informe público" que
mostraba números de reconstrucción los tenía **inventados** — strings fijos en
`memory-public-report-repository.ts` — precisamente porque no había nada real que agregar. Esto
se corrigió aparte (ver `postgres-public-report-repository.ts` y el job
`publish-situation-report`), pero mientras nadie evalúe daños reales desde Pulso Campo, esos
números seguirán en cero de forma honesta.

**Lo único que hizo falta agregar** fue el punto de unión entre "una necesidad de materiales" y
"un caso de reconstrucción específico" (`supply_needs.disaster_case_id`, migración `018`), y dos
piezas que nunca existieron: un directorio de proveedores comerciales y un directorio de mano de
obra.

## Piezas nuevas

### Proveedores de materiales (`material_suppliers`, `supplier_catalog_offers`)

Un proveedor es un negocio que **vende** materiales — distinto de `donation_commitments`, que
modela lo que se **dona**. El nombre del negocio, su ubicación y su contacto público son
información institucional, no personal (mismo criterio que ya se usó para `warehouses` y para los
puntos de acopio institucionales importados de contemos/GRAVITAS/Ayudas Pereira/terremotocolombia
esta misma sesión). Cualquiera puede registrar su negocio sin cuenta — se publica de inmediato
como `reported` (sin verificar) y Operaciones puede corroborarlo o verificarlo después, exactamente
el mismo patrón de confianza que los reportes ciudadanos (`community_reports`).

Al registrar un proveedor, el territorio (`territory_id`) se resuelve automáticamente por
ubicación geográfica (`ST_Within` contra los polígonos de departamento de DANE) — el negocio no
tiene que saber ni escribir en qué departamento está.

**Directorio inicial de Cali** (`apps/worker/src/seed-cali-suppliers.ts`, `pnpm seed:cali-suppliers`):
30 proveedores reales sembrados de dos fuentes verificables — las 3 tiendas Homecenter en Cali
(cruzadas contra homecenter.com.co y el nodo `shop=department_store` de OpenStreetMap, marcadas
`corroborated`) y 27 ferreterías independientes (`shop=hardware`/`doityourself`/`trade` reales,
consultadas vía Overpass API, marcadas `reported`). No es exhaustivo — la cobertura de OSM para
ferreterías pequeñas en Colombia es incompleta — pero es un directorio real y verificable, no
inventado; cualquiera puede seguir autoregistrando su negocio desde el formulario público.

### Mano de obra (`workforce_profiles`, `workforce_assignments`)

A diferencia de los nombres de personas desaparecidas que Pulso se niega a importar de plataformas
externas (dato de terceros, sin consentimiento del titular), aquí una persona **se auto-registra
voluntariamente** para ofrecer su propio trabajo — es un caso de consentimiento directo, no de
scraping de PII ajena. Esa distinción es la que sostiene la decisión de sí guardar identidad real
en esta tabla.

`workforce_profiles.display_name_encrypted` y `.contact_encrypted` (migración
`019_workforce_identity.sql`) guardan el nombre y el contacto cifrados con AES-256-GCM
(`apps/api/src/field-encryption.ts`, clave derivada por dominio a partir del secreto existente del
proyecto — nunca en texto plano en la base de datos). Las rutas públicas
(`GET /v1/public/incidents/:code/workforce-profiles`) solo devuelven `maskedDisplayName` —
"María González" se ve como `"María G***"` — y nunca el contacto. Solo la ruta autenticada de
Operaciones (`GET /v1/operations/incidents/:incidentId/workforce-profiles`) puede pedir el nombre y
contacto descifrados, para poder contactar a la persona sobre una asignación real. La tabla también
registra `role`, `headcount` y `territory_id` para las vistas agregadas de disponibilidad por
oficio y departamento.

`workforce_assignments` permite asignar cupos de una fila de `workforce_profiles` a un
`disaster_case_id`, por cabeza y oficio.

## Cómo cierra el ciclo

```text
rapid_assessments (daño evaluado en campo)
        ↓
disaster_cases (case_type = housing_damage)
        ↓
supply_needs (disaster_case_id) ←── catálogo de materiales
        ↓
material_allocations ←── material_lots ←── donation_commitments (quién donó)
        ↓
aid_deliveries (qué se entregó, cuándo, con qué evidencia)
```

Con `supply_needs.disaster_case_id` poblado, una entrega se puede rastrear hacia atrás hasta la
donación que la financió y hacia adelante hasta la vivienda que ayudó a reconstruir — el "ciclo
completo" que se pidió. El endpoint público `reconstruction-progress` ya calcula esto: materiales
necesitados vs. entregados por tipo, y por departamento: casos totales, casos con materiales
asignados, proveedores registrados, mano de obra disponible.

## Superficie de API

Todo bajo `/v1/public/incidents/:incidentCode/`:

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST`/`GET` | `material-suppliers` | Autoregistro público de proveedores; listado público |
| `POST`/`GET` | `workforce-profiles` | Autoregistro público de mano de obra (nombre/contacto cifrados); listado público solo con nombre enmascarado |
| `GET` | `reconstruction-progress` | Agregados de materiales/casos/proveedores/mano de obra por incidente y departamento |

Los tres reutilizan el mismo mecanismo de límite de tasa por IP (`access_rate_limits`) que ya
usaban los reportes ciudadanos: 5 registros cada 10 minutos.

Además, bajo `/v1/operations/incidents/:incidentId/` (requiere sesión de Operaciones):

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `workforce-profiles` | Listado completo con nombre y contacto descifrados, para coordinar asignaciones reales |

## Qué falta para que esto muestre datos reales (no solo honestos ceros)

1. Que una brigada registre evaluaciones reales desde Pulso Campo (`rapid_assessments`) — hoy la
   tabla está vacía porque nadie la ha usado, no porque falte cablear algo.
2. Que Operaciones cree `operational_zones` reales (también vacía) — `rapid_assessments` y
   `supply_needs` dependen de una zona operativa existente.
3. El nombre y contacto de `workforce_profiles` ya están cifrados y disponibles para Operaciones
   (`GET /v1/operations/.../workforce-profiles`); falta el flujo de asignación en sí — que un
   coordinador tome un perfil y lo ligue a un `disaster_case_id` concreto vía
   `workforce_assignments` desde la UI, hoy solo existe el modelo de datos.
4. Un catálogo de precios/disponibilidad vivo por proveedor (`supplier_catalog_offers.status`)
   requiere que el proveedor vuelva a actualizar su oferta — no hay todavía un flujo de edición,
   solo de alta inicial.

Ninguno de estos se resolvió con datos inventados: el patrón de este proyecto es mostrar el
estado real, aunque sea cero, y dejar la tubería lista para cuando el dato real llegue.
