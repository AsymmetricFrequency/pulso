# Guía de desarrollo

## Inicio rápido

```bash
pnpm install
cp .env.example .env
pnpm dev
```

El frontend corre en el puerto 3000 y la API en el 3001. Si `REDIS_URL` no está definido, el worker inicia en modo inactivo. La primera implementación de incidentes usa un repositorio en memoria mientras se conecta el adaptador PostgreSQL del siguiente vertical.

## Servicios locales

Cuando Docker esté disponible:

```bash
docker compose up -d
```

Esto levanta PostgreSQL con PostGIS y Redis. Las migraciones SQL iniciales se encuentran en `infrastructure/postgres/migrations`.

## Comandos

- `pnpm dev`: ejecuta web, API y worker.
- `pnpm lint`: analiza formato y reglas estáticas.
- `pnpm typecheck`: verifica TypeScript.
- `pnpm test`: ejecuta pruebas.
- `pnpm build`: compila todos los paquetes y aplicaciones.
- `pnpm check`: ejecuta todas las verificaciones anteriores.

## Convenciones

- Las reglas de dominio viven en `packages/domain`.
- Los contratos de red viven en `packages/schemas`.
- La API depende de interfaces del dominio, no de PostgreSQL directamente.
- Las rutas validan entrada y salida.
- Los identificadores se generan en el cliente cuando el flujo offline lo requiere.
- No usar información personal real en desarrollo o pruebas.
