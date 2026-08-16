# Fuentes conectadas

Estado verificado el 16 de agosto de 2026 corriendo las once ingestas y consultando la base. No es
una lista de intenciones: cada cifra salió de `source_ingestion_runs`.

**Once fuentes conectadas. Diez funcionan. Una está bloqueada en origen.**

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

## Candidatas: rastreadas el 16 de agosto, ninguna conectada todavía

Cinco plataformas más están publicando sobre este sismo. Ninguna se ingiere aún, y la razón importa:
**solo una tiene datos abiertos con licencia de reutilización.** Las otras exigirían deducir su API
interna, que es exactamente lo mismo que rodear el 403 de Cali — y eso ya está decidido que no se
hace.

| Candidata | Qué tiene | Cómo se accede | Qué hacer |
| --- | --- | --- | --- |
| [mapadelterremoto.com](https://www.mapadelterremoto.com/) | **3.110 puntos en 363 municipios**: 66 edificios colapsados, 2.838 escuelas, 285 centros de salud, 407 vías | Next.js, sin API pública. `robots.txt` permite rastreo | **Escribirles.** Dicen que publicarán en formato abierto tras el 30/11/2026 |
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

**Los 66 edificios colapsados de `mapadelterremoto.com` son P0 puro** —es donde puede haber gente
debajo— y cubren 363 municipios frente a nuestro foco en Cali. Es el dato que más nos falta.

Y no se saca con un scraper. La postura correcta es la misma de siempre: **pedirlo.** Ellos tienen
3.110 puntos y nosotros tenemos procedencia por dato, una regla de privacidad que cumplimos incluso
cuando nos cuesta, y código abierto bajo Apache-2.0. Un intercambio sirve a los dos y sobrevive a
que cambien su frontend; un scraper se rompe el martes y quema la relación.

Ver [`35-alianzas.md`](35-alianzas.md) para cómo se abre esa conversación.

## Auditoría de rendimiento — 16 de agosto

Correr las once ingestas dice si una fuente responde. No dice **cuánto de lo que responde llega al
mapa**, y esa era la pregunta que no nos habíamos hecho. Comparando lo que cada fuente publica
contra lo que el importador guarda:

| Fuente | Publica | Guardábamos | Diferencia |
| --- | --- | --- | --- |
| `contemos` | 1.906 | 311 | 1.408 son de la diáspora (Chile, Perú, Venezuela, Portugal) · **166 se caían por un bug** |
| `gravitas` | 200 | 181 | 3 en EE. UU. · 2 `edificio` (excluido por privacidad) · **14 vías bloqueadas sin dónde ponerlas** |
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

No se arregló de una línea a propósito. `report_type` solo admite `rescate`, `pmu` y `necesidad`, y
meter una vía cerrada como PMU le diría a un coordinador que hay un puesto de mando en el aeropuerto
de Buenaventura. Necesita su propio tipo → ticket **`P0-10`**.

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

### Abierto

**84 centros de Ayudas Pereira no tienen coordenada** y por eso no se pintan. Tienen dirección en
texto. Geocodificarlos es trabajo real —y una dirección mal geocodificada manda a un equipo al lugar
equivocado, que es peor que no mostrarla.

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
