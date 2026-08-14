# Aplicaciones

- `web`: interfaz operacional PWA en Next.js.
- `api`: API modular Fastify; el vertical inicial implementa salud e incidentes.
- `worker`: procesamiento asíncrono preparado para la cola de evidencias.

Los datos visibles en la interfaz actual son sintéticos. La API usa temporalmente un repositorio en memoria hasta conectar el adaptador PostgreSQL.
