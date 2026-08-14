# Vertical territorial y de cobertura

Este vertical convierte el mapa en una herramienta operacional. Su unidad de trabajo no es el departamento completo, sino una **zona operativa** delimitada para una emergencia concreta. Cada cambio de cobertura se registra como evento y conserva su hora de ocurrencia.

## Flujo implementado

1. Se crea una emergencia.
2. Se importa una capa GeoJSON de territorios oficiales o propios.
3. Coordinación divide el territorio en zonas operativas y asigna una prioridad de 1 a 5.
4. Campo reporta eventos: asignada, en curso, parcial, visitada, inaccesible o requiere nueva visita.
5. El estado visible de la zona es el último evento aceptado; el historial no se sobrescribe.

La primera capa incluida es el GeoJSON simplificado de departamentos de Colombia, con código y nombre derivados del [servicio geográfico oficial del DANE](https://geoportal.dane.gov.co/mparcgis/rest/services/Hosted/InventarioGestores/FeatureServer/2). Los colores mostrados inicialmente en la interfaz son sintéticos y están rotulados como demostración: no representan afectación real.

## Contratos HTTP

- `POST /v1/incidents/:incidentId/territories/import`
- `GET /v1/incidents/:incidentId/territories`
- `POST /v1/incidents/:incidentId/operational-zones`
- `GET /v1/incidents/:incidentId/operational-zones`
- `GET /v1/incidents/:incidentId/coverage`
- `POST /v1/operational-zones/:zoneId/coverage-events`
- `GET /v1/operational-zones/:zoneId/coverage-events`

## Persistencia

La migración `002_territory_coverage.sql` agrega zonas, visitas de campo, eventos de cobertura y outbox transaccional. Todas las geometrías usan WGS84 (`SRID 4326`), tienen índices GiST y permanecen vinculadas a una emergencia. El índice de importación evita repetir un territorio por código externo.

El repositorio en memoria permite desarrollar y probar sin infraestructura local. La fuente de verdad de un despliegue operativo será PostgreSQL con PostGIS; el siguiente paso de infraestructura es activar su adaptador y ejecutar la prueba de integración contra una instancia real.

## Decisiones de integridad

- Los eventos son append-only; corregir implica agregar otro evento.
- `occurredAt` distingue el momento de campo de `recordedAt`, importante durante sincronización offline.
- Una zona incrementa su revisión en cada transición para preparar control de concurrencia.
- Una clave de idempotencia opcional impide duplicados al reintentar sincronizaciones.
- Las zonas inaccesibles son un resultado operacional, no equivalen a zonas visitadas.

## Siguiente incremento

1. Adaptador PostgreSQL/PostGIS y ejecución automatizada de migraciones.
2. Creación y edición de zonas desde el mapa.
3. Visita de campo offline con punto de inicio, evidencia y cierre.
4. Equipos, asignaciones y permisos por incidente.
5. Agregación espacial de cobertura y detección de solapamientos.
