# Fuentes conectadas

Estado verificado el 16 de agosto de 2026 corriendo las once ingestas y consultando la base. No es
una lista de intenciones: cada cifra salió de `source_ingestion_runs`.

**Trece fuentes conectadas. Doce funcionan. Una está bloqueada en origen.**

En el panel administrativo, `admin.pulso.my` → Operación, esta misma tabla se ve en vivo con la
última corrida de cada una.

---

## Oficiales

| Fuente | Qué trae | Última corrida | Estado |
| --- | --- | --- | --- |
| `sgc-realtime-earthquakes` | Sismicidad en tiempo real, 650 eventos | cada 20 min | Funciona |
| `usgs-shakemap` | Intensidad percibida por territorio, 29.412 registros | diaria | Funciona |
| `dane-mgn-2023` | Geometrías: 33 departamentos, 1.121 municipios | diaria | Funciona |
| `secop-ii-contratos` | 357 contratos de entidades de territorios afectados | diaria | Funciona |
| `cali-official-earthquake-repository` | Cifras oficiales, acopios, albergues, bancos de sangre | — | **HTTP 403** |

### El bloqueo de Cali

`cali.gov.co` responde 403 a nuestras peticiones. **No se rodea.** Ni cambiando la cabecera de
agente, ni por un proxy, ni bajando el ritmo hasta parecer un navegador.

No es escrúpulo abstracto: saltarse un bloqueo técnico de una alcaldía destruye la posibilidad de
firmar un convenio con esa misma alcaldía, que vale infinitamente más que los datos que sacaríamos
hoy. El camino correcto es `datos.gov.co` o una solicitud formal por Ley 1712. Ver
[`35-alianzas.md`](35-alianzas.md).

---

## Comunitarias

Plataformas ciudadanas que están mapeando la misma emergencia. Se ingieren agregados e información
institucional; nunca registros de personas.

| Fuente | Qué trae | Registros | Estado |
| --- | --- | --- | --- |
| `contemos-mapa-situacion` | Necesidades y ofrecimientos multi-fuente | 1.930 | Funciona |
| `redcaliayuda-necesidades` | Necesidades de Cali | 500 | Funciona |
| `ayudaspereira-centros` | Centros de acopio por ciudad | 496 | Funciona |
| `terremotocolombia-co` | Acopio y puntos de la emergencia | 220 | Funciona |
| `gravitas-mapa-ciudadano` | Edificios, acopios, logística, voluntariado | 200 | Funciona |
| `redcaliayuda-acopio` | Centros de acopio de Cali | 127 | Funciona |
| `mapadelterremoto-registro` | Registro nacional de daños: colapsos, escuelas, hospitales, vías | 1.089 | Funciona |
| `cuidarcolombia-acopios` | Acopios y bancos de sangre fuera de Cali y Pereira, con horario | 72 | Funciona |

### Lo que no se importa nunca

**`redcaliayuda.vercel.app/personas`.** Es un listado de personas desaparecidas con datos
personales. Tiene su ruta institucional propia —SIRDEC y el Mecanismo de Búsqueda Urgente— y no
pasa por aquí. Que el dato sea público en su origen no lo hace nuestro para republicarlo.

---

## Contacto: enlazamos, no copiamos

**264 fichas importadas declaran tener un teléfono en su origen** (168 de Gravitas, 95 de contemos,
1 de terremotocolombia). Ese número se lo dieron a esa plataforma, no a Pulso.

Cuando una ficha marca `hasContact`, el detalle del punto lo dice y ofrece abrirla en su fuente. La
conexión ocurre; el dato personal se queda donde su dueño lo puso.

Lo que **sí** guardamos es el contacto que alguien nos da a nosotros, en el formulario que dice
«solo para seguimiento, no se publica»: cifrado con AES-256-GCM y legible únicamente desde una
sesión de Operaciones. Es dato de primera mano y consentido, que es otra cosa.

### El incidente del 16 de agosto

**43 descripciones importadas traían un teléfono visible y se sirvieron por la API pública.** Los
importadores copiaban el texto libre tal cual, y ese texto lo escribió gente que puso su número
para que la llamaran.

