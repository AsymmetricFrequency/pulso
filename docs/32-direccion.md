# Dirección del proyecto

Este documento existe porque entró gente al proyecto. Antes bastaba con saber qué seguía; ahora hace
falta que **cualquiera pueda saberlo sin preguntar**, y que dos personas que no han hablado no
construyan la misma cosa ni construyan cosas que no encajan.

Es el documento de arriba. Si algo aquí contradice a otro documento, gana este y hay que corregir el
otro.

---

## 1. La única regla de priorización

Pulso tiene cuatro objetivos y **están ordenados**. No son cuatro áreas paralelas entre las que se
reparte el equipo: son cuatro fases de una misma cadena, y cada una vale menos si la anterior no
funciona.

| | Objetivo | Pregunta que responde | Estado |
| --- | --- | --- | --- |
| **P0** | **Salvar vidas** | ¿Dónde hay gente atrapada y quién puede llegar? | En construcción |
| **P1** | **Saber quién quedó afectado** | ¿Quiénes son, dónde están y qué necesitan? | Solo modelo de datos |
| **P2** | **Conectar la ayuda con quien la necesita** | ¿Qué hay, dónde falta y llegó? | Parcial |
| **P3** | **Trazar la plata pública** | ¿En qué se está gastando y llegó al territorio? | Funcionando |

**Cómo se usa esto para decidir:** ante dos tareas, gana la de prioridad más alta. Siempre. Una
mejora bonita en P3 no pasa antes que un hueco en P0, por más lista que esté.

**La excepción, que es real:** una tarea de P0 bloqueada no bloquea al equipo entero. Si no puedes
avanzar en lo tuyo, baja de prioridad y dilo en el hilo — no te quedes esperando.

### Por qué en ese orden y no en otro

La tentación en un proyecto así es construir lo que se puede medir. La trazabilidad del dinero (P3)
es la más agradecida: hay APIs públicas, los datos llegan solos, se ven bonitas las gráficas. Por eso
hoy es lo más avanzado del proyecto — y por eso hay que decirlo en voz alta: **es la prioridad más
baja de las cuatro.**

Una persona bajo escombros tiene horas. Un damnificado sin censar tiene semanas. Un contrato mal
adjudicado tiene años y tribunales. Construir en orden inverso a la urgencia es el error más fácil
de cometer aquí, y ya lo cometimos una vez.

### El límite de qué es Pulso

Pulso **no despacha equipos de rescate, no reemplaza al 123, no reemplaza el RUFE y no entrega
ayuda.** Es infraestructura de información: hace visible lo que está pasando para que quien sí
despacha pueda decidir mejor y más rápido.

Esto no es modestia, es diseño. Una plataforma que insinúa que enviará ayuda produce gente esperando
en vez de gente llamando al 123, y eso mata. Cualquier texto de la interfaz que sugiera lo contrario
es un bug de prioridad alta. Ver [`25-day-four-affected-people.md`](25-day-four-affected-people.md).

---

## 2. Las cuatro invariantes

Estas no se negocian en un PR. Si tu cambio necesita romper una, **el cambio no entra: se discute en
`#solutions` primero.** Están en [`CONTRIBUTING.md`](../CONTRIBUTING.md) para que nadie las descubra
tarde, y en la plantilla de PR como casilla obligatoria.

**1. Ningún dato personal de terceros entra a la base.** No se importan nombres, teléfonos, fotos ni
historiales desde otras plataformas — ni de personas desaparecidas, ni de damnificados, ni de
mascotas. Da igual que el dato sea público en el sitio de origen. Lo único que se importa de fuentes
externas es información institucional y agregada. Ver [`05-trust-fraud-privacy.md`](05-trust-fraud-privacy.md).

**2. Una máquina no decide, ordena.** Un modelo puede leer, clasificar y priorizar una cola; el campo
del que dependen las cifras públicas lo escribe una persona. El vocabulario de las dos capas se
mantiene distinto a propósito para que nunca se confundan en una consulta. Ver
[`31-contract-triage.md`](31-contract-triage.md).

**3. Cero fabricado.** Si no hay dato, la interfaz dice que no hay dato y por qué. Nunca un número de
relleno, nunca una barra vacía sin explicación. «Cero confirmado» y «cero gastado» son cosas
distintas y hay que decir cuál es.

**4. Corregir agrega, no sobrescribe.** Toda corrección deja historial y procedencia: de qué fuente
salió el dato, cuándo se capturó y quién lo cambió.

---

