# Entes de control y autoridades del censo

Revisión completa de con quién hay que hablar para que el censo de personas afectadas y la
trazabilidad de la ayuda dejen de depender de lo que nosotros podamos deducir. Hecha el 18 de agosto
de 2026.

Complementa [`35-alianzas.md`](35-alianzas.md), que fija la postura general. Este documento es la
lista concreta: quién es cada uno, qué tiene, qué se le pide y por dónde se entra.

---

## Por qué esta conversación es urgente y no puede esperar

El 13 de agosto la **Defensoría del Pueblo** dijo en público que **la falta de censo impide
establecer el número real de afectados** y pidió *«acelerar el censo para establecer el Registro
Único de Damnificados»*. Señaló además inconsistencias entre los registros de fallecidos y
desaparecidos, y pidió que **toda la ayuda pase por las salas de crisis y los PMU** para garantizar
transparencia y trazabilidad.

La **Procuraduría General** mantiene presencia en los PMU de Caldas, Chocó, Quindío, Risaralda y
Valle del Cauca, vigilando respuesta, entrega de ayuda humanitaria, condiciones de albergues y
atención a familias con heridos, fallecidos o desaparecidos. **Contraloría, Procuraduría y
Defensoría** participan juntas en esos espacios pidiendo lo mismo: **trazabilidad**.

Eso significa que la petición que Pulso tiene que hacer no es «déjennos participar». Es **«esto que
ustedes dijeron que falta, nosotros lo tenemos a medias construido; falta el dato que solo ustedes
tienen»**. Es la única vez en la vida de este proyecto en que la puerta está abierta desde el otro
lado.

---

## Lo que ya podemos poner sobre la mesa

Ninguna conversación se abre sin un enlace que demuestre algo funcionando. A hoy hay tres:

| Enlace | Qué demuestra |
| --- | --- |
| `pulso.my/#censo` | **44 municipios donde no ha ido nadie** a censar y 223 con señal y sin censo, cruzando sacudida del USGS con señal ciudadana. Sin un solo dato personal |
| `pulso.my/auditoria#trazabilidad` | La cadena `necesidad → asignación → despacho → entrega` eslabón por eslabón, **con los ceros a la vista** |
| `pulso.my/auditoria` | 733 contratos de SECOP II con su fuente, referencia original y fecha de captura |

Y una decisión de diseño que vale como argumento por sí sola: **la tabla del censo usa los nombres de
columna de la UNGRD y el código DIVIPOLA**. Salen de su propio conjunto abierto en datos.gov.co
(`rgre-6ak4`), que publica `personas`/`familias` reportadas aparte de `rud_personas`/`rud_familias`
inscritas. Lo que nos manden entra sin traducción y lo que salga de aquí lo leen sin traducción.

---

## La lista completa

### 1. UNGRD — Unidad Nacional para la Gestión del Riesgo de Desastres

**Es la pieza que desbloquea todo lo demás.** Opera el RUD, consolida el RUNDA y publica el balance
nacional.

- **Qué tiene:** el consolidado nacional (185.016 personas y 54.382 familias al 16/08; 13.077
  viviendas destruidas, 79.108 averiadas), el esquema del RUD, y un histórico abierto en
  datos.gov.co con la estructura exacta que necesitamos —pero **solo hasta 2024**.
- **Qué se le pide:** el consolidado **por municipio, en formato consultable**. Hoy el balance diario
  se publica como noticia, sin desglose municipal y sin CSV ni API.
- **Cómo se plantea:** no «danos datos», sino **«esto que ya publicaban así, ¿lo pueden seguir
  publicando para esta emergencia?»**. La petición es por agregados, nunca por datos personales.
- **Canales verificados el 18/08:** `correspondencia@gestiondelriesgo.gov.co` ·
  `contactenos@gestiondelriesgo.gov.co` · formulario «Registro de PQRD» en
  `portal.gestiondelriesgo.gov.co/Paginas/PQRSD2.aspx` · Av. Calle 26 No. 92-32, Edificio Gold 4,
  piso 2, Bogotá · (+57) 601-5529696 · línea gratuita 01-8000-113200 · 8:00 a 17:00.
