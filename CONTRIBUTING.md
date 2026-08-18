# Contribuir a Pulso

Pulso es infraestructura de información para una emergencia real y en curso. Lo que se despliega aquí
lo usa gente que está buscando a alguien bajo escombros. Eso cambia dos cosas respecto a un proyecto
normal: **hay invariantes que no se negocian en un PR**, y **la prioridad la fija el daño evitado, no
lo interesante que sea el problema**.

Si es tu primer día: lee [`docs/32-direccion.md`](docs/32-direccion.md) (quince minutos) y toma un
ticket de [`docs/33-backlog.md`](docs/33-backlog.md). Eso es todo el onboarding.

---

## Las cuatro invariantes

Un PR que rompa una de estas no se merge. No es una escala de gravedad: es la lista completa de las
cosas que no se discuten en la revisión de código, sino antes, en `#solutions`.

**1. Ningún dato personal de terceros entra a la base de datos.** No se importan nombres, teléfonos,
fotos ni historiales desde otras plataformas — ni de personas desaparecidas, ni de damnificados, ni
de mascotas. Da igual que estén públicos en el sitio de origen: que un dato sea accesible no lo hace
nuestro para republicar. De fuentes externas solo entra información institucional y agregada.

Lo mismo aplica a servicios externos: los nombres de proveedores de contratos públicos **no** se
mandan a una API de terceros, porque en Colombia una parte de esos contratos los firman personas
naturales. Hay una prueba que lo fija (`apps/worker/src/contract-triage.test.ts`) — si la rompes,
párate a pensar por qué está ahí.

**2. Una máquina no decide, ordena.** Un modelo puede leer, clasificar y priorizar una cola. El campo
del que dependen las cifras públicas lo escribe una persona. Los dos vocabularios se mantienen
distintos a propósito (`likely`/`unlikely`/`unclear` frente a `confirmed`/`probable`/`unrelated`)
para que nadie escriba una consulta que sume lo que un modelo supuso.

**3. Cero fabricado.** Si no hay dato, la interfaz dice que no hay dato y por qué. Nunca un número de
relleno para que la pantalla se vea completa. «Cero contratos confirmados» y «cero pesos gastados»
son cosas distintas: si la pantalla no distingue cuál es, la pantalla miente.

**4. Corregir agrega, no sobrescribe.** Toda corrección deja historial: de qué fuente salió el dato,
cuándo se capturó, quién lo cambió.

Y una regla de producto que se rompe con más facilidad de la que parece: **Pulso no despacha ayuda ni
reemplaza al 123.** Cualquier texto que insinúe que reportar aquí hace venir a alguien produce gente
esperando en vez de gente llamando. Es un bug de prioridad alta.

---

## Tomar un ticket

1. Mira [`docs/33-backlog.md`](docs/33-backlog.md) y busca uno con la etiqueta de tu rol.
2. Comenta el hilo en `#tareas`: **«lo tomo»**. Ponte como *assignee* en GitHub.
3. Si en dos días no vas a poder seguir, dilo y suéltalo. Un ticket bloqueado en silencio es peor que
   uno sin tomar: el sin tomar al menos se ve.

Si quieres proponer algo que no está en el backlog, va a `#ideas` primero. No abras un PR grande sin
haberlo hablado — el riesgo es que choque con algo que otro ya está haciendo, y descartar una semana
de trabajo de alguien es la peor forma de perder a un colaborador.

---

## Trabajar

```sh
pnpm install
cp .env.example .env
pnpm dev
```

| Servicio | Dirección |
| --- | --- |
| Informe público | `http://localhost:3000` |
| Pulso Campo | `http://localhost:3000/field` |
| Operaciones | `http://localhost:3000/operations` |
| API | `http://localhost:3001` |

La API arranca con adaptadores en memoria, así que **no necesitas Postgres para casi nada**. Cuando
sí lo necesites:

```sh
docker compose up -d postgres
PERSISTENCE_DRIVER=postgres pnpm --filter @pulso/api dev
```

