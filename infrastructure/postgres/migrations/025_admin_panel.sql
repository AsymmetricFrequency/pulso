-- Panel administrativo de Pulso, con Discord como fuente de identidad.
--
-- La decisión que hace barato todo esto: **Pulso no tiene tabla de usuarios del equipo**. Quién es
-- cada quien y qué puede hacer lo responde Discord, que es donde el equipo ya vive. Construir altas,
-- bajas, invitaciones y recuperación de contraseña habría costado semanas para reimplementar algo
-- que ya funciona y que además ya está poblado con siete personas.
--
-- Ojo con no confundir esto con la identidad operacional (`005`, `010`): esa es para brigadistas y
-- coordinadores en campo, con passkeys y credenciales profesionales verificables. Son dos
-- poblaciones distintas —quien construye Pulso y quien atiende la emergencia— y mezclarlas sería un
-- error de seguridad, no una simplificación.

-- Sesión del panel. Guarda el token hasheado, nunca el token.
CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY,
  -- HMAC del token que viaja en la cookie. Si alguien se lleva un volcado de esta tabla no se lleva
  -- ninguna sesión utilizable.
  token_hash text NOT NULL UNIQUE,
  discord_user_id text NOT NULL,
  discord_username text NOT NULL,
  discord_avatar_url text,
  -- Los roles del servidor en el momento de entrar. Se copian aquí para no llamar a Discord en cada
  -- petición; la contrapartida es que un rol quitado tarda hasta que expire la sesión en surtir
  -- efecto, y por eso la sesión dura horas y no días.
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_sessions_expiry_idx ON admin_sessions(expires_at);

-- El backlog como datos.
--
-- Hasta ahora vivía solo en `docs/33-backlog.md`, que se lee bien y no se puede consultar: no hay
-- forma de preguntar "qué tiene tomado esta persona" ni de que el panel muestre lo que está libre.
-- El documento sigue siendo la explicación —el porqué de cada ticket, que en una tabla no cabe— y
-- esta tabla es el estado.
CREATE TABLE project_tasks (
  id uuid PRIMARY KEY,
  -- El código del backlog: P0-1, PL-3. Es el identificador que la gente usa al hablar, así que es
  -- también la clave natural y lo que va en el nombre de la rama.
  code text NOT NULL UNIQUE CHECK (code ~ '^(P[0-3]|PL)-[0-9]+$'),
  title text NOT NULL,
  summary text,
  -- Cómo sabemos que está terminado. Un ticket sin esto es un ticket que se discute al final.
  acceptance text,
  priority text NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'PL')),
  size text NOT NULL CHECK (size IN ('S', 'M', 'L')),
  -- Roles de Discord que pueden tomarlo. Mismo vocabulario que los roles del servidor y que las
  -- etiquetas de los issues: un solo eje para todo.
  roles text[] NOT NULL DEFAULT '{}',
  horizon text NOT NULL CHECK (horizon IN ('corto', 'mediano', 'largo')),
  status text NOT NULL DEFAULT 'libre'
    CHECK (status IN ('libre', 'tomado', 'en_revision', 'hecho', 'bloqueado')),
  assignee_discord_id text,
  assignee_username text,
  -- Dependencias por código, no por id: se escriben a mano al crear el ticket y el código es lo que
  -- la gente conoce.
  depends_on text[] NOT NULL DEFAULT '{}',
  discord_thread_id text,
  github_issue_number integer,
  -- Orden dentro del backlog. Se guarda explícito porque el orden de lectura no es el alfabético de
  -- los códigos ni el de creación.
  sort_order integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Un ticket libre no tiene dueño y uno tomado sí. Sin esto se acumulan filas "libres" con
  -- assignee, que es como se pierde de vista quién estaba en qué.
  CHECK (
    (status = 'libre' AND assignee_discord_id IS NULL)
    OR (status <> 'libre' AND assignee_discord_id IS NOT NULL)
  )
);

CREATE INDEX project_tasks_board_idx ON project_tasks(status, priority, sort_order);
CREATE INDEX project_tasks_assignee_idx ON project_tasks(assignee_discord_id)
  WHERE assignee_discord_id IS NOT NULL;

-- Historial de asignaciones y cambios de estado.
--
-- La invariante 4 del proyecto (corregir agrega, no sobrescribe) también aplica aquí. Sin esto,
-- reasignar un ticket borra que alguien lo tuvo tres días y lo soltó — que es exactamente la
-- información que hace falta para saber si algo está atascado.
CREATE TABLE project_task_events (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('assigned', 'released', 'status_changed', 'published')),
  from_value text,
  to_value text,
  actor_discord_id text NOT NULL,
  actor_username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_task_events_task_idx ON project_task_events(task_id, created_at DESC);
