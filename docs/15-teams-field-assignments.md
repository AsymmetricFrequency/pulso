# Equipos y asignaciones de campo

Este vertical vincula la coordinación territorial con personas y equipos concretos. Una zona deja de estar simplemente marcada como pendiente: recibe una misión, un equipo responsable y un objetivo verificable.

## Modelo

- **Organización:** entidad responsable de actores y equipos dentro de una emergencia.
- **Actor:** identidad operacional con un rol mínimo; no contiene teléfono, documento ni otros datos sensibles.
- **Equipo:** brigada perteneciente a una organización y emergencia.
- **Membresía:** relación activa entre un actor y un equipo con responsabilidad de líder, integrante o especialista.
- **Asignación:** misión idempotente que vincula equipo, zona, objetivo y ventana temporal.

## Flujo implementado

```text
crear organización → registrar actores → crear equipo → agregar integrantes
→ asignar zona → cobertura pasa a assigned → integrante acepta misión
```

La creación de la misión, el evento de cobertura y la actualización de la zona ocurren en una sola transacción PostgreSQL. También se escribe un evento en la outbox para procesamiento posterior.

## Contratos HTTP

- `GET|POST /v1/incidents/:incidentId/organizations`
- `GET|POST /v1/incidents/:incidentId/actors`
- `GET|POST /v1/incidents/:incidentId/teams`
- `GET|POST /v1/teams/:teamId/memberships`
- `GET|POST /v1/incidents/:incidentId/assignments`
- `POST /v1/assignments/:assignmentId/accept`

## Controles

- Todas las entidades relacionadas deben pertenecer a la misma emergencia.
- Solo un integrante activo del equipo asignado puede aceptar la misión.
- `clientMutationId` hace idempotente la creación y la aceptación.
- Códigos externos de organizaciones e identidades externas de actores son únicos por emergencia.
- La información personal sensible queda fuera de estos contratos operacionales.
- Las restricciones se aplican en los repositorios en memoria y PostgreSQL.

## Persistencia

La migración `004_operations_teams_assignments.sql` crea organizaciones, actores, equipos, membresías y asignaciones, incluyendo índices de consulta y unicidad. Debe ejecutarse después de las migraciones `001` a `003`.

## Próximo incremento

1. Autenticación OIDC y enlace del sujeto autenticado con `actor.externalSubject`.
2. Políticas de autorización por emergencia, rol, equipo y territorio.
3. Paquete offline de misión con zona, objetivo, integrantes y versión.
4. Procesador de sincronización con backoff y recibos.
5. Evidencia fotográfica diferida con hash calculado en el dispositivo.
