# Trazabilidad de recursos públicos (P0)

## Decisión

Pulso deja de terminar en "qué está pasando" y empieza a responder "con qué dinero". El P0 sigue el
orden que fija el plan técnico: dominio, migraciones, procedencia y adaptadores — sin interfaz
nueva, porque una pantalla sobre un modelo que todavía no representa bien un contrato solo
adelanta el error.

## Paso 1: qué ya existía

La auditoría previa encontró bastante más construido de lo que el plan asumía:

| Concepto del plan | Ya existe en el repo | Estado |
| --- | --- | --- |
| Person / Household / AffectedPlace | `affected_people`, `affected_households`, `affected_places` | Completo, con identidad cifrada |
| DisasterCase con 8 estados | `disaster_cases.status` | **Los ocho estados ya estaban literalmente** |
| SourceClaim | `case_source_claims` | Completo, con procedencia y consentimiento |
| Cola de duplicados | `possible_case_matches` | Completo, con revisión humana |
| Procedencia de fuente | `external_sources`, `source_ingestion_runs`, `source_records`, `source_record_versions` | Completo (raw + hash + versiones) |
| FieldVisit | `field_visits` | Completo, con traza GPS |
| Need / AidDelivery | `supply_needs`, `aid_deliveries` | Completo |

Es decir, los pasos 4 (estados de caso) y buena parte del 5 (visitas de campo) del plan **ya
estaban hechos**. El hueco real era uno solo y era el central: **del dinero público no había nada**.

Lo que sigue faltando del P0: `OfficialRegistry`/`HouseholdRegistryLink` (paso 3), `FieldMission`
como asignación con estados (paso 5), y `SourceDocument` para conservar el PDF/XLSX original.

## Paso 2: el núcleo (migración `020_public_funds.sql`)

```text
provenance_records ──> procurement_processes ──> contracts ──> funding_flows ──> delivery_links
                                                     │                                  │
                                              public_entities                    aid_deliveries
                                              funding_sources                    supply_needs
                                                                                 disaster_cases
```

**El dinero se guarda como recorrido, no como saldo.** Una cifra anunciada no equivale a dinero
disponible, contratado ni pagado, y confundirlas es el error que vuelve inútil a la mayoría de
tableros de emergencia. `funding_flows` registra cada etapa —`announced`, `appropriated`,
`available`, `committed`, `in_procurement`, `contracted`, `obligated`, `paid`, `delivered`,
`verified_in_territory`— con su monto, su fecha y la fuente que la respalda.

`provenance_records` implementa la procedencia obligatoria del plan (sistema, referencia original,
URL, hash del contenido, versión del parser, fechas de captura/publicación/vigencia). Va en tabla
propia y no como columnas repetidas porque un mismo registro de origen sustenta a la vez el
proceso, el contrato y sus flujos; duplicar los campos garantizaría que se desincronicen.

`delivery_links` es el eslabón que distingue a Pulso de un visor de contratación: SECOP termina en
"pagado" y ahí empieza la pregunta de si eso llegó a alguna parte. Se deja deliberadamente sin
poblar por ingesta automática, porque ninguna fuente publica ese vínculo.

## Paso 7: adaptador de SECOP II

Fuente: `datos.gov.co/resource/jbjy-vk9h` (contratos electrónicos de Colombia Compra Eficiente).
Legible por máquina, incremental y con identificador estable — exactamente lo contrario del HTML
raspado que hoy responde 403 desde el servidor (ver [`26-source-ingestion.md`](./26-source-ingestion.md)).

Dos decisiones salieron de mirar los datos reales, no de suponerlos.

### La cédula del proveedor no se guarda

En la contratación municipal la mayoría de contratos son de prestación de servicios con personas
naturales, y ahí `documento_proveedor` es una cédula. Que SECOP la publique no obliga a Pulso a
replicarla: es el mismo dato personal que el proyecto se niega a importar en cualquier otro
contexto. Se conserva el **nombre** —que es el objeto de rendición de cuentas de un contrato
público— y una **huella derivada del documento**, salada por incidente, que permite seguir
detectando al mismo proveedor repetido entre contratos sin almacenar el número. El documento solo
se guarda cuando es un NIT, es decir cuando la contraparte es una persona jurídica.

