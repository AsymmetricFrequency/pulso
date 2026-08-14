# ADR-006: Outbox transaccional para eventos

- Estado: aceptada
- Fecha: 2026-08-14

## Decisión

La API escribirá el cambio de dominio y el evento pendiente en PostgreSQL dentro de la misma transacción. Workers publicarán o procesarán eventos desde la outbox con consumidores idempotentes.

## Razón

Guardar primero la entidad y luego publicar directamente en una cola permite que uno de los pasos falle y deje el sistema en un estado silenciosamente incompleto.

## Consecuencia

- Los eventos tienen versión de esquema, correlación y causalidad.
- Los consumidores registran eventos ya procesados.
- Reintentos no duplican movimientos, notificaciones ni integraciones.
- Existe una cola de fallos y una herramienta controlada de reproceso.
- La outbox no reemplaza el historial de auditoría ni el libro de inventario.
