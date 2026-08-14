# Sincronización offline

## Modelo local

Cada dispositivo mantiene en IndexedDB:

- Misiones y territorios asignados.
- Formularios y catálogos necesarios.
- Entidades creadas o modificadas.
- Evidencias pendientes de carga.
- Cola append-only de operaciones.
- Último cursor confirmado por el servidor.

## Operación

```json
{
  "operationId": "uuidv7",
  "deviceId": "uuid",
  "entityType": "case",
  "entityId": "uuidv7",
  "action": "create",
  "baseRevision": 0,
  "occurredAt": "2026-08-13T21:35:00-05:00",
  "idempotencyKey": "uuid",
  "payload": {}
}
```

## API

- `POST /v1/sync/push`: recibe lotes idempotentes y devuelve operaciones aceptadas, rechazadas o en conflicto.
- `GET /v1/sync/pull?incidentId=&cursor=`: devuelve cambios paginados y un cursor opaco.

## Conflictos

Evidencias, observaciones, necesidades y visitas se combinan como colecciones. Identidad del hogar, ubicación principal, desaparecidos, habitabilidad y cierre requieren revisión cuando divergen. Verificación, duplicidad, permisos y auditoría son controlados por el servidor.

Nunca se usa `last write wins` para campos críticos.
