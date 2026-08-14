# Cobertura completa de arquitectura

Este documento define el mapa funcional que debe quedar acordado antes de levantar servicios adicionales. No implica convertir cada dominio en un microservicio: durante el P0 permanecen como módulos del monolito.

## Dominios

| Dominio | Responsabilidad | Fuente de verdad | Fase |
|---|---|---|---|
| Incidentes | Configuración y ciclo de cada emergencia | PostgreSQL | P0 |
| Territorios | Límites, zonas operativas, acceso y cobertura | PostgreSQL/PostGIS | P0 |
| Identidad | Actores, organizaciones, equipos y dispositivos | PostgreSQL + proveedor OIDC | P0 |
| Autorización | Permisos por emergencia, organización, rol y territorio | PostgreSQL/políticas | P0 |
| Misiones | Asignaciones, objetivos, visitas y resultados | PostgreSQL | P0 |
| Casos | Hogares, activos, infraestructura, personas y animales | PostgreSQL | P0 |
| Necesidades | Qué se requiere, cuánto, dónde, prioridad y estado | PostgreSQL | P0 |
| Evidencia | Archivos, metadatos, hashes y cadena de custodia | S3 + PostgreSQL | P0 |
| Evaluaciones | Daño, habitabilidad, salud y certificaciones | PostgreSQL | P0/P1 |
| Revisión | Conflictos, duplicidad, fraude y decisiones humanas | PostgreSQL | P0 |
| Materiales | Catálogo, especificaciones, unidades y equivalencias | PostgreSQL | P1 crítico |
| Donaciones físicas | Ofertas, compromisos, recepción e inspección | PostgreSQL | P1 crítico |
| Inventario | Existencias por lote, ubicación y condición | Libro de movimientos PostgreSQL | P1 crítico |
| Logística | Reserva, despacho, transporte, recepción y devolución | PostgreSQL | P1 crítico |
| Reconstrucción | Presupuestos de materiales, instalación y avance | PostgreSQL + evidencia | P1 |
| Ayuda no material | Servicios, alojamiento, transporte y horas de equipo | PostgreSQL | P1 |
| Donaciones financieras | Promesa, recepción, restricción, asignación y desembolso | Sistema financiero integrado | P2 |
| Comunicaciones | Alertas, notificaciones y confirmaciones | Cola + proveedores | P1 |
| Auditoría | Historial de cambios y eventos encadenados | PostgreSQL append-only | P0 |
| Portal público | Datos agregados, transparencia y rendición de cuentas | Proyecciones de lectura | P1 |
| Integraciones | Importación, exportación, webhooks y estándares | API/colas | P1 |

## Capas técnicas

```text
Canales
  Field PWA | Operations | Public Map | Partner API

Aplicación
  incident | territory | identity | mission | case | need
  evidence | review | material | inventory | logistics | recovery

Plataforma
  auth | sync | files | queues | notifications | audit | exports

Datos
  PostgreSQL/PostGIS | S3-compatible objects | Redis

Operación
  observability | backups | security | deployment | incident response
```

## Proyecciones, no bases paralelas

El mapa, los tableros y el portal público son proyecciones derivadas. No mantienen una segunda verdad. Las existencias se calculan desde movimientos de inventario; el avance de obra se calcula desde instalaciones verificadas; la cobertura se calcula desde visitas y eventos territoriales.

## Requisitos transversales

- Idempotencia para toda escritura procedente de dispositivos, socios o integraciones.
- `incident_id` y alcance de organización en toda entidad operacional.
- Fechas de ocurrencia y de recepción separadas.
- Fuente, autor, confianza y revisión para afirmaciones.
- Unidades explícitas y conversiones trazables.
- Datos públicos separados de datos personales y comerciales.
- Accesibilidad, internacionalización y operación con conectividad intermitente.
- Retención, exportación, corrección y eliminación conforme a la jurisdicción.
- Copias de seguridad, restauración probada y continuidad operacional.

## Fronteras de consistencia

Una transacción local puede actualizar una entidad y su evento de auditoría. Procesos pesados —archivos, notificaciones, similitud, agregaciones y exportaciones— se disparan mediante outbox y workers. Ningún worker puede ser la única fuente de una decisión operacional.

## Evolución a servicios

Los primeros candidatos a separación son procesamiento de evidencia, sincronización y notificaciones. Inventario y logística permanecen juntos hasta que existan necesidades comprobadas de escala, porque comparten reglas de consistencia y reservas.

## Condición para levantar infraestructura completa

Antes de aprovisionar producción deben estar aprobados:

1. Modelo de amenazas y clasificación de datos.
2. Matriz de roles y permisos.
3. Política de retención y publicación.
4. Contratos de sincronización y resolución de conflictos.
5. Libro de inventario y reglas de medición.
6. Objetivos de recuperación, respaldo y restauración.
7. Catálogo de eventos y observabilidad.
8. Responsables operacionales y procedimiento de incidentes.
