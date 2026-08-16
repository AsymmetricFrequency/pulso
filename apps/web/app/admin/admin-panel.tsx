"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./admin.module.css";

/**
 * El panel llama a la API en **su propio host**, no en `pulso.my`.
 *
 * La sesión viaja en una cookie httpOnly con `SameSite=Lax`, y una cookie así no se manda en una
 * petición de fondo hacia otro sitio. Si el panel (admin.pulso.my) llamara a pulso.my, el navegador
 * descartaría la cookie sin decir nada y todo respondería 401 sin ninguna pista de por qué. Por eso
 * Caddy expone `/v1/*` también bajo `admin.pulso.my` y aquí la base es el mismo origen.
 *
 * En desarrollo no hay proxy, así que apunta al puerto de la API.
 */
const apiUrl = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:3001";

/**
 * Panel administrativo de Pulso.
 *
 * Responde dos preguntas que hoy exigen `psql` o abrir Discord: **qué está pasando en la operación**
 * y **quién está en qué**. La identidad y los roles los pone Discord; Pulso no tiene tabla de
 * usuarios del equipo.
 *
 * Todo lo que escribe está detrás del rol `Maintainer`. El resto entra a mirar, que ya es la mitad
 * del valor: saber cuántos rescates hay abiertos no debería costar una sesión de terminal.
 */

type Session = {
  discordUserId: string;
  discordUsername: string;
  discordAvatarUrl: string | null;
  roles: string[];
  canWrite: boolean;
  superuser: boolean;
  breakGlass: boolean;
};

type Pulse = {
  rescues: { open: number; withSignsOfLife: number; oldestOpenHours: number | null };
  reports: { last24h: number; total: number; byType: Array<{ type: string; count: number }> };
  contracts: { pendingReview: number; pendingTriage: number; confirmed: number };
  sources: Array<{
    sourceId: string;
    lastRunAt: string | null;
    status: string | null;
    records: number | null;
  }>;
  tasks: { free: number; taken: number; inReview: number; done: number; staleTaken: number };
};

type Task = {
  code: string;
  title: string;
  summary: string | null;
  acceptance: string | null;
  priority: string;
  size: string;
  roles: string[];
  horizon: string;
  status: string;
  assigneeDiscordId: string | null;
  assigneeUsername: string | null;
  dependsOn: string[];
  discordThreadId: string | null;
};

type Member = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roleIds: string[];
  roles: string[];
};

type Role = { id: string; name: string; color: number };

type Capability = {
  priority: string;
  name: string;
  status: string;
  note: string | null;
  taskCode: string | null;
};

/**
 * Las cuatro prioridades, en orden y con lo que responde cada una.
 *
 * El orden no es negociable ni configurable: es una decisión de producto documentada en
 * `docs/32-direccion.md`, y una pantalla que las mostrara por porcentaje de avance pondría primero
 * la que menos importa — que es exactamente el error que el proyecto ya cometió una vez.
 */
const PRIORITIES = [
  { id: "P0", title: "Salvar vidas", question: "¿Dónde hay gente atrapada y quién puede llegar?" },
  { id: "P1", title: "Saber quién quedó afectado", question: "¿Quiénes son y qué necesitan?" },
  { id: "P2", title: "Conectar la ayuda", question: "¿Qué hay, dónde falta y llegó?" },
  {
    id: "P3",
    title: "Trazar la plata pública",
    question: "¿En qué se gasta y llegó al territorio?",
  },
  { id: "PL", title: "Plataforma", question: "Lo que sostiene a las cuatro anteriores." },
];

const CAP_STATUS_LABEL: Record<string, string> = {
  listo: "Listo",
  parcial: "A medias",
  falta: "Falta",
};

const STATUS_LABEL: Record<string, string> = {
  libre: "Libre",
  tomado: "Tomado",
  en_revision: "En revisión",
  hecho: "Hecho",
  bloqueado: "Bloqueado",
};

const HORIZON_LABEL: Record<string, string> = {
  corto: "Corto plazo",
  mediano: "Mediano plazo",
  largo: "Largo plazo",
};

/** Roles de área, los que reparten trabajo. `maintainer` y `contributor` no lo son. */
const AREA_ROLES = ["frontend", "backend", "data", "gis", "devops", "ai", "blockchain"];

type Section = "operacion" | "proyecto" | "equipo" | "tareas";
type TaskFilter = "todas" | "libres" | "activas" | "mias";

