# Persistencia y visitas de campo offline

Este incremento activa el límite entre desarrollo local y operación persistente. La API conserva los mismos contratos con un repositorio en memoria o con PostgreSQL/PostGIS; el servidor selecciona el adaptador mediante `PERSISTENCE_DRIVER`.

## Activación

1. Crear una base PostgreSQL con PostGIS.
2. Ejecutar en orden `001_foundation.sql`, `002_territory_coverage.sql` y `003_field_offline.sql`.
3. Configurar `DATABASE_URL`.
4. Iniciar la API con `PERSISTENCE_DRIVER=postgres`.

Si el selector no se define, la API usa memoria deliberadamente. Una URL presente por sí sola no cambia el modo, evitando conexiones accidentales desde pruebas o desarrollo.

## Flujo de visita

1. El dispositivo crea un `clientMutationId` UUID y guarda el inicio en IndexedDB.
2. Envía `POST /v1/operational-zones/:zoneId/field-visits` al recuperar conectividad.
3. El servidor devuelve la visita existente cuando recibe nuevamente la misma mutación.
4. El inicio mueve la zona a `in_progress` y agrega un evento de cobertura.
5. El cierre usa `POST /v1/field-visits/:visitId/complete` con otro identificador estable.
6. El resultado `completed` se traduce a cobertura `visited`; parcial, inaccesible y nueva visita conservan su semántica propia.

También se puede consultar `GET /v1/operational-zones/:zoneId/field-visits`.

## Garantías actuales

- Inicio idempotente por emergencia y mutación de cliente.
- Inicio, evento de cobertura y actualización de zona son una transacción PostgreSQL.
- Cierre, evento final y actualización de cobertura también son una transacción.
- El servidor rechaza un cierre anterior al inicio y resultados contradictorios.
- La traza de recorrido se conserva como `LineString` WGS84 con índice espacial.
- La interfaz ya crea una cola durable en IndexedDB y conserva una identidad estable del dispositivo.

## Límite de esta entrega

La cola del navegador captura borradores, pero todavía no los despacha automáticamente porque la pantalla de demostración no está vinculada a una emergencia, zona y sesión autenticada reales. El siguiente incremento debe conectar selección de zona, autenticación de brigada, reintentos con backoff y recibos de sincronización.

## Siguiente incremento

1. Ejecutar PostgreSQL/PostGIS en un entorno disponible y añadir prueba de integración.
2. Crear equipos, integrantes y asignaciones con permisos por emergencia.
3. Vincular la aplicación de campo a zonas reales descargadas para trabajo offline.
4. Implementar el procesador de cola, resolución de conflictos y recibos.
5. Adjuntar evidencia fotográfica mediante carga diferida y hash local.
