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
duplicate_candidates
review_decisions
sync_operations
audit_events
```

## Campos transversales

Las entidades mutables usan `UUIDv7`, `incident_id`, `created_at`, `created_by`, `updated_at`, `revision`, `status` y `deleted_at`. El borrado operacional es lógico y auditable.

## Observaciones, no sobrescrituras

Daños, necesidades y evaluaciones se modelan como observaciones anexables. Una evaluación profesional no sustituye el reporte original; añade una declaración con autor, alcance, fecha y nivel de confianza.

## Datos geográficos

PostGIS almacena puntos y polígonos en WGS84. Toda ubicación capturada incluye precisión cuando esté disponible. La geometría pública se generaliza o agrega antes de salir de la frontera privada.
