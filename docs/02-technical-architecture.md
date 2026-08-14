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

`incidents`, `territories`, `coverage`, `actors`, `teams`, `assignments`, `cases`, `households`, `evidence`, `assessments`, `needs`, `certifications`, `aid`, `deduplication`, `reviews`, `sync` y `audit`.

## Fronteras

- PostgreSQL es la fuente de verdad de entidades y estados.
- Los archivos originales permanecen en almacenamiento de objetos.
- Redis no contiene la única copia de información operacional.
- La API aplica autorización; la interfaz no es una frontera de seguridad.
- El mapa público consume agregaciones, nunca tablas privadas directamente.

## Despliegue inicial

Contenedores en tres entornos: desarrollo, preproducción y producción. PostgreSQL/PostGIS, Redis y almacenamiento de objetos serán administrados cuando sea posible. Kubernetes no es un requisito del MVP.