Tampoco se importa nada que no sirva para rastrear el recurso y sí exponga a personas: número de
cuenta bancaria, ni nombre, documento, domicilio, género o nacionalidad del representante legal y
del supervisor.

### Un contrato firmado después del sismo no es un contrato de la emergencia

De los **357 contratos reales** firmados en Cali desde el 10 de agosto, **356 son la operación
ordinaria del municipio** — prestación de servicios profesionales, sobre todo. Presentarlos juntos
bajo "recursos de la emergencia" habría reclamado **COP 28.582 millones** de gasto de emergencia
que no existe.

Por eso `contracts.emergency_relevance` es explícito y el clasificador automático **nunca
confirma**: su techo es `probable`. No es prudencia genérica. La primera corrida sobre los datos
reales devolvió un único candidato y era un falso positivo — *"servicios de apoyo en el área de
albergue y clínica acompañando los procesos de adopción de animales"*. La palabra «albergue»
aparecía, pero se trataba de un albergue de animales. Un contador de palabras no distingue eso y
ninguna cantidad de términos adicionales lo arreglaría; lo que cambia el resultado es que alguien
lea el objeto.

Tampoco devuelve `unrelated`: la ausencia de señales significa que no se encontró evidencia, no que
exista evidencia de lo contrario. Descartar también es una afirmación.

## Paso 8: proyección pública

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/v1/public/incidents/:code/funds` | Totales por etapa, conteo de revisión, territorios y fuentes |
| `GET` | `/v1/public/incidents/:code/contracts` | Contratos con procedencia; filtros `relevance`, `territoryCode`, `limit` |
| `GET` | `/v1/operations/incidents/:id/contracts` | Cola de revisión (sesión de Operaciones) |
| `POST` | `/v1/operations/incidents/:id/contracts/:contractId/review` | Decisión humana (rol `coordinator` o `incident_admin`) |

**El resumen solo suma lo confirmado por una persona.** La lista, en cambio, no filtra por defecto:
esconder los contratos sin revisar los volvería invisibles y nadie podría revisarlos. Cada contrato
viaja con su procedencia —sistema, referencia original, hash, versión del parser, fecha de
captura— para que cualquiera pueda volver al dato en su fuente.

Estado real hoy en producción: 357 contratos ingeridos, 0 confirmados, 1 candidato, 356 sin
revisar, y por lo tanto **cero pesos publicados como gasto de emergencia**. Es el estado honesto: el
ciclo de revisión humana todavía no existe.

## Revisión humana (migración `021_contract_review.sql`)

Es la pieza que convierte la ingesta en cifra publicable. El centro operacional muestra una cola
ordenada por lo pendiente y, dentro de eso, por monto descendente, con los candidatos del
clasificador primero: nadie revisa 357 contratos de una sentada, y revisar el de siete mil millones
rinde más que el de cinco.

Cada tarjeta muestra **el objeto contractual completo y sin truncar** —es el único dato que
distingue un albergue de damnificados de uno de animales—, las señales que levantó el clasificador,
el proveedor, la modalidad y el enlace directo a SECOP.

Hay **tres** decisiones, no dos: *es de la emergencia*, *no está relacionado* y *no me alcanza para
decidir*, que devuelve el contrato a la cola. Forzar un sí o un no produciría confirmaciones sin
fundamento, que es justo lo que este flujo existe para evitar. La nota de la decisión queda
guardada junto con quién revisó y cuándo.

La revisión humana **sobrevive a la reingesta**: el upsert de SECOP preserva `confirmed` y
`unrelated` frente a lo que proponga el clasificador en la siguiente corrida.

## Qué falta para que esto muestre dinero

1. **Presupuesto, no solo contratación**: SECOP empieza en `contracted`. Las etapas `announced`,
   `appropriated` y `available` requieren actos administrativos y ejecución presupuestal, que hoy
   no son legibles por máquina — es el caso de uso de `information-requests` (Ley 1712).
3. **`delivery_links` poblado**: conectar un contrato con una entrega, una necesidad cerrada o un
   caso de reconstrucción. Es trabajo de campo y de Operaciones, no de ingesta.
4. **Pagos individuales**: SECOP publica agregados por contrato (`valor_facturado`, `valor_pagado`),
   no órdenes de pago. El detalle exige solicitud formal.
