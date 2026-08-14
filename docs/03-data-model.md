# Modelo de datos

## Jerarquía territorial

```text
Incident
  Territory
    OperationalZone
      Assignment
        FieldVisit
          Case
            Evidence
            Assessment
            Need
```

## Tablas iniciales

```text
incidents
territories
operational_zones
organizations
actors
team_memberships
field_assignments
field_visits
coverage_events
cases
case_locations
households
household_members
evidence
assessments
needs
material_catalog_items
material_specifications
material_offers
material_pledges
material_lots
quality_inspections
warehouses
inventory_movements
material_allocations
dispatches
deliveries
installation_events
recovery_projects
bill_of_materials
duplicate_candidates
review_decisions
sync_operations
audit_events
outbox_events
```

## Campos transversales

Las entidades mutables usan `UUIDv7`, `incident_id`, `created_at`, `created_by`, `updated_at`, `revision`, `status` y `deleted_at`. El borrado operacional es lógico y auditable.

## Observaciones, no sobrescrituras

Daños, necesidades y evaluaciones se modelan como observaciones anexables. Una evaluación profesional no sustituye el reporte original; añade una declaración con autor, alcance, fecha y nivel de confianza.

## Datos geográficos

PostGIS almacena puntos y polígonos en WGS84. Toda ubicación capturada incluye precisión cuando esté disponible. La geometría pública se generaliza o agrega antes de salir de la frontera privada.

## Cantidades y unidades

Las cantidades físicas usan decimal exacto, dimensión, unidad original y unidad canónica. Las conversiones se representan como datos versionados y no como constantes ocultas en la interfaz. Materiales con especificaciones incompatibles permanecen separados aunque compartan unidad.

## Inventario

`inventory_movements` es append-only. Las existencias, reservas y materiales en tránsito son proyecciones calculadas por lote y ubicación. Una corrección referencia el movimiento corregido y registra un movimiento compensatorio.

## Eventos e integraciones

`outbox_events` se escribe en la misma transacción que el agregado. Los consumidores registran los eventos procesados para asegurar idempotencia.
