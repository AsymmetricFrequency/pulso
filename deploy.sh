#!/usr/bin/env bash
# Redespliegue de Pulso en pulso.my
#
# Trae main desde GitHub, reinstala dependencias, reconstruye y reinicia los tres
# servicios. NO corre migraciones, y el orden importa: **primero la base, después el código.**
# Al revés queda código consultando algo que la base todavía no tiene, que ya pasó una vez y
# costó veinte minutos de 500 en /auditoria.
#
#   /opt/pulso/migrate.sh 0NN && /opt/pulso/deploy.sh
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
