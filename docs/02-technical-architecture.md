# Arquitectura técnica

## Estilo

Monolito modular, orientado por dominios, con workers asíncronos. Un repositorio y una base de datos durante el MVP; separación futura mediante contratos estables.

```text
Clientes PWA / consola / mapa público
                |
             CDN + WAF
                |
        API TypeScript + Fastify
          |       |        |
     PostgreSQL  Redis   Objetos S3
       PostGIS     |
                Workers
                   |
          Relayer Solana posterior
```

## Aplicaciones

```text
apps/
  web/       PWA de campo, consola y mapa público
  api/       API REST y motor de sincronización
  worker/    evidencias, duplicidad y agregaciones
```

## Paquetes

```text
packages/
  domain/          entidades y reglas puras
  database/        esquema, consultas y migraciones
  schemas/         contratos compartidos y validación
  authorization/   políticas de acceso
  sync-engine/     operaciones, cursores y conflictos
  geospatial/      geometrías, coberturas y agregaciones
  ui/              componentes compartidos
```

## Módulos de API

`incidents`, `territories`, `coverage`, `actors`, `teams`, `assignments`, `cases`, `households`, `evidence`, `assessments`, `needs`, `certifications`, `materials`, `inventory`, `logistics`, `recovery`, `aid`, `deduplication`, `reviews`, `sync` y `audit`.

## Fronteras

- PostgreSQL es la fuente de verdad de entidades y estados.
- Los archivos originales permanecen en almacenamiento de objetos.
- Redis no contiene la única copia de información operacional.
- La API aplica autorización; la interfaz no es una frontera de seguridad.
- El mapa público consume agregaciones, nunca tablas privadas directamente.
- El inventario se deriva de movimientos append-only; las proyecciones de stock son reconstruibles.
- Las integraciones y workers reciben eventos mediante una outbox transaccional.
- Solana recibe compromisos criptográficos por lotes y nunca es fuente de verdad operacional.
- La caída de Solana o de un RPC no interrumpe el trabajo de campo; el relayer conserva reintentos idempotentes.

## Procesamiento asíncrono

Los comandos guardan el cambio y un evento outbox en una sola transacción. Workers independientes procesan evidencias, similitud, notificaciones, agregaciones, exportaciones y webhooks. Cada consumidor es idempotente y conserva reintentos y cola de fallos.

## Observabilidad y continuidad

- Logs estructurados con `requestId`, `incidentId` y `correlationId`, sin información personal.
- Métricas de latencia, errores, sincronización, colas y antigüedad de datos.
- Trazas entre API, outbox y workers.
- Respaldos cifrados y restauraciones ensayadas.
- Objetivos RPO/RTO definidos por entorno antes de producción.
- Procedimiento para operar en modo degradado cuando fallen mapas, colas o proveedores externos.

La matriz completa de dominios y requisitos se mantiene en [Cobertura completa de arquitectura](09-architecture-coverage.md).

## Despliegue inicial

Contenedores en tres entornos: desarrollo, preproducción y producción. PostgreSQL/PostGIS, Redis y almacenamiento de objetos serán administrados cuando sea posible. Kubernetes no es un requisito del MVP.
