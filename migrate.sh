#!/usr/bin/env bash
# Aplica migraciones a la base de producción. NO despliega y NO reinicia nada.
#
# ## Por qué existe
#
# El orden correcto es **migración primero, código después**, y hasta ahora eso dependía de que
# quien desplegara se acordara de copiar el comando de `psql` del README. Falló una vez: se desplegó
# código que consultaba una vista con una columna que la base todavía no tenía, y `/auditoria`
# devolvió 500 en producción hasta que se aplicó la migración que ya estaba escrita.
#
# Este archivo no es un framework de migraciones —no hay tabla de control, no detecta pendientes—
# porque eso es un cambio de diseño y esto es la parte que evita el error concreto que ocurrió:
# traer las migraciones nuevas **sin traer el código**, y aplicarlas en orden y una a una.
#
# ## Uso
#
#   /opt/pulso/migrate.sh 072 073
#   /opt/pulso/migrate.sh 072 073 && /opt/pulso/deploy.sh
#
# Cada migración va en su propia transacción: si una falla a mitad, no deja la base a medio camino,
# y las siguientes no llegan a correr.
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Uso: migrate.sh NNN [NNN...]   (los números de las migraciones, en orden)" >&2
  exit 1
fi

cd /opt/pulso

# Trae **solo** las migraciones desde main, no el código. Es la razón de ser del script: el árbol de
# trabajo se queda en la versión desplegada mientras la base se adelanta, que es el orden que hace
# falta para que nunca haya código consultando algo que todavía no existe.
git fetch --quiet origin main
git checkout --quiet origin/main -- infrastructure/postgres/migrations

# El `.env` no se imprime nunca: se carga al entorno y `psql` lee `DATABASE_URL` de ahí.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

for number in "$@"; do
  matches=(infrastructure/postgres/migrations/"${number}"_*.sql)
  if [ ! -f "${matches[0]}" ]; then
    echo "No existe ninguna migración ${number}_*.sql" >&2
    exit 1
  fi
  if [ ${#matches[@]} -gt 1 ]; then
    echo "Hay más de una migración con el número ${number}. Resuélvelo antes de aplicar." >&2
    exit 1
  fi
  echo "→ $(basename "${matches[0]}")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -q -f "${matches[0]}"
done

echo "Migraciones aplicadas. El código sigue en la versión anterior: ahora sí, deploy.sh."
