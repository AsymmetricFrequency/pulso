#!/usr/bin/env bash
# Redespliegue de Pulso en pulso.my
#
# Trae main desde GitHub, reinstala dependencias, reconstruye y reinicia los tres
# servicios. NO corre migraciones: las migraciones de este repo no son idempotentes
# (CREATE TABLE sin IF NOT EXISTS), así que una migración nueva se aplica a mano:
#
#   psql -h 127.0.0.1 -U pulso -d pulso -v ON_ERROR_STOP=1 -f infrastructure/postgres/migrations/0NN_*.sql
#
set -euo pipefail

cd /opt/pulso

git fetch --all
git reset --hard origin/main

pnpm install --frozen-lockfile

# El build de Next.js incrusta las NEXT_PUBLIC_* en el bundle, así que el .env
# tiene que estar en el entorno antes de compilar, no solo al arrancar.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

pnpm --filter @pulso/schemas --filter @pulso/domain --filter @pulso/api --filter @pulso/worker build
pnpm --filter @pulso/web build

systemctl restart pulso-api pulso-web pulso-worker
sleep 5
systemctl is-active pulso-api pulso-web pulso-worker
curl -fsS -o /dev/null -w "pulso.my -> %{http_code}\n" https://pulso.my/
