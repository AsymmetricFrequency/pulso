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

## Calidad conocida

**677 necesidades caen en la categoría `otro`** — el 30 % del total. Al mirarlas no son necesidades:
son direcciones. «Calle 8b 65-295 medellín», «Corregimiento bitaco». El importador de
`redcaliayuda` pone la ubicación en el título y deja la necesidad real en `metadata.needs`, que
existe en 452 de ellas y no se usa.

Consecuencia: la página pública dice «1.565 necesidades» y una de cada tres no dice qué necesita.
Es un problema de honestidad del dato, no de estética, y no tiene ticket todavía.

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