- **Ticket:** `P1-4`. El borrador está al final de este documento.

### 2. Defensoría del Pueblo

**El interlocutor con el incentivo más alineado que vamos a encontrar:** denunciaron públicamente el
problema que nosotros estamos resolviendo a medias.

- **Qué tiene:** presencia en terreno, delegadas por departamento, y la autoridad moral para pedirle
  a otra entidad que comparta un dato. No es dueña del RUD.
- **Qué se le pide:** que sepan que existe `pulso.my/#censo`, porque es su denuncia con números y
  con municipios. Y una hora de alguien que nos diga qué le falta para poder usarlo.
- **Por qué a esta primero:** puede abrir la puerta de la UNGRD mejor que nosotros.
- **Canales verificados el 18/08:** formulario único de peticiones en `defensoria.gov.co` (botón
  «Radique aquí su petición») y en `eliseo.defensoria.gov.co/visionweb/cac2/rupwebx.htm` · línea
  gratuita 01-8000-914-814 · PBX 60 (1) 314-4000 y 314-7300 · app propia · buzones físicos en todas
  sus sedes.

### 3. Procuraduría General de la Nación

- **Qué tiene:** presencia permanente en los PMU de los cinco departamentos, vigilando entrega de
  ayuda y condiciones de albergues. Ve la operación de cerca todos los días.
- **Qué se le pide:** **qué necesitan ver para dar por trazada una entrega.** Esa respuesta define el
  diseño de la vista de auditoría mejor que cualquier suposición nuestra. Hoy la vista existe y
  muestra ceros; que sean ellos los que digan qué columnas faltan.
- **Canal:** PQRSD por su portal. **Sin verificar dirección exacta — confirmar antes de enviar.**

### 4. Contraloría General de la República

- **Qué tiene:** el control fiscal de los recursos de la emergencia.
- **Qué se le pide:** que revisen si `pulso.my/auditoria` les sirve, y qué le falta. Ya tiene 733
  contratos de SECOP II con procedencia y fecha de captura, y el renglón que casi nunca existe:
  **contratos con entrega verificada en territorio, hoy en cero.**
- **Lo que hay que decirles de frente:** de los 733 contratos, solo 32 están revisados por
  relevancia. Ese número está publicado y no lo escondemos.
- **Canal:** PQRSD por su portal. **Sin verificar — confirmar antes de enviar.**

### 5. DANE — Departamento Administrativo Nacional de Estadística

El aliado menos obvio y probablemente el más útil a mediano plazo.

- **Qué tiene:** elaboró el **diccionario de datos del RUD** y ya tuvo el rol de depurar el registro
  contra Registraduría, Procuraduría y SISBEN en la emergencia de 2010. También es la fuente del MGN
  —los polígonos de municipio que ya usamos— y de la proyección de población, que es lo que permite
  decir si «44 municipios sin censar» son 20.000 personas o 400.000.
- **Qué se le pide:** el esquema vigente del RUD, y la proyección de población por municipio para
  poder dimensionar el silencio.
- **Canal:** PQRSD por su portal. **Sin verificar — confirmar antes de enviar.**

### 6. CDGRD — Consejos Departamentales de Gestión del Riesgo

**Chocó, Risaralda, Valle del Cauca, Quindío, Caldas.**

- **Qué tienen:** son quienes coordinan el censo en su departamento y quienes lo cargan al RUD.
- **Qué se les pide:** el estado del censo por municipio —aunque sea «no hemos empezado»—. Nuestra
  tabla `territory_census_status` tiene un estado `sin_iniciar` precisamente para poder recibir esa
  respuesta sin convertirla en un cero engañoso.
- **Por qué importan más que la UNGRD para esto:** el consolidado nacional lo arma la UNGRD con lo
  que ellos cargan. Si un departamento no ha cargado, el nacional no lo sabe tampoco.
- **Prioridad:** **Chocó primero.** De los 44 municipios en silencio, la mayoría son suyos.

