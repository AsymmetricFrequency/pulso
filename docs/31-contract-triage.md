# Lectura previa de contratos con Claude

## El problema

Al conectar SECOP II entraron 357 contratos de entidades de territorios afectados, firmados después
del sismo. Ninguno estaba revisado, y la cola de Operaciones solo sabía ordenarlos por monto: quien
revisara empezaba por contratos de educación, de arbolado y de protección del recurso hídrico antes
de encontrar uno de la emergencia.

El clasificador por palabras clave de `secop.ts` no ayudaba. Sobre esos mismos 357 contratos
devolvió **un solo candidato**, y era un falso positivo:

> «servicios de apoyo en el área de albergue y clínica acompañando los procesos de adopción de
> animales»

La palabra «albergue» estaba ahí. Era un albergue de animales. Ese error no se arregla agregando
términos a una lista — se arregla leyendo el objeto, y eso es lo que aquí se automatiza.

## Lo que hace y lo que no

`apps/worker/src/contract-triage.ts` lee cada contrato con Claude y escribe su opinión en columnas
propias: `triage_verdict`, `triage_confidence`, `triage_rationale`, `triage_model`, `triage_at`.

**No toca `emergency_relevance`.** Ese campo —el único que suman las cifras públicas— lo escribe
una persona desde Operaciones. El vocabulario del triaje es distinto a propósito
(`likely`/`unlikely`/`unclear` frente a `confirmed`/`unrelated`/`probable`) para que una opinión de
máquina y una decisión humana no puedan confundirse en una consulta ni en la interfaz.

El aporte es de **orden**, no de criterio: la cola pasa de 357 contratos sin jerarquía a los
candidatos primero. La decisión sigue costando lo mismo; encontrarla cuesta mucho menos.

## Decisiones de diseño

**El proveedor no se envía.** `TriageInput` no incluye `supplierName`. Una parte de los contratos
públicos colombianos los firman personas naturales, así que ese campo contiene nombres de terceros,
y el proyecto no manda datos personales a servicios externos. Tampoco haría falta: lo que decide si
un contrato es de la emergencia es su objeto. Hay una prueba que lo fija
(`contract-triage.test.ts`) para que nadie lo agregue "porque da contexto".

**`unclear` es una respuesta válida.** Si todo tuviera que caer en likely/unlikely, los dudosos
contaminarían ambos lados y la cola volvería a no ordenar nada.

**Un contrato por petición.** Son textos cortos y así el trabajo es reanudable: el filtro es
`triage_at IS NULL`, de modo que una corrida interrumpida no vuelve a pagar lo ya leído. Los 357
contratos cuestan alrededor de 3 USD en total.

**`effort: "low"` y structured outputs.** Clasificar contra una regla explícita no necesita
razonamiento profundo, y el esquema JSON garantiza la forma de la respuesta sin parseo a mano ni
reintentos.

**La sugerencia va debajo del objeto en la interfaz, no encima.** Quien revisa lee primero el
contrato y después lo que opinó la máquina. Al revés se ancla en la sugerencia, que es justo el
sesgo que este flujo existe para evitar.

## Cómo se corre

Requiere `ANTHROPIC_API_KEY` en el `.env`. No está configurada en el servidor.

```sh
pnpm --filter @pulso/worker triage:contracts
# PULSO_TRIAGE_LIMIT=20 para probar con una tanda pequeña primero
```

Devuelve cuántos leyó, cuántos fallaron y el reparto por veredicto. Un contrato que falla no
detiene la tanda, pero se cuenta y se reporta.

## Migración

`023_contract_triage.sql` — aplicada en producción el 16 de agosto de 2026. Los 357 contratos
quedaron pendientes de lectura.
