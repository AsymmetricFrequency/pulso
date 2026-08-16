# Discord como sistema de gestión

Discord es donde está la gente, así que es donde se gestiona el proyecto. Lo que sigue es cómo se
conecta con GitHub y con Pulso, en el orden en que conviene hacerlo.

**El orden importa.** Primero lo que funciona hoy sin escribir código (§1 y §2), después el bot (§3),
y el panel de administración al final (§4). La razón es simple: si el flujo manual no se usa,
automatizarlo no lo va a arreglar — solo va a automatizar el desuso, y habrá costado dos semanas que
le tocaban a P0.

---

## 1. Estructura del servidor

El servidor ya tiene canales y roles. Esto es cómo se usan, no una propuesta de reorganización.

### Roles y qué autorizan

Los roles de Discord son **el mismo vocabulario** que las etiquetas de los issues y que la tabla de
áreas de [`32-direccion.md`](32-direccion.md). Un solo eje para todo: si alguien es `Backend` en
Discord, toma issues con etiqueta `backend` y aprueba PRs de `apps/api`.

| Rol | Autoriza | Se gana |
| --- | --- | --- |
| `Maintainer` | Aprobar arquitectura, seguridad, privacidad, licencia; acceso a producción | Por designación |
| `Core Contributor` | Aprobar PRs de su área | Historial de PRs mergeados en esa área |
| `Frontend` `Backend` `Data` `GIS` `DevOps` `AI` `Blockchain` | Tomar tickets de su área | Al presentarse en `#introductions` |
| `Contributor` | Tomar tickets sin etiqueta de área; proponer en `#ideas` | Al entrar |

**Una persona puede tener varios roles de área.** `Contributor` no es un nivel inferior: es el rol de
quien contribuye sin especialidad técnica declarada — difusión, contenido, contacto institucional,
pruebas de campo. `P0-4` del backlog es exactamente eso y es de las tareas más importantes que hay.

### Canales

Los que ya existen tienen un uso definido:

| Canal | Para qué | Qué **no** va aquí |
| --- | --- | --- |
| `#announcements` | Decisiones tomadas, despliegues, cambios de prioridad | Discusión — se responde en hilo |
| `#how-to-contribute` | Apunta a `CONTRIBUTING.md`. Nada más | Documentación paralela que se desincroniza |
| `#ideas` | Proponer. Todo empieza aquí | Trabajo ya asignado |
| `#solutions` | Preguntas técnicas y desatascos | — |
| `#frontend` `#backend` `#devops` `#data` `#gis` `#blockchain` `#ai` | Trabajo del día a día de cada área | — |

Hacen falta tres:

- **`#tareas`** — canal de **foro**, no de texto. Un hilo por ticket. Es el tablero.
- **`#github`** — solo el webhook. Nadie escribe aquí.
- **`#alertas`** — fallos de ingesta, caídas, y (cuando exista `PL-3`) rescates nuevos.

**Por qué foro y no un tablero aparte:** un ticket en Discord es una conversación con estado. Un
tablero aparte obliga a mantener dos lugares sincronizados a mano, y en la práctica uno de los dos
se queda viejo — siempre. El foro tiene etiquetas, estado abierto/cerrado y la discusión en el mismo
sitio.

Etiquetas del foro `#tareas`, iguales a las de GitHub: `p0` `p1` `p2` `p3` `plataforma` ·
`frontend` `backend` `data` `gis` `devops` `ai` `blockchain` · `libre` `tomado` `en-revisión`.

---

## 2. Conectar GitHub con Discord — hoy, sin código

Diez minutos y cubre el 80% de lo que hace falta.

### 2.1 El webhook

1. En Discord: `#github` → ⚙️ → **Integraciones** → **Webhooks** → **Nuevo webhook** → copiar la URL.
2. Añadirle `/github` al final. **Este paso es el que todo el mundo olvida** y sin él GitHub manda
   un formato que Discord no entiende y no aparece nada:
   ```
   https://discord.com/api/webhooks/<id>/<token>/github
   ```
3. En GitHub: `AsymmetricFrequency/pulso` → **Settings** → **Webhooks** → **Add webhook**.
   - Payload URL: la de arriba
   - Content type: `application/json`
   - Eventos: **Let me select individual events** → `Pull requests`, `Pushes`, `Issues`,
     `Issue comments`, `Releases`