### 7. CMGRD y alcaldías

**Los que de verdad censan, casa a casa.**

- **Qué tienen:** las brigadas con el formulario en la mano.
- **Qué se les pide:** dos cosas distintas y hay que no confundirlas. **(a)** El estado de su censo,
  que es un dato agregado y no necesita convenio. **(b)** Si les sirve una herramienta de captura
  offline, que sí lo necesita y es una conversación mucho más larga.
- **Cali** ya respondió una parte sin que preguntáramos: el RUFE es presencial y no hay censo por QR,
  teléfono ni formulario digital. Eso hay que respetarlo literalmente.
- **Pendiente de resolver por la vía correcta:** el bloqueo HTTP 403 de Cali. La vía es `datos.gov.co`
  o una solicitud por Ley 1712 — **nunca rodearlo**, porque saltarse un bloqueo técnico destruye la
  posibilidad de convenio con la misma entidad a la que le vamos a pedir el censo.

### 8. Personerías municipales

- **Qué tienen:** la ruta oficial de personas desaparecidas, con SIRDEC y el Mecanismo de Búsqueda
  Urgente. La Personería de Cali ya recibe declaraciones.
- **Qué se les pide:** **nada de datos.** Aquí la relación es al revés: que sepan que Pulso **no**
  publica listados de personas desaparecidas y que remitimos a su ruta. Es la conversación que evita
  que nos vean como competencia en el tema más delicado que hay.
- **El límite, sin excepción:** `redcaliayuda.vercel.app/personas` no se importa nunca.

### 9. Organismos de socorro — Defensa Civil, Cruz Roja Colombiana, Bomberos

- **Qué tienen:** los equipos en terreno, y la respuesta a la pregunta que define nuestro P0: **qué
  necesita ver un equipo antes de salir a un punto.**
- **Qué se les pide:** esa respuesta, y nada más por ahora.

### 10. MinVivienda y Prosperidad Social

- **Por qué están en la lista:** el censo no es un fin, es la puerta a un subsidio de arriendo o a
  una transferencia. Son quienes convierten «estar en el RUD» en ayuda concreta, y por lo tanto
  quienes mejor saben qué campos del censo son indispensables y cuáles son opcionales.
- **Qué se les pide:** qué campo hace que una familia sea elegible. Es lo que evita que construyamos
  un formulario que recoge lo que no sirve.

### 11. Sistema humanitario internacional — OCHA, HDX

**No es un ente de control, pero es el que ya publica datos abiertos de esta emergencia y no hay que
pedirle permiso a nadie.**

Encontrado el 18/08 en el Humanitarian Data Exchange, con licencia abierta y de esta emergencia:

| Conjunto | Qué trae | Licencia |
| --- | --- | --- |
| Microsoft AI for Good Lab — Cali | Evaluación de daño por IA sobre imagen satelital Airbus del 8–10/08. 621 edificaciones señaladas como dañadas sobre 320.178 huellas de Google; 266 sobre 97.085 de Overture | CC BY |
| Microsoft AI for Good Lab — Pereira | Igual, imagen Vantor del 12/08. 613 dañadas de 75.262 huellas | CC BY |
| HOT OSM — Colombia terremoto agosto 2026 | Edificaciones y vías cartografiadas por la respuesta de mapeo humanitario. **Actualizado el 18/08** | ODbL |

**La advertencia que hay que llevar puesta:** una predicción de un modelo sobre una foto de satélite
no es una edificación evaluada. Es exactamente el mismo tipo de dato que la intensidad del USGS —dice
dónde ir a mirar, no qué pasó— y si se dibuja como daño confirmado, el mapa afirma algo que nadie
verificó. Se ingiere marcado como lo que es o no se ingiere.

**Y una limitación que conviene ver antes de emocionarse:** los dos conjuntos de Microsoft cubren
Cali y Pereira, que son las dos ciudades donde ya tenemos más densidad. **Ninguno cubre los 44
municipios en silencio del Chocó.** Suman verificación cruzada, no cobertura nueva.

---

## Universidades

