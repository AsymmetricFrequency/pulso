import { createHmac, randomBytes } from "node:crypto";
import {
  type IncidentRepository,
  MissionAccessDeniedError,
  MissionInvitationConflictError,
  MissionRateLimitError,
  type OperationsAccessRepository,
  type OperationsRepository,
  type ResolvedOperationsSession,
} from "@pulso/domain";
import type {
  CreateOperationsInvitationInput,
  IssuedOperationsInvitationDto,
  OperationsSessionDto,
  RedeemOperationsInvitationInput,
} from "@pulso/schemas";
import type postgres from "postgres";
import { v7 as uuidv7 } from "uuid";

type DbRow = Record<string, unknown>;
type InvitationRecord = {
  id: string;
  incidentId: string;
  actorId: string;
  expiresAt: string;
  redeemedAt: string | null;
};
type SessionRecord = ResolvedOperationsSession & { tokenHash: string };

const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
const makeCode = () =>
  Array.from(randomBytes(10), (byte) => alphabet[byte % alphabet.length]).join("");
const makeToken = () => randomBytes(32).toString("base64url");
const addMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

abstract class HashedOperationsAccessRepository {
  constructor(protected readonly secret: string) {
    if (secret.length < 32) throw new Error("OPERATIONS_ACCESS_SECRET must have 32 characters");
  }

  protected hash(value: string) {
    return createHmac("sha256", this.secret).update(value).digest("hex");
  }
}

export class MemoryOperationsAccessRepository
  extends HashedOperationsAccessRepository
  implements OperationsAccessRepository
{
  readonly #invitations = new Map<string, InvitationRecord>();
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #attempts = new Map<string, { attempts: number; resetAt: number }>();

  constructor(
    secret: string,
    private readonly incidents: IncidentRepository,
    private readonly operations: OperationsRepository,
  ) {
    super(secret);
  }

  async issueInvitation(
    incidentId: string,
    input: CreateOperationsInvitationInput,
    siteUrl: string,
    _issuedByActorId: string,
  ): Promise<IssuedOperationsInvitationDto> {
    const actor = await this.operations.findActor(input.actorId);
    if (
      !actor ||
      actor.incidentId !== incidentId ||
      actor.status !== "active" ||
      !["coordinator", "auditor", "incident_admin"].includes(actor.role)
    ) {
      throw new MissionInvitationConflictError(
        "La persona debe tener un rol operacional activo en esta emergencia.",
      );
    }
    let code = makeCode();
    while (this.#invitations.has(this.hash(code))) code = makeCode();
    const record: InvitationRecord = {
      id: uuidv7(),
      incidentId,
      actorId: actor.id,
      expiresAt: addMinutes(input.expiresInMinutes),
      redeemedAt: null,
    };
    this.#invitations.set(this.hash(code), record);
    return {
      ...record,
      code,
      link: `${siteUrl.replace(/\/$/, "")}/operations?code=${code}`,
    };
  }

  async redeemInvitation(
    input: RedeemOperationsInvitationInput,
    sourceIp: string,
  ): Promise<OperationsSessionDto> {
    const code = normalizeCode(input.code);
    const rateKey = this.hash(`${sourceIp}:${code}`);
    this.#consumeAttempt(rateKey);
    const record = this.#invitations.get(this.hash(code));
    if (!record || record.redeemedAt || record.expiresAt <= new Date().toISOString()) {
      throw new MissionAccessDeniedError("El acceso venció, ya fue usado o no existe.");
    }
    const [actor, incident] = await Promise.all([
      this.operations.findActor(record.actorId),
      this.incidents.findById(record.incidentId),
    ]);
    if (
      !actor ||
      !incident ||
      actor.status !== "active" ||
      !["coordinator", "auditor", "incident_admin"].includes(actor.role)
    ) {
      throw new MissionAccessDeniedError();
    }
    const token = makeToken();
    const expiresAt = addMinutes(12 * 60);
    const session: SessionRecord = {
      id: uuidv7(),
      tokenHash: this.hash(token),
      actorId: actor.id,
      incidentId: incident.id,
      deviceId: input.deviceId,
      role: actor.role as SessionRecord["role"],
      expiresAt,
    };
    record.redeemedAt = new Date().toISOString();
    this.#sessions.set(session.tokenHash, session);
    this.#attempts.delete(rateKey);
    return {
      sessionToken: token,
      sessionExpiresAt: expiresAt,
      actor: {
        id: actor.id,
        incidentId: actor.incidentId,
        displayName: actor.displayName,
        role: session.role,
      },
      incident: { id: incident.id, code: incident.code, name: incident.name },
    };
  }

  async resolveSession(token: string) {
    const session = this.#sessions.get(this.hash(token));
    if (!session || session.expiresAt <= new Date().toISOString()) {
      throw new MissionAccessDeniedError();
    }
    return session;
  }

  #consumeAttempt(rateKey: string) {
    const now = Date.now();
    const current = this.#attempts.get(rateKey);
    const next =
      !current || current.resetAt <= now
        ? { attempts: 1, resetAt: now + 15 * 60_000 }
        : { attempts: current.attempts + 1, resetAt: current.resetAt };
    this.#attempts.set(rateKey, next);
    if (next.attempts > 5) {
      throw new MissionRateLimitError(Math.max(1, Math.ceil((next.resetAt - now) / 1000)));
    }
  }
}