4. Verificar que el ping de prueba llegó a `#github`.

**No marques «Send me everything».** Un servidor con el ruido de cada evento de GitHub es un servidor
que la gente silencia, y entonces tampoco lee lo que sí importa.

### 2.2 Roles de Discord ↔ permisos de GitHub

Se administra a mano, y está bien: son siete personas y el costo de un bot para esto es mayor que el
de hacerlo cuando alguien entra.

| Rol de Discord | En GitHub |
| --- | --- |
| `Maintainer` | Admin |
| `Core Contributor` | Write + `CODEOWNERS` de su área |
| Roles de área | Write |
| `Contributor` | Fork y PR (sin permiso directo) |

Los equipos de GitHub se llaman igual que los roles: `@AsymmetricFrequency/frontend`, `/backend`,
`/data`, `/gis`, `/devops`, `/ai`, `/blockchain`. Así `.github/CODEOWNERS` pide revisión al área
correcta sola.

### 2.3 El flujo de un ticket

```
#ideas  →  se acuerda  →  issue en GitHub  →  hilo en #tareas
                                                    ↓
                                       alguien comenta "lo tomo"
                                                    ↓
                                    assignee + etiqueta `tomado`
                                                    ↓
                                 rama  p0/rescate-cola-operaciones
                                                    ↓
                                    PR → aparece solo en #github
                                                    ↓
                              revisión → merge → despliegue → #announcements
```

El nombre de la rama lleva la prioridad delante a propósito: `git branch -a` ordenado alfabéticamente
muestra primero lo que más importa.

---

## 3. El bot de Pulso — después, no ahora

Un servicio en `apps/discord-bot`. Solo tiene sentido cuando el flujo de §2 lleve una semana en uso
real y sepamos qué duele de verdad.

### Qué haría

**Publicar hacia Discord** — lo que Pulso sabe y Discord no:

- rescate nuevo reportado → `#alertas`, con enlace al punto en el mapa;
- ingesta fallida → `#alertas` con la fuente y el error;
- despliegue terminado → `#announcements`;
- resumen diario: reportes nuevos, rescates abiertos, contratos en cola.

Esto es lo valioso y es lo más fácil: un webhook entrante y `fetch`. **Se puede hacer solo esta
mitad** y saltarse el resto.

**Recibir desde Discord** — comandos de barra:

| Comando | Qué hace |
| --- | --- |
| `/tomar <issue>` | Asigna el issue en GitHub y etiqueta el hilo como `tomado` |
| `/estado` | Rescates abiertos, reportes de hoy, última ingesta |
| `/tickets [rol]` | Tickets libres, filtrados por área |

### Cómo se conecta