Ya está en [`35-alianzas.md`](35-alianzas.md). Lo que este documento agrega: hay un trabajo de
dimensionamiento que un semillero de estadística puede hacer mejor que nosotros —cuánta población
vive en los 44 municipios en silencio, con la proyección del DANE— y que convertiría «44 municipios»
en «tantas mil personas de las que no se sabe nada». Ese número es el que mueve a una entidad.

---

## Borrador de la solicitud a la UNGRD

Cierra `P1-4`. Falta que un `Maintainer` lo envíe y anote la respuesta.

> **Asunto:** Solicitud de acceso a información pública — consolidado de damnificados por municipio,
> sismo del 10 de agosto de 2026
>
> Respetados señores:
>
> **No solicitamos datos personales de ninguna persona afectada.** Esta petición es exclusivamente
> por cifras agregadas por municipio.
>
> Somos Pulso (`pulso.my`), una plataforma de código abierto de respuesta a esta emergencia,
> desarrollada de forma voluntaria y publicada bajo licencia Apache-2.0. Publicamos información
> operativa agregada con la fuente y la fecha de captura de cada dato.
>
> Solicitamos, en el formato consultable que tengan disponible (CSV, JSON o servicio web):
>
> 1. El consolidado de personas y familias afectadas **por municipio**, identificado con código
>    DIVIPOLA, para el sismo del 10 de agosto de 2026.
> 2. Cuando esté disponible, la desagregación equivalente de personas y familias **inscritas en el
>    Registro Único de Damnificados**, en el mismo formato en que la UNGRD ya la publica en el
>    conjunto «Emergencias UNGRD 2023-2024» de datos.gov.co, donde figura como `rud_personas` y
>    `rud_familias` de manera separada de las cifras reportadas.
> 3. La periodicidad con que esa información se actualiza.
>
> El motivo de la solicitud es concreto: el 13 de agosto la Defensoría del Pueblo advirtió
> públicamente que la falta de censo impide establecer el número real de afectados. Nuestra
> plataforma publica hoy, con dato oficial del Servicio Geológico Colombiano y del USGS, cuáles
> municipios recibieron sacudida fuerte o severa y no registran todavía ninguna señal de atención
> —44 al día de esta solicitud, la mayoría en el Chocó—. Poder poner al lado la cifra oficial de
> afectados convertiría esa alerta en una herramienta de priorización para las propias autoridades
> territoriales.
>
> Nuestra base de datos ya utiliza los nombres de campo y el código DIVIPOLA del conjunto abierto que
> la UNGRD publica, de modo que la información entraría sin transformación alguna y lo que
> publiquemos a partir de ella sería directamente comparable con sus propios reportes.
>
> Quedamos atentos y agradecemos de antemano su respuesta. En caso de que esta información no se
> publique de forma desagregada, agradeceríamos igualmente la constancia de ello, para poder
> indicarlo con precisión en nuestra plataforma en lugar de dejar el dato vacío sin explicación.
>
> Cordialmente,
> [nombre] — [rol] · Pulso · `pulso.my` · [correo]
>
> *Solicitud presentada en ejercicio del derecho de petición y de la Ley 1712 de 2014 de
> transparencia y acceso a la información pública.*

---

## Reglas que aplican a todas estas conversaciones

1. **Datos personales de terceros: no.** Aunque los ofrezcan y aunque sea más cómodo. Que sea la
   primera frase de cada solicitud, porque le quita a la entidad el mayor motivo para decir que no.
2. **Un solo interlocutor por entidad.** Dos personas del proyecto pidiendo cosas distintas a la
   misma entidad nos quema. Queda anotado en `#announcements` quién habló con quién.
3. **Una petición concreta y pequeña.** Un archivo, un esquema, una hora de alguien. Nunca un
   convenio marco de entrada: eso llega después de que algo pequeño ya funcionó entre los dos.
4. **Los bloqueos técnicos no se rodean.** El 403 de Cali se resuelve por Ley 1712 o no se resuelve.
5. **Lo que no está verificado se marca como no verificado**, incluidos los canales de contacto de
   este documento.
