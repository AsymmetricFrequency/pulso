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

const LOGIN_ERROR: Record<string, string> = {
  state: "La sesión de entrada expiró. Intenta de nuevo.",
  sin_rol: "Tu cuenta está en el servidor pero no tiene ningún rol de Pulso asignado.",
  no_miembro: "Esa cuenta de Discord no pertenece al servidor de Pulso.",
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
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loginError = useMemo(() => {
    if (typeof window === "undefined") return null;
    const code = new URLSearchParams(window.location.search).get("error");
    return code ? (LOGIN_ERROR[code] ?? "No se pudo entrar.") : null;
  }, []);

  const loadAll = useCallback(async () => {
    const [pulseResponse, tasksResponse, teamResponse] = await Promise.all([
      api("/v1/admin/pulse"),
      api("/v1/admin/tasks"),
      api("/v1/admin/team"),
    ]);
    if (pulseResponse.ok) setPulse((await pulseResponse.json()) as Pulse);
    if (tasksResponse.ok) setTasks((await tasksResponse.json()) as Task[]);
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

  const byHorizon = ["corto", "mediano", "largo"].map((horizon) => ({
    horizon,
    tasks: tasks.filter((task) => task.horizon === horizon),
  }));

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Panel de operación</p>
          <h1>PULSO</h1>
        </div>
        <div className={styles.identity}>
          {session.discordAvatarUrl && (
            // biome-ignore lint/performance/noImgElement: avatar remoto de Discord, sin loader.
            <img src={session.discordAvatarUrl} alt="" width={32} height={32} />
          )}
          <div>
            <strong>{session.discordUsername}</strong>
            <span>{session.roles.join(" · ") || "sin rol"}</span>
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

      {notice && (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      )}

      {!session.canWrite && (
        <p className={styles.readOnly}>
          Estás en modo lectura. Asignar tickets y cambiar roles requiere el rol{" "}
          <strong>Maintainer</strong>.
        </p>
      )}

      {/* --- Operación ----------------------------------------------------- */}
      {pulse && (
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
                      <span className={`${styles.badge} ${styles[`s_${source.status ?? "none"}`]}`}>
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

      {/* --- Equipo -------------------------------------------------------- */}
      <section className={styles.section} aria-labelledby="equipo">
        <h2 id="equipo">Equipo</h2>
        <p className={styles.sectionNote}>
          Leído del servidor de Discord. Cambiar un rol aquí lo cambia allá — es el mismo rol, no
          una copia.
        </p>

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

      {/* --- Tareas -------------------------------------------------------- */}
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
                      <p className={styles.taskDepends}>Depende de {task.dependsOn.join(", ")}</p>
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
    </main>
  );
}