1. [discord.com/developers/applications](https://discord.com/developers/applications) → **New
   Application** → `Pulso`.
2. **Bot** → **Reset Token** → guardarlo en `/opt/pulso/.env` como `DISCORD_BOT_TOKEN`.
   **Ese token es una credencial de producción: no va al repositorio, no se pega en un chat, y si se
   filtra se rota en el acto.**
3. Intents: solo `Guilds` y `Guild Messages`. **No** pedir `Message Content` — se necesita
   verificación de Discord, y con comandos de barra no hace falta.
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; permisos `Send Messages`,
   `Create Public Threads`, `Manage Threads`, `Embed Links`.
5. Invitar con esa URL.

Del lado del código, `discord.js` v14 y un `POST /v1/internal/discord/events` en la API protegido con
un secreto compartido. Las alertas salientes no necesitan ni el bot: basta un webhook entrante de
canal, que es una URL y ya.

**Un aviso que vale la pena leer antes de empezar:** el bot no es P0. Es infraestructura interna en
medio de una emergencia. La versión que solo publica alertas es de un día y da casi todo el valor;
la que recibe comandos es de una semana y da bastante menos. Empezar por la segunda es el error
clásico.

---

## 4. Panel de administración de Pulso

**Construido y desplegado en [admin.pulso.my](https://admin.pulso.my).** Le faltan las credenciales
de Discord, que solo puede crear el dueño del servidor (§4.5). Mientras tanto la pantalla dice
exactamente qué falta en vez de dar un error.

Una pantalla en `apps/web/app/admin` donde se ve el estado de la operación y quién está en qué.

### La decisión que lo hace barato

**Discord es la fuente de verdad de la identidad y de los roles. Pulso no guarda una tabla de
usuarios propia.**

Se entra con «Iniciar sesión con Discord» (OAuth2). Pulso pregunta a Discord qué roles tiene esa
persona en el servidor y de ahí salen sus permisos. Quitarle un rol en Discord se lo quita en Pulso
al instante.

Es la diferencia entre una tarde y dos semanas: sin esto habría que construir invitaciones, altas,
bajas, recuperación de contraseña y una pantalla de administración de usuarios — todo eso ya existe y
funciona, y se llama Discord.

**Ojo con no mezclar dos cosas:** Pulso ya tiene identidad operacional propia (passkeys, roles de
incidente, credenciales profesionales — `17` y `18`) para brigadistas y coordinadores en campo. Esa
es identidad de **operación de emergencia** y no se toca. El acceso por Discord es solo para el
**equipo que construye Pulso**. Son dos poblaciones distintas con necesidades distintas, y colapsarlas
sería un error de seguridad, no una simplificación.

### Qué muestra

**Operación** — lo que hoy hay que sacar con `psql`:

- rescates abiertos, con cuánto llevan sin atender;
- reportes de las últimas 24 horas por tipo;
- estado de cada fuente de ingesta: última corrida, resultado, registros;
- cola de revisión de contratos y de reportes;
- salud de la API, la base y el worker.

**Equipo:**

- quién tiene qué rol, leído de Discord;
- tickets abiertos por área y cuáles llevan más de 48 horas sin dueño;
- PRs esperando revisión, por área.

**Tareas** — el backlog de [`33-backlog.md`](33-backlog.md), como datos:

- los 20 tickets con prioridad, tamaño, roles y criterio de aceptación;
- asignar a un miembro, cambiar estado, y publicar el ticket como hilo en `#tareas`;
- cuántos llevan más de 48 horas tomados sin moverse — la señal más útil del panel, porque nadie
  avisa de que está atascado.

### Quién escribe

**Solo `Maintainer`.** El resto de roles entra a mirar, y eso ya es la mitad del valor: saber
cuántos rescates hay abiertos no debería costar una sesión de `psql`.

No es jerarquía por gusto. Desde aquí se reparten roles de Discord, y un rol de Discord es un
permiso sobre el repositorio y sobre esta misma pantalla. Repartir permisos es administración, no
colaboración. Por la misma razón, nadie puede quitarse a sí mismo el rol de `Maintainer` desde el
panel: es la forma más fácil de quedarse fuera sin manera de volver a entrar.

### 4.5 Cómo se conecta

Cinco pasos. Solo los puede dar quien es dueño del servidor de Discord.

1. [discord.com/developers/applications](https://discord.com/developers/applications) → **New
   Application** → `Pulso`. De **General Information** copia el **Application ID**.
2. **OAuth2** → copia el **Client Secret** (*Reset Secret* si no se ve). En **Redirects** añade
   exactamente:
   ```
   https://admin.pulso.my/v1/admin/auth/callback
   ```
   Tiene que coincidir carácter por carácter con `DISCORD_REDIRECT_URI` o Discord rechaza la
   entrada sin explicar cuál de los dos está mal.
3. **Bot** → **Reset Token** y cópialo. En **Privileged Gateway Intents** activa
   **`SERVER MEMBERS INTENT`** y guarda.

   Hace falta aunque el panel use la API REST y no la pasarela: leer *un* miembro funciona sin él,
   pero **listar todos los miembros del servidor devuelve 403** sin ese intent, y la lista del
   equipo es la mitad del panel. No exige verificación de Discord mientras el bot esté en menos de
   100 servidores.

   Deja **`MESSAGE CONTENT INTENT` apagado**: ese sí exige verificación y aquí no se usa.
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; permisos **Manage Roles**,
   *Send Messages*, *Create Public Threads*. Abre la URL e invita el bot al servidor.
   **En Ajustes del servidor → Roles, arrastra el rol del bot por encima de los roles que va a
   repartir.** Discord no deja a un bot asignar un rol que esté más arriba que el suyo, y el
   síntoma es un 403 que no dice eso.
5. En el servidor, `/opt/pulso/.env`:
   ```sh
   DISCORD_CLIENT_ID=<application id>
   DISCORD_CLIENT_SECRET=<client secret>
   DISCORD_GUILD_ID=<clic derecho en el servidor → Copiar ID de servidor>
   DISCORD_BOT_TOKEN=<token del bot>
   DISCORD_TASKS_CHANNEL_ID=<clic derecho en #tareas → Copiar ID>   # opcional
   DISCORD_WEBHOOK_ALERTS=<url del webhook de #alertas>             # opcional
   ```
   Después `systemctl restart pulso-api`.

Para copiar identificadores hace falta **Ajustes de usuario → Avanzado → Modo desarrollador**.

`ADMIN_SESSION_SECRET`, `ADMIN_PANEL_URL`, `NEXT_PUBLIC_ADMIN_API_URL` y `DISCORD_REDIRECT_URI` ya
están puestas en el servidor.

**El token del bot es una credencial de producción:** no va al repositorio, no se pega en un chat, y
si se filtra se rota en el acto desde la misma pantalla donde se generó.

### 4.6 Super admin

Dos mecanismos, para dos problemas distintos.

**`ADMIN_SUPERUSER_DISCORD_IDS`** — ids de Discord con escritura permanente, separados por coma.

Resuelve el arranque, que es un callejón sin salida real: el rol `Maintainer` empieza vacío, así que
la primera persona que entra lo hace en modo lectura y **no puede darse el rol que necesita para
poder darse el rol**. Y resuelve la recuperación: si alguien se equivoca repartiendo roles, hay una
vía de vuelta que no depende de esos mismos roles.

Sigue exigiendo entrar por Discord con esa cuenta concreta. No es una puerta trasera: es una lista
de personas a las que el rol no puede echar.

**`ADMIN_BREAK_GLASS_TOKEN`** — entrada de emergencia, sin pasar por Discord.

```sh
curl -X POST https://admin.pulso.my/v1/admin/auth/break-glass \
  -H 'Content-Type: application/json' -c cookies.txt \
  -d '{"token":"<el valor del .env>"}'
```

Existe porque un panel cuya única puerta es un servicio de terceros se cierra cuando ese servicio se
cae — y en una emergencia eso pasa justo cuando hace falta mirar. El pulso de la operación y los
tickets salen de la base y no de Discord, así que con Discord caído siguen respondiendo.

La contrapartida es real y no se disimula: **quien tenga ese valor entra con permisos completos.**
Por eso exige 32 caracteres, cada uso —aceptado o rechazado— queda en el registro del servidor, la
sesión dura dos horas en vez de doce, y el panel lo anuncia en rojo mientras estés dentro por ahí.
Dejarlo vacío desactiva la vía por completo.

Ninguno de los dos va al repositorio.

### Tres 403 que no explican nada

Discord responde `403 Forbidden` a tres cosas distintas sin decir cuál es. Las tres las tropezamos
al montar esto:

| Síntoma | Causa | Arreglo |
| --- | --- | --- |
| Todo da 403, incluso leer roles | Falta `User-Agent` propio en la petición | Ya resuelto en `discord.ts` |
| Listar miembros da 403, leer uno funciona | Falta el **Server Members Intent** | Portal → Bot → Privileged Gateway Intents |
| Asignar un rol da 403 | El rol del bot está por debajo del que intenta asignar | Ajustes del servidor → Roles → subir `Pulso` |

El tercero es el más confuso porque el permiso `Manage Roles` sí está concedido: lo que manda es la
posición en la lista, no el permiso.

### Un detalle que cuesta una tarde si no se sabe

El panel llama a la API en **su propio host** (`admin.pulso.my/v1/*`), no en `pulso.my`. La sesión
viaja en una cookie `httpOnly` con `SameSite=Lax`, y una cookie así no se manda en una petición de
fondo hacia otro sitio: el navegador la descarta sin decir nada y todo responde 401 sin ninguna
pista. Por eso Caddy expone `/v1/*` bajo los dos hosts y `NEXT_PUBLIC_ADMIN_API_URL` va vacía en
producción.

---

## 5. Lo que no se automatiza

- **Decidir prioridad.** Sale de [`32-direccion.md`](32-direccion.md) y la cambia un Maintainer, no
  el número de reacciones que tenga un mensaje.
- **Aprobar cambios de privacidad o seguridad.** Los lee una persona con nombre. Ver
  `CODEOWNERS`.
- **Cerrar un rescate.** Lo cierra quien coordina en Operaciones, con criterio de campo. Nunca un
  bot, nunca un comando de Discord.
