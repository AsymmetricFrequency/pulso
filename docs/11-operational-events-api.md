# Flujos, eventos y contratos de API

## Flujos principales

### Cobertura de campo

```text
crear zona → asignar misión → descargar paquete offline
→ iniciar visita → observar/capturar → finalizar visita
→ sincronizar → revisar → actualizar cobertura
```

### Caso y necesidad

```text
crear caso → adjuntar evidencia → evaluar → identificar necesidad
→ revisar duplicidad → verificar → asignar respuesta → resolver/cerrar
```

### Donación material

```text
registrar oferta → aceptar compromiso → programar recepción
→ recibir lote → inspeccionar → aceptar/cuarentena/rechazar
→ reservar → despachar → confirmar entrega → verificar instalación
```

### Certificación

```text
solicitar revisión → autorizar acceso mínimo → emitir evaluación
→ firmar declaración → registrar vigencia/alcance → revocar o reemplazar
```

## Convenciones API

- Base: `/v1`.
- JSON con nombres `camelCase`.
- IDs UUIDv7 generados por el originador autorizado.
- `Idempotency-Key` obligatorio para comandos repetibles.
- `If-Match` o `baseRevision` para cambios concurrentes.
- Cursores opacos para sincronización y listados grandes.
- Errores con `error`, `message`, `issues` y `requestId`.
- Toda fecha es ISO 8601 con zona u offset.
- Toda cantidad incluye unidad; no existen números de inventario sin unidad.

## Recursos P0/P1

```text
/incidents
/territories
/operational-zones
/organizations
/actors
/teams
/assignments
/visits
/coverage-events
/cases
/needs
/evidence
/assessments
/reviews
/sync/push
/sync/pull

/material-catalog
/material-offers
/material-pledges
/material-lots
/quality-inspections
/warehouses
/inventory-movements
/stock
/allocations
/dispatches
/deliveries
/installations
/recovery-projects
```

## Comandos materiales

```text
POST /v1/material-offers
POST /v1/material-offers/:id/accept
POST /v1/material-lots/:id/receive
POST /v1/material-lots/:id/inspect
POST /v1/inventory-movements
POST /v1/allocations
POST /v1/dispatches
POST /v1/deliveries/:id/accept
POST /v1/installations
GET  /v1/stock?warehouseId=&materialId=&specification=
GET  /v1/material-lots/:id/trace
```

## Ejemplo de recepción

```json
{
  "operationId": "019f...",
  "lotId": "019f...",
  "warehouseId": "019f...",
  "observedAt": "2026-08-14T08:30:00-05:00",
  "declaredQuantity": {
    "value": "200",
    "unit": "bag"
  },
  "measuredQuantity": {
    "value": "10000",
    "unit": "kg"
  },
  "measurement": {
    "method": "package_net_weight",
    "instrumentId": null,
    "conversionRuleId": "cement-bag-50kg-v1"
  },
  "evidenceIds": ["019f..."]
}
```

Las cantidades usan decimales serializados como texto para evitar pérdida de precisión.

## Catálogo de eventos

Eventos de dominio iniciales:

```text
incident.created
territory.imported
assignment.created
visit.started
visit.completed
coverage.updated
case.reported
need.identified
evidence.ready
assessment.submitted
review.decided

material.offer.created
material.pledge.accepted
material.lot.received
material.lot.inspected
inventory.reserved
inventory.dispatched
delivery.accepted
material.installed
inventory.adjusted
```

Cada evento incluye `eventId`, `eventType`, `aggregateId`, `incidentId`, `organizationId`, `actorId`, `occurredAt`, `recordedAt`, `schemaVersion`, `correlationId`, `causationId` y payload validado.

## Outbox e idempotencia

El comando y su evento outbox se guardan en la misma transacción. Un worker publica o procesa el evento; si repite la operación, el consumidor reconoce `eventId`. Integraciones externas también deben enviar una clave idempotente.

## Lecturas operacionales

- Cobertura por zona y última verificación.
- Necesidades abiertas por urgencia y confianza.
- Existencia física, disponible, reservada y en tránsito.
- Diferencias entre prometido, recibido, aceptado, entregado e instalado.
- Trazabilidad completa de un lote.
- Cumplimiento de una lista de cantidades.
- Conflictos, cuarentenas, pérdidas y ajustes pendientes.

## Reglas de publicación

El portal público recibe agregados por territorio y periodo. Donantes individuales, destinatarios, ubicaciones exactas, precios contractuales, resultados privados de inspección y rutas de transporte requieren reglas específicas de acceso.