### Ramas

```
<prioridad>/<descripción-corta>

p0/rescate-cola-operaciones
p1/censo-api-esquemas
plataforma/mapa-motor-unico
```

La prioridad va delante para que `git branch` ordenado alfabéticamente muestre primero lo que más
importa. Se trabaja desde `main`; no hay rama de desarrollo.

### Antes de abrir el PR

```sh
pnpm lint && pnpm typecheck && pnpm test
```

Es lo mismo que corre la CI, así que verlo pasar aquí te ahorra el ciclo. Un detalle que confunde a
todo el mundo la primera vez: `@pulso/schemas` es un paquete **compilado**, y `apps/api` chequea
tipos contra su `dist`. Si tocaste un esquema y el typecheck se queja de algo que juras haber
escrito:

```sh
pnpm --filter @pulso/schemas build
```

### Migraciones

Van numeradas en `infrastructure/postgres/migrations/`, nunca se editan una vez aplicadas, y **se
comentan**. El comentario explica *por qué* existe la columna, no qué tipo tiene — eso ya se ve.
Mira `024_rescue_reports.sql` como referencia del nivel de detalle que se espera.

---

## Escribir código que encaje

El proyecto tiene un estilo y es deliberado. Lo importante:

**Los comentarios explican decisiones, no mecánica.** `// incrementa el contador` no aporta nada.
`// se escribe contrato por contrato y no al final porque una corrida interrumpida no debe volver a
pagar lo ya leído` le ahorra media hora a quien venga. Si tuviste que descartar una alternativa,
escribe cuál y por qué — esa es la información que no está en el código.

**En español.** Comentarios, documentación, interfaz y mensajes de error. El código —nombres de
variables, funciones, tipos— en inglés, como está hoy. Los mensajes de commit, en inglés.

**Cada adaptador tiene dos implementaciones.** Memoria y Postgres. Si cambias el comportamiento de
una, cambia la otra: las pruebas corren contra la de memoria, así que si divergen, lo verificado no
es lo que se despliega.

**Prueba la invariante, no la implementación.** La prueba que vale es la que se cae cuando alguien
rompe una regla del dominio sin darse cuenta. Ejemplo real:
`apps/api/test/app.test.ts` verifica que un rescate recién enviado quede primero en la cola pública
— porque la lista va recortada y ordenar por estado de revisión lo dejaba fuera de la respuesta.

**Accesibilidad y toque.** Cualquier control que use alguien en campo: mínimo 44×44 px. Se toca con
una mano, de pie, probablemente temblando, con la pantalla al sol. Contraste 4.5:1 y foco visible; no
quites el `outline`.

---

## Revisión

- **Un PR, un ticket.** Si tu PR necesita un «y además», parte en dos.
- Explica el *porqué* en la descripción. El *qué* ya está en el diff.
- Los PRs de `apps/api/src/field-encryption.ts`, migraciones, y cualquier cosa que toque datos
  personales necesitan aprobación de un `Maintainer`. `CODEOWNERS` lo pide solo.
- Los demás, aprobación de un `Core Contributor` del área.

Si tu cambio necesita romper una invariante: no lo mandes como PR. Ábrelo en `#solutions` con el caso
concreto. A veces la invariante está mal — pero eso se decide antes de escribir el código, no en un
hilo de revisión a las once de la noche.

---

## Reportar un problema de seguridad o privacidad

**No abras un issue público.** Ver [`SECURITY.md`](SECURITY.md).

Cuenta también como problema de seguridad: un dato personal que aparece donde no debería, una ruta
pública que devuelve más de lo que corresponde, y una fuente de ingesta que empezó a traer nombres.

---

## Licencia

Apache-2.0 — ver [`LICENSE`](LICENSE). Al contribuir aceptas que tu aporte se publique bajo esa
licencia. La licencia de los **datos** todavía está sin decidir; hasta que exista una, no asumas nada
sobre reutilizar los datos publicados.