export class PostgresOperationsAccessRepository
  extends HashedOperationsAccessRepository
  implements OperationsAccessRepository
{
  constructor(
    secret: string,
    private readonly sql: postgres.Sql,
  ) {
    super(secret);
  }

  async issueInvitation(
    incidentId: string,
    input: CreateOperationsInvitationInput,
    siteUrl: string,
    issuedByActorId: string,
  ): Promise<IssuedOperationsInvitationDto> {
    const [eligible] = await this.sql<DbRow[]>`
      SELECT id FROM actors WHERE id = ${input.actorId} AND incident_id = ${incidentId}
        AND actor_role IN ('coordinator', 'auditor', 'incident_admin')
        AND status = 'active' AND deleted_at IS NULL LIMIT 1
    `;
    if (!eligible) {
      throw new MissionInvitationConflictError(
        "La persona debe tener un rol operacional activo en esta emergencia.",
      );
    }
    const code = makeCode();
    const invitation = {
      id: uuidv7(),
      incidentId,
      actorId: input.actorId,
      code,
      link: `${siteUrl.replace(/\/$/, "")}/operations?code=${code}`,
      expiresAt: addMinutes(input.expiresInMinutes),
    };
    await this.sql`
      INSERT INTO operations_invitations (
        id, incident_id, actor_id, issued_by_actor_id, code_hash, expires_at
      ) VALUES (
        ${invitation.id}, ${incidentId}, ${input.actorId}, ${issuedByActorId},
        ${this.hash(code)}, ${invitation.expiresAt}
      )
    `;
    return invitation;
  }

  async redeemInvitation(
    input: RedeemOperationsInvitationInput,
    sourceIp: string,
  ): Promise<OperationsSessionDto> {
    const code = normalizeCode(input.code);
    const rateKey = this.hash(`${sourceIp}:${code}`);
    await this.#consumeAttempt(rateKey);
    try {
      const result = await this.sql.begin(async (transaction) => {
        const [row] = await transaction<DbRow[]>`
          SELECT oi.id AS invitation_id, oi.expires_at, oi.redeemed_at,
            i.id AS incident_id, i.code AS incident_code, i.name AS incident_name,
            a.id AS actor_id, a.display_name, a.actor_role
          FROM operations_invitations oi
          JOIN incidents i ON i.id = oi.incident_id AND i.deleted_at IS NULL
          JOIN actors a ON a.id = oi.actor_id AND a.incident_id = i.id
            AND a.actor_role IN ('coordinator', 'auditor', 'incident_admin')
            AND a.status = 'active' AND a.deleted_at IS NULL
          WHERE oi.code_hash = ${this.hash(code)} AND oi.revoked_at IS NULL FOR UPDATE OF oi
        `;
        if (!row || row.redeemed_at || new Date(String(row.expires_at)) <= new Date()) {
          throw new MissionAccessDeniedError("El acceso venció, ya fue usado o no existe.");
        }
        const token = makeToken();
        const expiresAt = addMinutes(12 * 60);
        await transaction`UPDATE operations_invitations SET redeemed_at = now()
          WHERE id = ${String(row.invitation_id)}`;
        await transaction`
          INSERT INTO operations_sessions (
            id, incident_id, actor_id, device_id, token_hash, expires_at
          ) VALUES (
            ${uuidv7()}, ${String(row.incident_id)}, ${String(row.actor_id)}, ${input.deviceId},
            ${this.hash(token)}, ${expiresAt}
          )
        `;
        return {
          sessionToken: token,
          sessionExpiresAt: expiresAt,
          actor: {
            id: String(row.actor_id),
            incidentId: String(row.incident_id),
            displayName: String(row.display_name),
            role: String(row.actor_role) as OperationsSessionDto["actor"]["role"],
          },
          incident: {
            id: String(row.incident_id),
            code: String(row.incident_code),
            name: String(row.incident_name),
          },
        } satisfies OperationsSessionDto;
      });
      await this.sql`DELETE FROM access_rate_limits WHERE key_hash = ${rateKey}`;
      await this.#audit(
        "operations_invitation.redeemed",
        result.actor.id,
        result.incident.id,
        true,
      );
      return result;
    } catch (error) {
      await this.#audit("operations_invitation.redeem_failed", null, null, false);
      throw error;
    }
  }

  async resolveSession(token: string): Promise<ResolvedOperationsSession> {
    const [row] = await this.sql<DbRow[]>`
      SELECT os.id, os.actor_id, os.incident_id, os.device_id, os.expires_at, a.actor_role
      FROM operations_sessions os
      JOIN actors a ON a.id = os.actor_id AND a.incident_id = os.incident_id
        AND a.actor_role IN ('coordinator', 'auditor', 'incident_admin')
        AND a.status = 'active' AND a.deleted_at IS NULL
      WHERE os.token_hash = ${this.hash(token)} AND os.revoked_at IS NULL
        AND os.expires_at > now() LIMIT 1
    `;
    if (!row) throw new MissionAccessDeniedError();
    return {
      id: String(row.id),
      actorId: String(row.actor_id),
      incidentId: String(row.incident_id),
      deviceId: String(row.device_id),
      role: String(row.actor_role) as ResolvedOperationsSession["role"],
      expiresAt: new Date(String(row.expires_at)).toISOString(),
    };
  }

  async #consumeAttempt(rateKey: string) {
    const [row] = await this.sql<DbRow[]>`
      INSERT INTO access_rate_limits (key_hash, attempts, reset_at)
      VALUES (${rateKey}, 1, now() + interval '15 minutes')
      ON CONFLICT (key_hash) DO UPDATE SET
        attempts = CASE WHEN access_rate_limits.reset_at <= now() THEN 1
          ELSE access_rate_limits.attempts + 1 END,
        reset_at = CASE WHEN access_rate_limits.reset_at <= now()
          THEN now() + interval '15 minutes' ELSE access_rate_limits.reset_at END
      RETURNING attempts, reset_at
    `;
    if (Number(row?.attempts) > 5) {
      const retryAfter = Math.max(
        1,
        Math.ceil((new Date(String(row?.reset_at)).getTime() - Date.now()) / 1000),
      );
      throw new MissionRateLimitError(retryAfter);
    }
  }

  async #audit(
    eventType: string,
    actorId: string | null,
    incidentId: string | null,
    succeeded: boolean,
  ) {
    await this.sql`
      INSERT INTO operations_access_events (id, event_type, actor_id, incident_id, succeeded)
      VALUES (${uuidv7()}, ${eventType}, ${actorId}, ${incidentId}, ${succeeded})
    `;
  }
}