El primer arreglo —una transformación en el esquema Zod de la ingesta externa— **no sirvió**: los
seis importadores del worker escriben su propio `INSERT` y ninguno pasa por ese esquema. Se
comprobó al volver a correr la ingesta y ver reaparecer los 27 móviles tapados diez minutos antes.

El arreglo real es un disparador en Postgres (`033_redact_contacts_trigger.sql`), que ningún camino
puede rodear. Verificado reingiriendo las tres fuentes que más traían: cero.

**La lección para quien escriba el próximo importador:** una invariante de privacidad que depende de
que cada autor se acuerde no es una invariante. Va en la base.

---

## mapadelterremoto: cómo se conectó y qué se decidió

**1.089 puntos de daño en el mapa** — colapsos, escuelas, hospitales, patrimonio, vías— desde el
registro nacional de [mapadelterremoto.com](https://www.mapadelterremoto.com/), operado por Naboo
Intelligence. Es la primera fuente que nos da daño estructural fuera de Cali.

### De dónde salen los datos

De `/datos/registro-ligero.json`: un fichero estático, bajo una ruta llamada literalmente «datos»,
servido con `access-control-allow-origin: *` —publicado para que lo consuman otros— y con
`robots.txt` en `Allow: /`. **Su propio mapa pide ese mismo fichero.** No es una API interna deducida
leyendo su JavaScript, que es lo que decidimos no hacer.

No tiene licencia declarada. Dicen que tras el 30/11/2026 los datos quedan «publicados de forma
permanente en formato abierto». Hasta entonces: atribución visible en cada punto y enlace a su
ficha. `P0-9` sigue en pie, pero la petición cambia: ya no es «dennos los datos», es **pónganle una
licencia y mantengan estable el endpoint**.

### Las descargas son condicionales

El fichero pesa 4 MB. Sondearlo cada media hora sin condicional serían ~200 MB al día servidos por
quien nos está dando los datos gratis. Con `If-None-Match` la mayoría de las corridas devuelve **304
y cero bytes**.

`source_ingestion_runs` tenía columnas `etag` y un estado `unchanged` desde la migración `012` y
ningún importador los había usado nunca. La primera fuente que los necesitó fue esta.

### Cuatro decisiones

**Solo entran los puntos con coordenada real: 1.146 de 3.110.** La fuente es escrupulosa —cuando
solo conoce el municipio deja `lat`/`lon` en null en vez de poner el centroide— y sostenemos la
misma línea. Clavar un edificio en el centro del pueblo manda a un equipo al sitio equivocado.

**Las personas atrapadas viajan como contexto, nunca como `rescate`.** El registro reporta 92
atrapados. Son cifras de prensa del 10 y el 11 de agosto, sin confirmar en ocho de cada nueve casos.
Ponerlas por encima de un reporte ciudadano de hace diez minutos rompería lo único que la cola de
rescate tiene que garantizar: que lo de arriba vale la pena atender.

**`NOTICIA`, `SAQUEO`, `ROBO` e `INCENDIO` se quedan fuera.** Una nota de prensa no es un punto del
territorio, y saqueo y robo son denuncias sobre gente concreta en un barrio concreto: publicarlas
georreferenciadas señala vecindarios sin que nadie pueda responder por el dato.

**`DESCARTADO` no se importa.** La propia fuente evaluó esos 137 puntos y concluyó que no eran
ciertos. Importarlos como cualquier otra cosa sería republicar algo que su autor ya desmintió.

### El fallo de privacidad, y por qué es distinto del anterior

**El mapa llegó a publicar «Barrio Grisales · vivienda de Olmedo Zapata».** Nueve registros, en
producción, durante unos minutos.

Di por segura la dirección porque son edificios e instituciones —y 1.091 de 1.100 veces lo es—. Pero
cuando la casa que cayó es de una familia, la fuente la identifica **por su dueño**. Publicar ese
nombre junto a «su casa colapsó» dice dónde vive, que lo perdió todo y que esta noche no está ahí.

Esos puntos conservan coordenada, severidad y fuente, y pierden el hogar: el título pasa a «Vivienda
afectada — Quimbaya», y se caen la dirección, el barrio y la descripción —que en esos registros es
esa misma familia hablando de su casa—.

**La lección es más estrecha que «revisa el texto libre».** Revisé el campo que parecía prosa y
confié en el que parecía dato. Que un campo lleve el nombre de una persona no depende de lo
estructurado que sea.

El disparador de redacción sí hizo su trabajo en paralelo: **30 descripciones importadas traían
teléfono y las tapó en la base**, sin que el importador tuviera que acordarse. Comprobado: cero
móviles en las 1.089 filas.

---

## Geocodificar: cuándo sí, y qué se promete

`cuidarcolombia` publica tan bien como mapadelterremoto —fichero estático en `/data/`, CORS abierto,
ETag— pero **sus 118 puntos de acopio no traen coordenada.** Las únicas del fichero son 32
centroides de ciudad. Clavar 118 acopios en 32 centros de ciudad es justamente lo que rechazamos
antes con las sobras de mapadelterremoto y con Ayudas Pereira.

Así que se geocodifica. Con tres reglas que no se relajan.

### 1. El punto tiene que caer dentro del polígono del municipio declarado

Sin guardarraíl, «Alcaldía Municipal de Atrato» resuelve en **Medio Atrato** —otro municipio, a
horas— con toda la confianza del mundo. Medido: **uno de cada seis aciertos aparentes estaba en otro
municipio.**

**Ninguna comparación de texto sirve, y costó dos intentos descubrirlo.** Contención: «Medio Atrato»
*contiene* «Atrato», así que acepta justo el error que hay que atrapar. Igualdad: rechaza casi todo,
porque OSM devuelve «Perímetro Urbano Medellín», «Cartagena de Indias» y, para un punto que sí está
en Cali, el corregimiento «La Buitrera». Los tres son correctos y los tres se caían.

La pregunta tiene respuesta geométrica y los datos ya estaban: **1.121 polígonos municipales del
DANE**, con índice GiST desde la migración `001`. ¿Cae el punto dentro del polígono del municipio
que declaró la fuente?

Emparejar el nombre declarado con un polígono todavía necesita normalizar, así que eso es ahora una
regla escrita en la base (`pulso_normalize_place`) y no algo que cada consulta reinvente. **La
coincidencia exacta manda:** «Atrato» existe en el DANE, gana por sí sola, y el punto de Medio
Atrato se rechaza. Solo cuando no hay exacta —«Cartagena», «Cúcuta»— compiten los nombres oficiales
largos, y el punto elige entre ellos.

Verificado contra los seis casos que fallaban: acepta Medellín, Cartagena, Cúcuta, Bogotá y Cali, y
rechaza Atrato.

### 2. La precisión más fina que se puede afirmar es «calle»

Nominatim sin número de casa devuelve el centroide de la vía. Para una carrera larga eso queda a
cuadras del portal, y hay casos peores: «Carrera 15 #31-110, barrio El Espinal» de Cartagena
resolvió en **Bayunca**, que es rural y está al norte. Acierta el nombre de la calle, no la cuadra.

Por eso el punto entra con `public_location_precision = 'geocoded'`, **el mapa lo dibuja punteado** y
la ficha lo dice antes de la descripción, no en una nota al pie: alguien puede estar leyéndolo para
decidir si coge el carro.

### 3. Nunca un rescate, nunca un colapso

Lo impone un `CHECK` en la base, no la buena memoria de quien escriba el próximo importador. Un
equipo que va a sacar a alguien de debajo de unos escombros necesita la esquina, no la calle.

### Qué tasa de acierto tiene, de verdad

| Fuente | Intentados | Resueltos | Por qué |
| --- | --- | --- | --- |
| `cuidarcolombia` (pase completo) | 93 | **72 (77 %)** | Direcciones de calle reales, en ciudades grandes, que nadie había geocodificado |
| Sobras de `mapadelterremoto` (muestra) | 25 | **4 (16 %)** | Nominatim ya falló con ellas una vez |

Del pase real de cuidarcolombia: 72 resueltos, 14 sin resultado, **7 rechazados por caer fuera del
polígono de su municipio** —el guardarraíl trabajando— y 25 puntos que no traían dirección.

**La segunda fila es la que ahorra trabajo.** Parecía que había ~2.060 puntos sin coordenada
esperando; son ~177. Los 1.891 de mapadelterremoto ya pasaron por Nominatim —su propio campo
`metodoUbicacion` lo dice— y muchos ni siquiera son direcciones: son frases de nivel municipio
(«Casco urbano de Trujillo», «Cuatro fallecidos reportados en el municipio de…»).

### Somos invitados en su infraestructura

La política de Nominatim limita las tareas en lote a **4 peticiones por minuto** desde una sola
máquina y **exige cachear**. Por eso hay tabla `geocoded_addresses` y por eso se guarda también el
«no se encontró»: sin caché, cada corrida repetiría las mismas consultas cada media hora, que es el
comportamiento que su política llama «faulty» y bloquea.

Es el mismo criterio que con el 403 de Cali y con el fichero de mapadelterremoto: **que se pueda no
significa que se deba a cualquier ritmo.**

---

## Candidatas: rastreadas el 16 de agosto

De las cinco rastreadas, **mapadelterremoto ya está conectada** (arriba) y Bogotá resultó no tener
los datos. Quedan tres, y ninguna publica un fichero como el suyo.

**El criterio no es «tiene API o no».** Es si el acceso está abierto o bloqueado: un `robots.txt`
permisivo y un fichero servido con CORS abierto es una publicación; un 403 es una negativa. Lo
primero se lee, lo segundo no se rodea.

| Candidata | Qué tiene | Cómo se accede | Qué hacer |
| --- | --- | --- | --- |
| [Datos Abiertos Bogotá](https://datosabiertos.bogota.gov.co/) | ~~Acopios oficiales~~ **No existen** | API CKAN abierta, pero sin datos de esta emergencia | **Descartada.** Ver abajo |
| [cuidarcolombia.vercel.app](https://cuidarcolombia.vercel.app/) | 219 registros verificados de 111 fuentes, 13 municipios | Sin API | **Escribirles.** Ya no publican datos personales: misma postura que nosotros |
| [Un Ladrillo por Colombia](https://unladrilloporcolombia.com) | Contadores de ladrillos y casas completadas | Sin API. Publica nombres de donantes | Enlazar. Es reconstrucción (P2), no emergencia |
| [El Tiempo · mapa de acopios](https://www.eltiempo.com/datos/este-es-el-mapa-completo-de-los-centros-de-acopio-habilitados-en-colombia-para-ayudar-a-los-damnificados-del-terremoto-de-magnitud-7-3577654) | Mapa nacional de acopios | Medio de comunicación, no fuente primaria | Usar para localizar la fuente original |

### Bogotá no tenía lo que dijimos que tenía

El rastreo del 16 de agosto anotó el portal de Bogotá como «la única lista para conectar hoy». Al ir
a construirlo, resultó falso. Su API CKAN es abierta y responde bien:

```sh
curl -s "https://datosabiertos.bogota.gov.co/api/3/action/package_search?q=acopio"
```

«acopio», «sismo» y «terremoto» no devuelven nada de esta emergencia, y de los **90 conjuntos
actualizados desde el 1 de agosto ninguno la menciona**. Lo más cercano —la Bitácora de Emergencias
del IDIGER— llega hasta el 31/12/2025 y está bajo **CC-BY-NC**, que nos obligaría a marcar esos
puntos como no reutilizables comercialmente mientras el resto del mapa no lo está.

**Antes de ingerir un portal, lee su `license_id`, no el nombre del portal.** Y verifica que el
conjunto exista antes de escribir el ticket que dice ingerirlo.

Que la única candidata «lista» resultara no existir no debilita el plan: lo confirma. Fuera de Cali
y Pereira no hay acopios oficiales publicados, y no van a aparecer solos. Por eso `P0-9` (pedir) y
`PL-13` (acordar un formato) valen más que cualquier importador nuevo.

### Lo que este rastreo dejó claro

Ver [`35-alianzas.md`](35-alianzas.md) para cómo se abre una conversación con una plataforma.

## Auditoría de rendimiento — 16 de agosto

Correr las once ingestas dice si una fuente responde. No dice **cuánto de lo que responde llega al
mapa**, y esa era la pregunta que no nos habíamos hecho. Comparando lo que cada fuente publica
contra lo que el importador guarda:

| Fuente | Publica | Guardábamos | Diferencia |
| --- | --- | --- | --- |
| `contemos` | 1.906 | 311 | 1.408 son de la diáspora (Chile, Perú, Venezuela, Portugal) · **166 se caían por un bug** |
| `gravitas` | 200 | 181 → **195** | 3 en EE. UU. · 2 `edificio` (excluido por privacidad) · **14 vías, recuperadas** |
| `redcaliayuda` | 500 | 476 | 2 descartadas por traer teléfono · 22 sin coordenada |
| `ayudaspereira` | 571 | 487 | 84 centros sin coordenada — no se pueden pintar |
| `terremotocolombia` | 223 | 223 | — |
| `secop` | 588 | 588 | 27 marcados relevantes para la emergencia |
| `usgs` | 29.412 | 701 | Solo los territorios del incidente. Por diseño |

### Los dos hallazgos

**1. `contemos` descartaba 166 necesidades por su propia categoría válida.** `CATEGORY_MAP` no
incluía `otro` — una categoría que existe en `community_reports` desde la migración `014` y que
contemos usa de verdad. Arreglado: **311 → 476 puntos, +53 %.**

**2. Gravitas publica 14 vías bloqueadas y aeropuertos cerrados que no importábamos.** Cierres por
derrumbe sobre la calzada y aeropuertos sin operación en Cali, Buenaventura, Cartago, Quibdó,
Armenia, Manizales, Pereira, Bogotá e Ibagué. Sin dirección, sin contacto, coordenada a nivel de
ciudad: **cero datos personales.** Un equipo de rescate necesita saber por dónde puede llegar antes
de saber a dónde va.

No se arregló de una línea a propósito. `report_type` solo admitía `rescate`, `pmu` y `necesidad`, y
meter una vía cerrada como PMU le habría dicho a un coordinador que hay un puesto de mando en el
aeropuerto de Buenaventura.

**Resuelto el 16/08 con un tipo propio, `via`** (migración `036_route_reports.sql`). Tres decisiones
que conviene no deshacer:

- **`route_status` es columna, no `metadata`.** `mapCommunityReportSchema` deja fuera todo el jsonb
  para que el mapa no arrastre cientos de KB, y un valor que decide **cómo se pinta el marcador**
  tiene que viajar en la proyección ligera. Es el mismo motivo por el que `signs_of_life` es columna.
- **Una vía reabierta entra igual que una cerrada.** De los 14, el de Bogotá dice «Reabierto,
  monitoreo continuo». Omitirlo dejaría el mapa afirmando un cierre que ya se levantó.
- **La diferencia va en la forma, no solo en el color:** barra de sentido prohibido contra visto,
  dentro del mismo círculo. Quien no separa el grafito del verde sigue sabiendo si puede pasar.

Y no se colorean por estado de revisión, igual que los rescates: de una vía importa si se puede
pasar, no si alguien de Operaciones ya la miró.

Los títulos también se rehicieron. Gravitas los llama «Logistica — Cali», que no dice nada; lo útil
está en `category_fields.detalle`, así que el titular queda «Aeropuerto cerrado — Buenaventura».
Es reordenar lo que ya publicaron, no inventarles nada.

### Lo que se confirmó que está bien

Los **1.408 puntos de contemos fuera de Colombia** no son un fallo: son acopios de la diáspora
colombiana en Santiago, Lima, Caracas y Lisboa. El filtro los descarta a propósito porque el mapa de
Pulso es territorio colombiano. Y las dos categorías excluidas de Gravitas —`persona_disponible` y
`edificio`— siguen fuera por la razón de siempre: pueden señalar el domicilio de una persona.

---

## Calidad conocida

### Resuelto: los títulos que eran direcciones

**677 necesidades mostraban una dirección donde debía decir qué falta.** «Calle 8b 65-295 medellín»,
«Corregimiento bitaco». El importador de `redcaliayuda` usaba `zona` de título.

Arreglado invirtiendo el orden: el título sale de lo que la persona pidió (`cantidad` primero, que
es el texto más concreto), y la dirección se va a `metadata.address`, que es donde se busca una
dirección. Cuando nadie escribió qué necesita, el título dice el tipo —«Alimentos», «Atención
médica», «Evacuación por riesgo estructural»— en vez de fingir precisión.

**Resultado: 677 → 33.** Los 33 que quedan son personas que escribieron su dirección en el campo de
qué necesitan, y ahí ya no hay nada que un importador pueda adivinar sin inventar.

### Lo que el arreglo destapó: una fila tumbaba la lista entera

Recuperar las 166 necesidades de contemos sacó a la luz un fallo que ya estaba ahí. Una persona
escribió un párrafo largo sin comas, así que el único elemento de `needs` pasó de los 400 caracteres
que admite el esquema — y como la ruta pública validaba el lote completo con `.parse()`, **la lista
entera empezó a responder `validation_error` a todo el mundo**. El mapa siguió en pie solo porque
`view=map` no sirve metadata.

Dos fallos distintos, dos arreglos:

1. **Los cinco importadores** armaban `needs` por su cuenta y todos limitaban cuántos elementos
   había, ninguno cuánto medía cada uno. Ahora pasan por `needs-list.ts`. Es la misma lección del
   disparador de redacción: **si la invariante depende de que cada autor se acuerde, no es una
   invariante.**
2. **La ruta ya no deja que una fila decida por las demás.** Cada una se valida sola. En una
   emergencia servir 2.299 puntos vale más que servir cero. Lo que no hace es esconderlo: las
   descartadas se cuentan en `unavailable` y se registran con su identificador, porque un punto que
   desaparece en silencio es peor que uno que falta a la vista.

### Abierto

**184 títulos de contemos son direcciones**, pero esta vez el dato es así en origen: es el campo
`titulo` tal como lo escribió quien reportó allá. Reescribirlo sería editar el registro de otro. Lo
correcto es `PL-13` —acordar un formato— no un parche en nuestro importador.

**28 centros de Ayudas Pereira no tienen coordenada**, y cada uno se lleva por delante sus
necesidades: 28 centros + 56 necesidades = los 84 registros que se pierden. (Antes aquí decía «84
centros sin coordenada». Estaba mal atribuido: se midió la pérdida total y se le puso la causa
equivocada.)

**No se pueden geocodificar con el guardarraíl que tenemos.** Sus centros no traen campo de
municipio —solo `nombre` y `direccion`— y sin municipio declarado no hay polígono contra el que
validar, que es toda la seguridad del proceso. Varios además no tienen dirección aprovechable:
«Minuto», «Universidad libre Belmonte», «Acopio móvil · vamos por las donaciones a dónde necesiten»,
y un «centro de prueba» que la fuente dejó dentro.

Deducir el municipio del texto libre sería adivinar, y adivinar mal pone un acopio en otra ciudad.
El camino correcto es pedirles el campo, no inventarlo.

---

## Cómo se corre una ingesta

```sh
pnpm --filter @pulso/worker ingest:sgc
```

Uno por fuente: `ingest:cali`, `ingest:sgc`, `ingest:dane`, `ingest:contemos`, `ingest:gravitas`,
`ingest:ayudaspereira`, `ingest:terremotocolombia`, `ingest:redcaliayuda`,
`ingest:redcaliayuda-acopio`, `ingest:secop`, `ingest:usgs`.

Cada corrida queda registrada en `source_ingestion_runs` —incluidas las que fallan— con su estado,
código HTTP, número de registros y mensaje de error. Una ingesta que falla en silencio es peor que
una que no corre. Ver [`26-source-ingestion.md`](26-source-ingestion.md).

---

## Añadir una fuente

1. Alta en `external_sources` con su autoridad (`official` / `community`) y su clasificación.
2. Módulo en `apps/worker/src/<fuente>.ts` y entrada `ingest:<fuente>` en el `package.json`.
3. Registrar la corrida con `ingestion-run-log.ts`. **También cuando falle.**
4. `external_key` estable por registro, para poder actualizar sin duplicar.
5. Añadir la fuente a `externalSourceLabels` en `community-report-form.tsx`. Sin esto, sus puntos
   salen en el mapa sin decir de dónde vienen — que es como tener un rumor georreferenciado.

**Antes de escribir código:** comprueba que la fuente no publique datos personales de terceros. Si
los publica, se ingiere solo lo agregado e institucional y se deja constancia aquí de qué se dejó
fuera y por qué.