const TASK_FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: "todas", label: "Todas" },
  { id: "libres", label: "Libres" },
  { id: "activas", label: "En curso" },
  { id: "mias", label: "Mías" },
];

const LOGIN_ERROR: Record<string, string> = {
  state: "La sesión de entrada expiró. Intenta de nuevo.",
  sin_rol: "Tu cuenta está en el servidor pero no tiene ningún rol de Pulso asignado.",
  no_miembro: "Esa cuenta de Discord no pertenece al servidor de Pulso.",
  credenciales:
    "El servidor tiene un DISCORD_CLIENT_SECRET que ya no es válido. No es tu cuenta: es la " +
    "configuración. Suele pasar tras pulsar «Reset Secret» en el Developer Portal.",
  discord: "Discord no respondió. Intenta de nuevo en un momento.",
};

const api = (path: string, init?: RequestInit) =>
  // `credentials: include` en todas: la sesión viaja en cookie httpOnly y el panel está en otro
  // subdominio, así que sin esto el navegador no la manda y todo responde 401.
  fetch(`${apiUrl}${path}`, { credentials: "include", ...init });

const relativeHours = (hours: number | null) => {
  if (hours === null) return null;
  if (hours < 1) return "hace menos de una hora";
  if (hours < 24) return `hace ${Math.round(hours)} h`;
  return `hace ${Math.round(hours / 24)} días`;
};

