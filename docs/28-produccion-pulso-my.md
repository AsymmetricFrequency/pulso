# Producción: pulso.my

## Decisión

Pulso dejó de ser un proyecto local. Está publicado en `https://pulso.my`, sirviendo los datos
reales que ya estaban en la base local (2.170 reportes ciudadanos y de fuentes oficiales, 1.154
territorios DANE, 30 proveedores de Cali) y con el worker de ingesta corriendo en vivo contra las
nueve fuentes registradas.

El servidor es un VPS Ubuntu 24.04 (`38.180.82.228`) que ya alojaba otras aplicaciones. Eso
condicionó las decisiones: **no se instaló Docker** ni un Postgres nuevo — se reutilizó el
PostgreSQL 16 y el Redis que ya corrían en la máquina, y se sumó un bloque al Caddy que ya tenía
los 443/80 tomados. Menos piezas nuevas, menos memoria (el host solo tenía ~3,5 GB libres de 7,8).

## Topología

```text
Internet ──443──> Caddy ──┬── /v1/*   ──> 127.0.0.1:3021  pulso-api    (Fastify)
                          ├── /health ──> 127.0.0.1:3021
                          └── resto    ──> 127.0.0.1:3020  pulso-web    (Next.js)

                              pulso-worker (BullMQ) ──> Redis db 3
                              pulso-api / worker    ──> PostgreSQL 16 + PostGIS 3.4, base `pulso`
```

La API va **bajo el mismo dominio** (`pulso.my/v1/...`) en vez de un `api.pulso.my`. Así el
navegador nunca cruza origen: no hay preflight de CORS ni un segundo certificado que renovar, y
`NEXT_PUBLIC_API_URL=https://pulso.my` alcanza para todo el frontend.

Los puertos 3020/3021 escuchan solo en `127.0.0.1` y además el firewall del host los bloquea desde
fuera — se verificó que ambos dan timeout desde Internet. La única puerta es Caddy.

## Base de datos

El Postgres del host es 16.14 y no traía PostGIS; se instaló `postgresql-16-postgis-3` (3.4.2). La
base local corre PostgreSQL 18 con PostGIS 3.6, así que **restaurar un dump completo hacia atrás no
era seguro** (un dump de PG17+ incluye `SET transaction_timeout`, que PG16 no conoce, y PostGIS 3.6
puede emitir funciones que 3.4 no tiene).

La migración se hizo en dos tiempos, que además es el orden correcto por diseño:

1. **Esquema desde las migraciones del repo** (`001`…`019`), que son la fuente de verdad.
2. **Datos con `pg_dump --data-only --disable-triggers`**, excluyendo `spatial_ref_sys` (la trae
   PostGIS) y filtrando la línea `SET transaction_timeout`. Un dump de solo datos es portable entre
   versiones mayores; la geometría viaja como WKB hexadecimal.

Se restauró como superusuario porque `--disable-triggers` lo exige (hay ciclos de llaves foráneas
en `territories`, `inventory_movements` y `public_report_publications`). Conteos verificados en
destino, idénticos al origen.

## Servicios

Tres units de systemd, todas con `Restart=always` y `EnvironmentFile=/opt/pulso/.env`:
`pulso-api`, `pulso-web`, `pulso-worker`. Logs en `/var/log/pulso-*.log` con logrotate diario a 14
días.

El worker carga el `.env` de la raíz del repo por ruta relativa a su propio directorio
(`apps/worker/src/index.ts`), lo que sigue funcionando desde `dist/` porque la profundidad es la
misma.

Redis se comparte con las otras apps del host, así que Pulso usa el **índice de base 3**
(`redis://127.0.0.1:6379/3`) para no mezclar colas con nada más.

## Secretos

Los tres secretos (`MISSION_INVITATION_SECRET`, `IDENTITY_FINGERPRINT_SECRET`, `MISSION_ADMIN_KEY`)
y la contraseña de Postgres se generaron con `openssl rand` en el momento del despliegue — los
valores `replace-with-...` del `.env.example` nunca llegaron a producción. `apps/api/src/server.ts`
ya se negaba a arrancar sin ellos cuando `NODE_ENV=production`, así que la falta habría sido ruidosa
y no silenciosa.

`/opt/pulso/.env` tiene permisos `600` y no está en el repositorio.

## Redespliegue

```bash
ssh root@38.180.82.228 /opt/pulso/deploy.sh
```

Trae `main`, reinstala, reconstruye y reinicia las tres units. **No corre migraciones**: las de este
repo no son idempotentes (`CREATE TABLE` sin `IF NOT EXISTS`), así que una migración nueva se aplica
a mano una sola vez:

```bash
psql -h 127.0.0.1 -U pulso -d pulso -v ON_ERROR_STOP=1 \
  -f infrastructure/postgres/migrations/0NN_lo_que_sea.sql
```

El build de Next.js incrusta las `NEXT_PUBLIC_*` en el bundle, por eso `deploy.sh` exporta el
`.env` **antes** de compilar y no solo al arrancar.

## Lo que se corrigió al publicar

Tres textos seguían diciendo "datos sintéticos" y el bloque de donaciones tenía cifras inventadas
como valor por defecto (`?? 428_000_000`). En local con la API conectada nunca se veían, pero en
producción, ante cualquier fallo de la API, el sitio habría mostrado $428 M de donaciones que no
existen. Se reemplazaron por `?? 0` y los textos ahora describen el estado real: cifras en cero
mientras no haya un ledger de donaciones conectado.

## Pendiente

- `blockchain/solana` no compila en el servidor (falta `anchor`); queda fuera del despliegue. El
  resto del monorepo no depende de él para funcionar.

## Respaldo

`/etc/cron.daily/pulso-backup` hace un `pg_dump -Fc` de la base a `/root/backups/pulso/` y borra
los respaldos de más de 14 días. Es un respaldo local, en el mismo disco que la base: sirve contra
un borrado accidental o una migración fallida, **no** contra la pérdida del servidor. Sacarlo fuera
del host queda pendiente.
