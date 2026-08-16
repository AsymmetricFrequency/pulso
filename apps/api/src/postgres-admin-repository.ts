import { createHmac, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { v7 as uuidv7 } from "uuid";

/**
 * Estado del panel administrativo: sesiones, tickets y el pulso de la operación.
 *
 * No hay adaptador en memoria y es a propósito: este panel solo existe contra la base real. Un panel
 * de administración con datos de demostración no responde la pregunta para la que existe —cuántos
 * rescates hay abiertos ahora mismo— y tener una segunda implementación que dice otra cosa sería
 * peor que no tenerla.
 */

const SESSION_HOURS = 12;

export type AdminSession = {
  discordUserId: string;
  discordUsername: string;
  discordAvatarUrl: string | null;
  roles: string[];
  expiresAt: string;
};

export type ProjectTask = {
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
  branch: string | null;
  technical: string | null;
  claimedAt: string | null;
  completedAt: string | null;
};

export type Capability = {
  priority: string;
  name: string;
  status: string;
  note: string | null;
  taskCode: string | null;
};

export type OperationPulse = {
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

const asString = (value: unknown) => (value === null || value === undefined ? null : String(value));
const asDate = (value: unknown) => (value ? new Date(String(value)).toISOString() : null);

const taskFromRow = (row: Record<string, unknown>): ProjectTask => ({
  code: String(row.code),
  title: String(row.title),
  summary: asString(row.summary),
  acceptance: asString(row.acceptance),
  priority: String(row.priority),
  size: String(row.size),
  roles: (row.roles as string[] | null) ?? [],
  horizon: String(row.horizon),
  status: String(row.status),
  assigneeDiscordId: asString(row.assignee_discord_id),
  assigneeUsername: asString(row.assignee_username),
  dependsOn: (row.depends_on as string[] | null) ?? [],
  discordThreadId: asString(row.discord_thread_id),
  branch: asString(row.branch),
  technical: asString(row.technical),
  claimedAt: asDate(row.claimed_at),
  completedAt: asDate(row.completed_at),
});

export class PostgresAdminRepository {
  constructor(
    private readonly sql: postgres.Sql,
    private readonly secret: string,
  ) {
    if (secret.length < 32) throw new Error("ADMIN_SESSION_SECRET must have 32 characters");
  }

  #hash(token: string) {
    return createHmac("sha256", this.secret).update(token).digest("hex");
  }

  async createSession(member: {
    discordUserId: string;
    discordUsername: string;
    discordAvatarUrl: string | null;
    roles: string[];
  }): Promise<{ token: string; session: AdminSession }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString();
    await this.sql`
      INSERT INTO admin_sessions
        (id, token_hash, discord_user_id, discord_username, discord_avatar_url, roles, expires_at)
      VALUES (
        ${uuidv7()}, ${this.#hash(token)}, ${member.discordUserId}, ${member.discordUsername},
        ${member.discordAvatarUrl}, ${this.sql.json(member.roles)}, ${expiresAt}
      )
    `;
    return { token, session: { ...member, expiresAt } };
  }

  async resolveSession(token: string | undefined): Promise<AdminSession | null> {
    if (!token) return null;
    const [row] = await this.sql<Record<string, unknown>[]>`
      UPDATE admin_sessions SET last_seen_at = now()
      WHERE token_hash = ${this.#hash(token)} AND expires_at > now()
      RETURNING discord_user_id, discord_username, discord_avatar_url, roles, expires_at
    `;
    if (!row) return null;
    return {
      discordUserId: String(row.discord_user_id),
      discordUsername: String(row.discord_username),
      discordAvatarUrl: asString(row.discord_avatar_url),
      roles: (row.roles as string[] | null) ?? [],
      expiresAt: new Date(String(row.expires_at)).toISOString(),
    };
  }

  async destroySession(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.sql`DELETE FROM admin_sessions WHERE token_hash = ${this.#hash(token)}`;
  }

  async listTasks(): Promise<ProjectTask[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM project_tasks
      ORDER BY
        CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END,
        sort_order
    `;
    return rows.map(taskFromRow);
  }

  /**
   * Qué hace Pulso y qué todavía no.
   *
   * Va ordenado por prioridad y no por estado: el orden de lectura tiene que ser el orden en que
   * importa, no «primero lo bonito que ya está hecho».
   */
  async listCapabilities(): Promise<Capability[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT priority, name, status, note, task_code FROM project_capabilities
      ORDER BY
        CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END,
        sort_order
    `;
    return rows.map((row) => ({
      priority: String(row.priority),
      name: String(row.name),
      status: String(row.status),
      note: asString(row.note),
      taskCode: asString(row.task_code),
    }));
  }

  /**
   * Asigna o suelta un ticket.
   *
   * Escribe el evento en la misma transacción que el cambio. Si se hicieran por separado, un fallo
   * entre los dos dejaría un ticket reasignado sin rastro de quién lo tenía antes — que es
   * justamente la información que sirve para ver qué lleva días atascado.
   */
  async assignTask(
    code: string,
    assignee: { discordUserId: string; username: string } | null,
    actor: { discordUserId: string; username: string },
  ): Promise<ProjectTask | null> {
    return this.sql.begin(async (tx) => {
      const [current] = await tx<Record<string, unknown>[]>`
        SELECT id, assignee_username, status FROM project_tasks WHERE code = ${code}
      `;
      if (!current) return null;

      const [row] = await tx<Record<string, unknown>[]>`
        UPDATE project_tasks SET
          assignee_discord_id = ${assignee?.discordUserId ?? null},
          assignee_username = ${assignee?.username ?? null},
          status = ${assignee ? "tomado" : "libre"},
          claimed_at = ${assignee ? new Date().toISOString() : null},
          updated_at = now()
        WHERE code = ${code}
        RETURNING *
      `;
      await tx`
        INSERT INTO project_task_events
          (id, task_id, kind, from_value, to_value, actor_discord_id, actor_username)
        VALUES (
          ${uuidv7()}, ${String(current.id)}, ${assignee ? "assigned" : "released"},
          ${asString(current.assignee_username)}, ${assignee?.username ?? null},
          ${actor.discordUserId}, ${actor.username}
        )
      `;
      return row ? taskFromRow(row) : null;
    });
  }

  async setTaskStatus(
    code: string,
    status: string,
    actor: { discordUserId: string; username: string },
  ): Promise<ProjectTask | null> {
    return this.sql.begin(async (tx) => {
      const [current] = await tx<Record<string, unknown>[]>`
        SELECT id, status FROM project_tasks WHERE code = ${code}
      `;
      if (!current) return null;

      const [row] = await tx<Record<string, unknown>[]>`
        UPDATE project_tasks SET
          status = ${status},
          completed_at = ${status === "hecho" ? new Date().toISOString() : null},
          updated_at = now()
        WHERE code = ${code}
        RETURNING *
      `;
      await tx`
        INSERT INTO project_task_events
          (id, task_id, kind, from_value, to_value, actor_discord_id, actor_username)
        VALUES (
          ${uuidv7()}, ${String(current.id)}, 'status_changed', ${String(current.status)}, ${status},
          ${actor.discordUserId}, ${actor.username}
        )
      `;
      return row ? taskFromRow(row) : null;
    });
  }

  async recordThread(code: string, threadId: string): Promise<void> {
    await this.sql`
      UPDATE project_tasks SET discord_thread_id = ${threadId}, updated_at = now()
      WHERE code = ${code}
    `;
  }

  /**
   * Lo que hoy hay que sacar con `psql`.
   *
   * Va en una sola ida a la base y no en siete: el panel se abre en un teléfono, en la calle, para
   * responder una pregunta urgente.
   */
  async operationPulse(incidentCode: string): Promise<OperationPulse> {
    const [rescues, reports, byType, contracts, sources, tasks] = await Promise.all([
      this.sql<Record<string, unknown>[]>`
        SELECT
          count(*)::int AS open,
          count(*) FILTER (WHERE c.signs_of_life = 'yes')::int AS with_signs,
          -- Calificada con el alias: la tabla incidents también tiene created_at, y sin el prefijo
          -- Postgres rechaza la consulta entera por ambigua.
          max(EXTRACT(EPOCH FROM (now() - c.created_at)) / 3600)::numeric(10,1) AS oldest_hours
        FROM community_reports c
        JOIN incidents i ON i.id = c.incident_id
        WHERE i.code = ${incidentCode}
          AND c.report_type = 'rescate'
          AND c.status NOT IN ('rejected', 'superseded')
      `,
      this.sql<Record<string, unknown>[]>`
        SELECT
          count(*) FILTER (WHERE c.created_at > now() - interval '24 hours')::int AS last24h,
          count(*)::int AS total
        FROM community_reports c
        JOIN incidents i ON i.id = c.incident_id
        WHERE i.code = ${incidentCode} AND c.status <> 'rejected'
      `,
      this.sql<Record<string, unknown>[]>`
        SELECT c.report_type AS type, count(*)::int AS count
        FROM community_reports c
        JOIN incidents i ON i.id = c.incident_id
        WHERE i.code = ${incidentCode} AND c.status <> 'rejected'
        GROUP BY c.report_type
      `,
      this.sql<Record<string, unknown>[]>`
        SELECT
          count(*) FILTER (WHERE c.reviewed_at IS NULL)::int AS pending_review,
          count(*) FILTER (WHERE c.triage_at IS NULL AND c.reviewed_at IS NULL)::int AS pending_triage,
          count(*) FILTER (WHERE c.emergency_relevance = 'confirmed')::int AS confirmed
        FROM contracts c
        JOIN incidents i ON i.id = c.incident_id
        WHERE i.code = ${incidentCode}
      `,
      // La última corrida de cada fuente. `DISTINCT ON` con el mismo orden que el índice
      // `source_ingestion_runs_latest_idx`, así que no hay ordenación en memoria.
      this.sql<Record<string, unknown>[]>`
        SELECT DISTINCT ON (source_id)
          source_id, started_at, status, records_seen
        FROM source_ingestion_runs
        ORDER BY source_id, started_at DESC
      `,
      this.sql<Record<string, unknown>[]>`
        SELECT
          count(*) FILTER (WHERE status = 'libre')::int AS free,
          count(*) FILTER (WHERE status = 'tomado')::int AS taken,
          count(*) FILTER (WHERE status = 'en_revision')::int AS in_review,
          count(*) FILTER (WHERE status = 'hecho')::int AS done,
          count(*) FILTER (WHERE status = 'tomado' AND claimed_at < now() - interval '48 hours')::int AS stale
        FROM project_tasks
      `,
    ]);

    const number = (value: unknown) => Number(value ?? 0);

    return {
      rescues: {
        open: number(rescues[0]?.open),
        withSignsOfLife: number(rescues[0]?.with_signs),
        oldestOpenHours: rescues[0]?.oldest_hours ? Number(rescues[0].oldest_hours) : null,
      },
      reports: {
        last24h: number(reports[0]?.last24h),
        total: number(reports[0]?.total),
        byType: byType.map((row) => ({ type: String(row.type), count: number(row.count) })),
      },
      contracts: {
        pendingReview: number(contracts[0]?.pending_review),
        pendingTriage: number(contracts[0]?.pending_triage),
        confirmed: number(contracts[0]?.confirmed),
      },
      sources: sources.map((row) => ({
        sourceId: String(row.source_id),
        lastRunAt: asDate(row.started_at),
        status: asString(row.status),
        records: row.records_seen === null ? null : number(row.records_seen),
      })),
      tasks: {
        free: number(tasks[0]?.free),
        taken: number(tasks[0]?.taken),
        inReview: number(tasks[0]?.in_review),
        done: number(tasks[0]?.done),
        staleTaken: number(tasks[0]?.stale),
      },
    };
  }
}
