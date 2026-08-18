# Entidades públicas y universidades

Pulso llega tarde a una mesa donde ya hay gente sentada. La UNGRD, las alcaldías, los organismos de
socorro y varias universidades llevan años en esto, y en esta emergencia ya hay al menos siete
plataformas ciudadanas mapeando lo mismo que nosotros.

Eso define la postura: **Pulso no compite por ser la plataforma; compite por ser el conector.** El
argumento no es «úsennos a nosotros», es «esto que ya tienen, ¿lo pueden ver junto con lo demás?».

---

## Qué ofrecemos y qué pedimos

Antes de escribirle a nadie hay que tener claro esto, porque una reunión sin una petición concreta no
produce nada.

**Lo que Pulso pone:**

- una imagen operacional común sobre datos que hoy están en cinco sitios distintos;
- procedencia de cada dato: de qué fuente salió, cuándo se capturó, quién lo cambió;
- código abierto bajo Apache-2.0, auditable y desplegable por cualquiera;
- trazabilidad de contratación pública ya funcionando sobre SECOP II;
- una postura de privacidad más estricta que la de la mayoría de plataformas ciudadanas: no
  publicamos nombres, teléfonos ni ubicaciones exactas de hogares.

**Lo que Pulso pide, según con quién:**

| Interlocutor | La petición concreta |
| --- | --- |
| **Alcaldías** | Datos abiertos en formato consultable — no PDF. Y el formato en que ellos quieren recibir de vuelta |
| **UNGRD / Gestión del Riesgo** | El esquema del RUFE, para poder referenciar sin duplicar el censo |
| **Organismos de socorro** | Qué necesita ver un equipo antes de salir a un punto. Es la pregunta que define P0 |
| **Universidades** | Personas: semilleros de GIS, datos y desarrollo. Y validación metodológica |
| **Plataformas ciudadanas** | Un formato común de intercambio, para dejar de duplicar trabajo |

---

## El límite que no se cruza en ninguna conversación

Cuando una entidad ofrezca compartir datos, la respuesta a **datos personales de terceros es no**,
aunque nos los ofrezcan y aunque sea más cómodo. Ver la invariante 1 de
[`../CONTRIBUTING.md`](../CONTRIBUTING.md).

Lo que sí se puede recibir: agregados por territorio, referencias de caso sin identificadores, y
esquemas de datos. Lo que se puede construir es una **referencia cruzada** — que un caso de Pulso
apunte a un registro oficial sin copiarlo.

Esto además es un argumento de venta, no un obstáculo. Una entidad pública sabe que compartir datos
personales con un tercero le crea un problema de habeas data; que la primera frase de la conversación
sea «no queremos sus datos personales» quita el mayor motivo para decir que no.

Dos casos concretos ya vividos:

- **El bloqueo HTTP 403 de Cali no se rodea.** El camino correcto es `datos.gov.co` o una solicitud
  formal por Ley 1712. Saltarse un bloqueo técnico destruye la posibilidad de un convenio.
- **`redcaliayuda.vercel.app/personas` no se importa nunca.** Son personas desaparecidas con datos
  personales; ese listado tiene su ruta institucional propia (SIRDEC y el Mecanismo de Búsqueda
  Urgente) y no pasa por aquí.

---

## Universidades

Es el aliado más natural y el menos aprovechado: hay semilleros de investigación que necesitan
exactamente lo que nosotros necesitamos que alguien haga.

**Qué se les puede proponer, en orden de qué tan fácil es decir que sí:**

1. **Un semillero toma un módulo.** GIS es el encaje más directo: `PL-1` y `PL-2` del backlog son un
   semestre de trabajo real para un semillero de geomática, con un producto desplegado al final.
2. **Práctica o trabajo de grado.** El censo de damnificados (`P1-1`) tiene la complejidad de
   modelado que un trabajo de grado en ingeniería de sistemas necesita.
3. **Validación metodológica.** La deduplicación sin exclusión (`P1-3`) es un problema estadístico
   con consecuencias éticas reales — le sirve a un grupo de estadística o de ciencia de datos.
4. **Convenio de datos.** Lo más lento y lo que más tarda en dar fruto. No empezar por aquí.

**Qué hace falta de nuestro lado antes de tocar una puerta:** existe la licencia (Apache-2.0), existe
la guía de contribución, existe el backlog con criterios de aceptación. Un semillero puede entrar sin
que nadie le explique nada en una llamada. Eso **ya está listo** desde esta tanda de trabajo — antes
no lo estaba, y era la razón real por la que no se podía delegar.

---

## Cómo se llega

**Regla:** ninguna conversación institucional se abre sin tener a mano un enlace que demuestre algo
funcionando. `pulso.my/auditoria` sirve: es contratación pública real, con enlace a la fuente y fecha
de captura. Una presentación de lo que Pulso *va a ser* no abre ninguna puerta.

**Quién habla.** Un `Maintainer`, y queda anotado en `#announcements` quién habló con quién y qué se
acordó. Dos personas del proyecto pidiendo cosas distintas a la misma entidad nos quema.

**Qué se lleva a una primera reunión:**

- el enlace funcionando;
- una petición concreta y pequeña — un archivo, un esquema, una hora de alguien;
- el límite de privacidad dicho de entrada;
- lo que ofrecemos de vuelta, con fecha.

**Qué no se lleva:** una propuesta de convenio marco. Eso llega después de que algo pequeño ya haya
funcionado entre los dos.

---

## Estado

Ninguna alianza formalizada todavía. Esta sección se actualiza a medida que haya algo real que
anotar — y hasta que lo haya, dice esto, porque la invariante 3 (cero fabricado) también aplica a los
documentos internos.

| Entidad | Estado | Quién | Próximo paso |
| --- | --- | --- | --- |
| — | — | — | — |