export function AdminPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<"cargando" | "fuera" | "dentro" | "sin_configurar">(
    "cargando",
  );
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("operacion");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("todas");
  const [roleFilter, setRoleFilter] = useState<string>("todos");

  const loginError = useMemo(() => {
    if (typeof window === "undefined") return null;
    const code = new URLSearchParams(window.location.search).get("error");
    return code ? (LOGIN_ERROR[code] ?? "No se pudo entrar.") : null;
  }, []);

  const loadAll = useCallback(async () => {
    const [pulseResponse, tasksResponse, teamResponse, capsResponse] = await Promise.all([
      api("/v1/admin/pulse"),
      api("/v1/admin/tasks"),
      api("/v1/admin/team"),
      api("/v1/admin/capabilities"),
    ]);
    if (pulseResponse.ok) setPulse((await pulseResponse.json()) as Pulse);
    if (tasksResponse.ok) setTasks((await tasksResponse.json()) as Task[]);
    if (capsResponse.ok) setCapabilities((await capsResponse.json()) as Capability[]);
    if (teamResponse.ok) {
      const team = (await teamResponse.json()) as { members: Member[]; roles: Role[] };
      setMembers(team.members);
      setRoles(team.roles);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const response = await api("/v1/admin/me");
      if (response.status === 503) {
        const body = (await response.json()) as { message?: string };
        setConfigMessage(body.message ?? null);
        setState("sin_configurar");
        return;
      }
      if (!response.ok) {
        setState("fuera");
        return;
      }
      setSession((await response.json()) as Session);
      setState("dentro");
      await loadAll();
    })();
  }, [loadAll]);

  const mutate = async (path: string, init: RequestInit, key: string) => {
    setBusy(key);
    setNotice(null);
    try {
      const response = await api(path, {
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setNotice(body.message ?? "No se pudo aplicar el cambio.");
        return;
      }
      await loadAll();
    } finally {
      setBusy(null);
    }
  };

  if (state === "cargando") {
    return <main className={styles.shell}>Cargando…</main>;
  }

  if (state === "sin_configurar") {
    return (
      <main className={styles.shell}>
        <div className={styles.gate}>
          <h1>El panel todavía no está conectado</h1>
          {/* Decir exactamente qué falta en vez de "error": quien abre esto es quien puede
              arreglarlo, y mandarlo a los logs del servidor le cuesta media hora. */}
          <p>{configMessage ?? "Faltan las credenciales de Discord en el servidor."}</p>
          <p className={styles.gateHint}>
            Los pasos están en <code>docs/34-discord.md</code>, sección 4.
          </p>
        </div>
      </main>
    );
  }

  if (state === "fuera" || !session) {
    return (
      <main className={styles.shell}>
        <div className={styles.gate}>
          <p className={styles.gateEyebrow}>Panel de operación</p>
          <h1>PULSO</h1>
          <p>
            Entra con la cuenta de Discord con la que estás en el servidor de Pulso. Tus permisos
            aquí son los roles que tengas allá.
          </p>
          {loginError && <p className={styles.gateError}>{loginError}</p>}
          <a className={styles.discordButton} href={`${apiUrl}/v1/admin/auth/login`}>
            Entrar con Discord
          </a>
        </div>
      </main>
    );
  }

  const visibleTasks = tasks.filter(
    (task) =>
      (taskFilter === "todas" ||
        (taskFilter === "libres" && task.status === "libre") ||
        (taskFilter === "activas" && ["tomado", "en_revision"].includes(task.status)) ||
        (taskFilter === "mias" && task.assigneeDiscordId === session.discordUserId)) &&
      (roleFilter === "todos" || task.roles.includes(roleFilter)),
  );

  const byHorizon = ["corto", "mediano", "largo"].map((horizon) => ({
    horizon,
    tasks: visibleTasks.filter((task) => task.horizon === horizon),
  }));

  // Los roles de área sin nadie detrás. Es la información que decide a quién invitar mañana, así
  // que vive en la navegación y no escondida al final de una lista.
  const missing = capabilities.filter((cap) => cap.status === "falta").length;
  const partial = capabilities.filter((cap) => cap.status === "parcial").length;
  const p0Missing = capabilities.filter(
    (cap) => cap.priority === "P0" && cap.status !== "listo",
  ).length;

  const emptyRoles = roles.filter(
    (role) =>
      AREA_ROLES.includes(role.name.toLowerCase()) &&
      !members.some((member) => member.roleIds.includes(role.id)),
  );

  const SECTIONS = [
    {
      id: "operacion" as const,
      label: "Operación",
      badge: pulse?.rescues.open ?? null,
      alert: (pulse?.rescues.open ?? 0) > 0,
    },
    {
      // El contador cuenta lo que falta, no lo que está hecho. Un panel que celebra el avance
      // esconde justo la información por la que alguien lo abre.
      id: "proyecto" as const,
      label: "Proyecto",
      badge: missing + partial || null,
      alert: p0Missing > 0,
    },
    {
      id: "equipo" as const,
      label: "Equipo",
      badge: members.length || null,
      alert: emptyRoles.length > 0,
    },
    {
      id: "tareas" as const,
      label: "Tareas",
      badge: pulse?.tasks.free ?? null,
      alert: (pulse?.tasks.staleTaken ?? 0) > 0,
    },
  ];

  return (
    <div className={styles.app}>
      <header className={styles.topBar}>
        <a className={styles.brand} href="/admin">
          <span className={styles.brandMark} aria-hidden="true" />
          <span>
            PULSO<em>panel</em>
          </span>
        </a>

        <nav className={styles.tabs} aria-label="Secciones del panel">
          {SECTIONS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={section === item.id ? styles.tabOn : styles.tab}
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setSection(item.id)}
            >
              {item.label}
              {item.badge !== null && (
                <span className={item.alert ? styles.badgeAlert : styles.badgeQuiet}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className={styles.identity}>
          {session.discordAvatarUrl && (
            // biome-ignore lint/performance/noImgElement: avatar remoto de Discord, sin loader.
            <img src={session.discordAvatarUrl} alt="" width={30} height={30} />
          )}
          <div>
            <strong>{session.discordUsername}</strong>
            <span>
              {session.superuser ? "superusuario" : session.roles.join(" · ") || "sin rol"}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              void api("/v1/admin/auth/logout", { method: "POST" }).then(() =>
                window.location.reload(),
              )
            }
          >
            Salir
          </button>
        </div>
      </header>

      <main className={styles.shell}>
        {notice && (
          <p className={styles.notice} role="alert">
            {notice}
          </p>
        )}

        {session.breakGlass && (
          // La sesión de emergencia se anuncia en pantalla. Una puerta de emergencia por la que se
          // entra sin notar que es la de emergencia deja de serlo y pasa a ser la puerta normal.
          <p className={styles.breakGlass} role="alert">
            Entraste por la <strong>vía de emergencia</strong>, sin pasar por Discord. La sesión
            dura dos horas y quedó registrada en el servidor. Si Discord ya responde, sal y entra
            por el camino normal.
          </p>
        )}

        {session.superuser && !session.breakGlass && (
          <p className={styles.readOnly}>
            Escribes por configuración del servidor, no por tu rol de Discord. Quitarte el rol no te
            saca de aquí.
          </p>
        )}

        {!session.canWrite && (
          <p className={styles.readOnly}>
            Estás en modo lectura. Asignar tickets y cambiar roles requiere el rol{" "}
            <strong>Maintainer</strong>.
          </p>
        )}

        {/* --- Operación ----------------------------------------------------- */}
        {section === "operacion" && pulse && (
          <section className={styles.section} aria-labelledby="operacion">
            <h2 id="operacion">Operación</h2>

            {/* El rescate va primero y con su propio tratamiento visual: es la P0 declarada, y un
              panel que lo pone entre las demás cifras contradice la prioridad que dice tener. */}
            <div
              className={`${styles.rescueCard} ${pulse.rescues.open > 0 ? styles.rescueActive : ""}`}
            >
              <div>
                <strong>{pulse.rescues.open}</strong>
                <span>
                  {pulse.rescues.open === 1 ? "rescate abierto" : "rescates abiertos"}
                  {pulse.rescues.withSignsOfLife > 0
                    ? ` · ${pulse.rescues.withSignsOfLife} con señales de vida`
                    : ""}
                </span>
              </div>
              {pulse.rescues.oldestOpenHours !== null && (
                <p>El más antiguo entró {relativeHours(pulse.rescues.oldestOpenHours)}.</p>
              )}
              {pulse.rescues.open === 0 && (
                // Cero rescates no es "todo bien": puede ser que nadie sepa que el botón existe.
                // Decirlo evita leer un cero como una buena noticia.
                <p>
                  Ninguno reportado. Eso no significa que no los haya: puede significar que la gente
                  todavía no sabe que puede reportarlo.
                </p>
              )}
            </div>

            <div className={styles.metrics}>
              <div className={styles.metric}>
                <strong>{pulse.reports.last24h}</strong>
                <span>reportes en 24 h</span>
                <small>{pulse.reports.total.toLocaleString("es-CO")} en total</small>
              </div>
              {pulse.reports.byType.map((entry) => (
                <div className={styles.metric} key={entry.type}>
                  <strong>{entry.count.toLocaleString("es-CO")}</strong>
                  <span>{entry.type}</span>
                </div>
              ))}
              <div className={styles.metric}>
                <strong>{pulse.contracts.pendingReview.toLocaleString("es-CO")}</strong>
                <span>contratos sin revisar</span>
                <small>{pulse.contracts.pendingTriage} sin lectura previa</small>
              </div>
            </div>

            <h3>Fuentes</h3>
            {pulse.sources.length === 0 ? (
              <p className={styles.empty}>Todavía no hay corridas de ingesta registradas.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fuente</th>
                    <th>Última corrida</th>
                    <th>Resultado</th>
                    <th className={styles.num}>Registros</th>
                  </tr>
                </thead>
                <tbody>
                  {pulse.sources.map((source) => (
                    <tr key={source.sourceId}>
                      <td>{source.sourceId}</td>
                      <td>
                        {source.lastRunAt
                          ? new Intl.DateTimeFormat("es-CO", {
                              dateStyle: "short",
                              timeStyle: "short",
                            }).format(new Date(source.lastRunAt))
                          : "—"}
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${styles[`s_${source.status ?? "none"}`]}`}
                        >
                          {source.status ?? "—"}
                        </span>
                      </td>
                      <td className={styles.num}>{source.records ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* --- Proyecto: qué hay y qué falta ---------------------------------- */}
        {section === "proyecto" && (
          <section className={styles.section} aria-labelledby="proyecto">
            <h2 id="proyecto">Qué hay y qué falta</h2>
            <p className={styles.sectionNote}>
              Inventario verificado contra el código, no deducido del backlog. Las prioridades van
              en su orden y no por avance: una pantalla ordenada por porcentaje pondría primero la
              que menos importa.
            </p>

            <div className={styles.metrics}>
              <div className={styles.metric}>
                <strong>{capabilities.filter((cap) => cap.status === "listo").length}</strong>
                <span>funcionando</span>
              </div>
              <div className={styles.metric}>
                <strong>{partial}</strong>
                <span>a medias</span>
                <small>construido pero no usable</small>
              </div>
              <div className={styles.metric}>
                <strong>{missing}</strong>
                <span>sin empezar</span>
              </div>
              <div className={styles.metric}>
                <strong className={p0Missing > 0 ? styles.stale : undefined}>{p0Missing}</strong>
                <span>huecos en P0</span>
                <small>la prioridad declarada</small>
              </div>
            </div>

            {PRIORITIES.map((priority) => {
              const group = capabilities.filter((cap) => cap.priority === priority.id);
              if (group.length === 0) return null;
              const done = group.filter((cap) => cap.status === "listo").length;
              return (
                <div className={styles.priorityBlock} key={priority.id} data-priority={priority.id}>
                  <header>
                    <span className={styles.taskCode}>{priority.id}</span>
                    <strong>{priority.title}</strong>
                    <span className={styles.taskMeta}>{priority.question}</span>
                    <span className={styles.priorityCount}>
                      {done}/{group.length}
                    </span>
                  </header>
                  <ul className={styles.capList}>
                    {group.map((cap) => (
                      <li className={styles.cap} key={cap.name} data-status={cap.status}>
                        <span className={`${styles.badge} ${styles[`c_${cap.status}`]}`}>
                          {CAP_STATUS_LABEL[cap.status] ?? cap.status}
                        </span>
                        <div>
                          <strong>{cap.name}</strong>
                          {/* La nota es lo que separa «a medias» de «falta». Sin ella los dos
                              estados dicen lo mismo. */}
                          {cap.note && <p>{cap.note}</p>}
                        </div>
                        {cap.taskCode && (
                          <button
                            type="button"
                            className={styles.capTask}
                            onClick={() => {
                              setSection("tareas");
                              setTaskFilter("todas");
                              setRoleFilter("todos");
                            }}
                          >
                            {cap.taskCode}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        )}

        {/* --- Equipo -------------------------------------------------------- */}
        {section === "equipo" && (
          <section className={styles.section} aria-labelledby="equipo">
            <h2 id="equipo">Equipo</h2>
            <p className={styles.sectionNote}>
              Leído del servidor de Discord. Cambiar un rol aquí lo cambia allá — es el mismo rol,
              no una copia.
            </p>

            {/* Un área sin nadie es un área cuyos tickets no va a tomar nadie. Se dice arriba, no se
            deduce contando tarjetas. */}
            {emptyRoles.length > 0 && (
              <p className={styles.gap}>
                Sin nadie asignado:{" "}
                <strong>{emptyRoles.map((role) => role.name).join(", ")}</strong>. Los tickets de
                esas áreas no tienen quién los tome.
              </p>
            )}

            <div className={styles.memberGrid}>
              {members.map((member) => {
                const assigned = tasks.filter((task) => task.assigneeDiscordId === member.userId);
                return (
                  <article className={styles.memberCard} key={member.userId}>
                    <header>
                      {member.avatarUrl && (
                        // biome-ignore lint/performance/noImgElement: avatar remoto de Discord.
                        <img src={member.avatarUrl} alt="" width={36} height={36} />
                      )}
                      <div>
                        <strong>{member.displayName}</strong>
                        <span>@{member.username}</span>
                      </div>
                    </header>

                    <div className={styles.roleChips}>
                      {roles.map((role) => {
                        const has = member.roleIds.includes(role.id);
                        const key = `${member.userId}:${role.id}`;
                        return (
                          <button
                            type="button"
                            key={role.id}
                            className={has ? styles.roleOn : styles.roleOff}
                            disabled={!session.canWrite || busy === key}
                            onClick={() =>
                              void mutate(
                                `/v1/admin/team/${member.userId}/roles`,
                                {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    roleId: role.id,
                                    action: has ? "remove" : "add",
                                  }),
                                },
                                key,
                              )
                            }
                          >
                            {role.name}
                          </button>
                        );
                      })}
                    </div>

                    <p className={styles.memberLoad}>
                      {assigned.length === 0
                        ? "Sin tickets asignados"
                        : assigned.map((task) => task.code).join(" · ")}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* --- Tareas -------------------------------------------------------- */}
        {section === "tareas" && (
          <section className={styles.section} aria-labelledby="tareas">
            <h2 id="tareas">Tareas</h2>
            {pulse && (
              <p className={styles.sectionNote}>
                {pulse.tasks.free} libres · {pulse.tasks.taken} tomadas · {pulse.tasks.inReview} en
                revisión · {pulse.tasks.done} hechas
                {pulse.tasks.staleTaken > 0 && (
                  // Un ticket tomado hace 48 h sin moverse es la señal más útil de este panel: nadie
                  // avisa de que está atascado, hay que ir a buscarlo.
                  <strong className={styles.stale}>
                    {" "}
                    · {pulse.tasks.staleTaken} tomadas hace más de 48 h
                  </strong>
                )}
              </p>
            )}

            {/* Con 20 tickets caben en una pantalla; con 60 no. Los filtros existen para que la
            pregunta «qué puedo tomar yo» se responda sin leer la lista entera. */}
            <div className={styles.filters}>
              <fieldset className={styles.filterGroup} aria-label="Filtrar por estado">
                {TASK_FILTERS.map((filter) => (
                  <button
                    type="button"
                    key={filter.id}
                    className={taskFilter === filter.id ? styles.chipOn : styles.chip}
                    onClick={() => setTaskFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </fieldset>
              <label className={styles.filterSelect}>
                <span className={styles.srOnly}>Filtrar por área</span>
                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                  <option value="todos">Todas las áreas</option>
                  {AREA_ROLES.map((role) => (
                    <option value={role} key={role}>
                      {role}
                    </option>
                  ))}
                  <option value="contributor">contributor</option>
                </select>
              </label>
              <span className={styles.filterCount}>
                {visibleTasks.length} de {tasks.length}
              </span>
            </div>

            {visibleTasks.length === 0 && (
              <p className={styles.empty}>Ningún ticket coincide con ese filtro.</p>
            )}

            {byHorizon.map(({ horizon, tasks: group }) =>
              group.length === 0 ? null : (
                <div key={horizon}>
                  <h3>{HORIZON_LABEL[horizon]}</h3>
                  <ul className={styles.taskList}>
                    {group.map((task) => (
                      <li className={styles.task} key={task.code} data-priority={task.priority}>
                        <div className={styles.taskHead}>
                          <span className={styles.taskCode}>{task.code}</span>
                          <strong>{task.title}</strong>
                          <span className={styles.taskMeta}>
                            {task.size} · {task.roles.join(", ")}
                          </span>
                          <span className={`${styles.badge} ${styles[`t_${task.status}`]}`}>
                            {STATUS_LABEL[task.status] ?? task.status}
                          </span>
                        </div>

                        {task.summary && <p className={styles.taskSummary}>{task.summary}</p>}
                        {task.acceptance && (
                          <p className={styles.taskAcceptance}>
                            <span>Acepta cuando</span> {task.acceptance}
                          </p>
                        )}
                        {task.dependsOn.length > 0 && (
                          <p className={styles.taskDepends}>
                            Depende de {task.dependsOn.join(", ")}
                          </p>
                        )}

                        <div className={styles.taskActions}>
                          <label>
                            <span className={styles.srOnly}>Responsable de {task.code}</span>
                            <select
                              value={task.assigneeDiscordId ?? ""}
                              disabled={!session.canWrite || busy === task.code}
                              onChange={(event) => {
                                const member = members.find((m) => m.userId === event.target.value);
                                void mutate(
                                  `/v1/admin/tasks/${task.code}/assignee`,
                                  {
                                    method: "PATCH",
                                    body: JSON.stringify({
                                      discordUserId: member?.userId ?? null,
                                      username: member?.displayName ?? null,
                                    }),
                                  },
                                  task.code,
                                );
                              }}
                            >
                              <option value="">Sin asignar</option>
                              {members.map((member) => (
                                <option value={member.userId} key={member.userId}>
                                  {member.displayName}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            <span className={styles.srOnly}>Estado de {task.code}</span>
                            <select
                              value={task.status}
                              disabled={!session.canWrite || busy === `${task.code}:status`}
                              onChange={(event) =>
                                void mutate(
                                  `/v1/admin/tasks/${task.code}/status`,
                                  {
                                    method: "PATCH",
                                    body: JSON.stringify({ status: event.target.value }),
                                  },
                                  `${task.code}:status`,
                                )
                              }
                            >
                              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                                <option value={value} key={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <button
                            type="button"
                            disabled={!session.canWrite || busy === `${task.code}:publish`}
                            onClick={() =>
                              void mutate(
                                `/v1/admin/tasks/${task.code}/publish`,
                                { method: "POST" },
                                `${task.code}:publish`,
                              )
                            }
                          >
                            {task.discordThreadId ? "Republicar en Discord" : "Publicar en #tareas"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </section>
        )}
      </main>
    </div>
  );
}