## 3. Cómo se reparte el trabajo

El eje de reparto son los **roles de Discord**, que son también las etiquetas de los tickets. Un
ticket sin rol es un ticket que nadie va a tomar.

| Rol | De qué responde | Dónde vive el código |
| --- | --- | --- |
| **Frontend** | Informe público, campo, operaciones, diseño | `apps/web` |
| **Backend** | API, contratos, dominio, persistencia | `apps/api`, `packages/` |
| **Data** | Ingesta, fuentes, calidad, deduplicación | `apps/worker` |
| **GIS** | Mapa, territorios, geometrías, proyecciones | `atlas-map`, `leaflet-map`, DANE |
| **DevOps** | Despliegue, CI, migraciones, respaldos, monitoreo | `infrastructure/`, `deploy.sh` |
| **AI** | Triaje, clasificación, deduplicación asistida | `contract-triage.ts` y lo que venga |
| **Blockchain** | Integridad, anclaje de cortes | `blockchain/solana` |
| **Core Contributor** | Puede aprobar PRs de su área | — |
| **Maintainer** | Aprueba cambios de arquitectura, seguridad y privacidad | — |

**Una persona puede tener varios roles.** Lo que no puede pasar es que un área quede sin nadie y con
tickets abiertos: eso se revisa en la reunión semanal y se reasigna.

### Las tres reglas de coordinación

**Un ticket, una persona, una rama.** Nada de dos personas en el mismo archivo sin haberlo hablado.
Si dos tickets se tocan, se dice en el hilo y uno de los dos espera.

**Reclamar antes de empezar.** Comentar el hilo del ticket en Discord y ponerse como *assignee* en
GitHub. Un ticket sin reclamar que lleva 48 horas «en progreso» vuelve a la cola.

**Preguntar barato, equivocarse caro.** Media hora atascado en algo que otro sabe es media hora
perdida. `#solutions` existe para eso.

---

## 4. Los tres horizontes

Lo que sigue es el resumen. El desglose ticket por ticket, con criterios de aceptación y tamaño,
está en [`33-backlog.md`](33-backlog.md).

### Corto plazo — los próximos días

Sacar P0 de «existe el tipo de reporte» a «un rescatista lo usa».

- Cola de rescate en Operaciones, separada del resto y ordenada por señales de vida.
- Que un rescate reportado sin conexión no se pierda: cola offline y reintento.
- Difusión: que la gente en Cali sepa que el botón existe. Sin esto, todo lo demás es teatro.
- Cerrar la brecha de gobernanza: licencia, CI, guía de contribución. **Ya hecho en esta tanda.**

### Mediano plazo — dos a cuatro semanas

Abrir P1 y ordenar la casa.

- API y consola del censo de damnificados: hoy solo existe la migración `012`, cero endpoints.
- Un solo mapa en vez de dos motores, y que agregar o mover un punto no duela.
- Emparejar necesidad con oferta (P2): hoy se ven las dos cosas en el mapa pero nadie las conecta.
- Panel de administración de Pulso conectado a Discord. Ver [`34-discord.md`](34-discord.md).

### Largo plazo — uno a tres meses

Que Pulso siga sirviendo cuando pase la emergencia, y que sirva en la siguiente.

- Convenios con entidades y universidades. Ver [`35-alianzas.md`](35-alianzas.md).
- Interoperabilidad institucional: exportar a los formatos que la UNGRD y las alcaldías ya usan.
- Anclaje de integridad en Solana más allá de Devnet.
- Que el protocolo se pueda desplegar para otro desastre en otro país sin reescribirlo.

---

## 5. Qué está decidido y qué no

Que algo esté en el backlog no significa que esté decidido. Estas son las decisiones abiertas, para
que nadie las tome por su cuenta en un PR:

| Decisión abierta | Quién decide | Por qué importa |
| --- | --- | --- |
| Un solo motor de mapa: cuál | GIS + Maintainer | El intento con MapLibre falló y se revirtió; repetirlo a ciegas cuesta días |
| Copernicus: pedir acceso propio o acordar con Laboratorio TerrarIA | Data + Maintainer | Duplicar el trabajo de otro equipo en plena emergencia es un lujo |
| Licencia de los **datos** (el código ya es Apache-2.0) | Maintainer | Condiciona qué se puede compartir con universidades |
| Alcance del panel de administración | Maintainer | Un panel interno mal medido se come semanas que le tocaban a P0 |

Las decisiones que se van cerrando quedan como ADR en [`decisions/`](decisions/).
