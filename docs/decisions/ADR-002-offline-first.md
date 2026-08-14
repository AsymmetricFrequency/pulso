# ADR-002: Captura offline como requisito estructural

- Estado: aceptada
- Fecha: 2026-08-13

## Decisión

La aplicación de campo mantendrá una base local y una cola append-only de operaciones. La sincronización será idempotente y basada en revisiones y cursores.

## Razón

Las zonas más afectadas pueden perder conectividad durante horas o días. Una aplicación dependiente de red excluiría precisamente los territorios prioritarios.

## Consecuencia

Cada función de campo debe probarse con desconexión, reinicio del dispositivo, operaciones concurrentes y recuperación posterior.
