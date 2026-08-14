import { createHmac, randomBytes } from "node:crypto";
import {
  MissionAccessDeniedError,
  type MissionAccessRepository,
  MissionInvitationConflictError,
  MissionRateLimitError,
  type OperationsRepository,
  type ResolvedFieldSession,
  type StoredPasskey,
  type TerritoryRepository,
} from "@pulso/domain";
import type {
  BeginPasskeyAuthenticationInput,
  CreateMissionInvitationInput,
  FieldSessionDto,
  IssuedMissionInvitationDto,
  MissionPackageDto,
  RedeemMissionInvitationInput,
} from "@pulso/schemas";
import type postgres from "postgres";
import { v7 as uuidv7 } from "uuid";

type InvitationRecord = {
  id: string;
  assignmentId: string;
  actorId: string;
  expiresAt: string;
  redeemedAt: string | null;
};

type SessionRecord = ResolvedFieldSession & { tokenHash: string };
type AuthenticationAttemptRecord = {
  id: string;
  actorId: string;
  assignmentId: string;
  deviceId: string;
  challenge: string;
  expiresAt: string;
};
type DbRow = Record<string, unknown>;

const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
const makeCode = () =>
  Array.from(randomBytes(10), (byte) => alphabet[byte % alphabet.length]).join("");
const makeToken = () => randomBytes(32).toString("base64url");
const addMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

const missionFromRow = (row: DbRow): MissionPackageDto => ({
  assignmentId: String(row.assignment_id),
  incidentId: String(row.incident_id),
  actorId: String(row.actor_id),
  actorName: String(row.actor_name),
  teamId: String(row.team_id),
  teamName: String(row.team_name),
  zoneId: String(row.zone_id),
  zoneReference: String(row.zone_reference),
  location: String(row.location),
  objective: String(row.objective),
  startsAt: new Date(String(row.starts_at)).toISOString(),
  dueAt: row.due_at ? new Date(String(row.due_at)).toISOString() : null,
});

abstract class HashedAccessRepository {
  constructor(protected readonly secret: string) {
    if (secret.length < 32)
      throw new Error("MISSION_INVITATION_SECRET must contain at least 32 characters");
  }

  protected hash(value: string) {
    return createHmac("sha256", this.secret).update(value).digest("hex");
  }
}

export class MemoryMissionAccessRepository
  extends HashedAccessRepository
  implements MissionAccessRepository
{
  readonly #invitations = new Map<string, InvitationRecord>();
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #challenges = new Map<string, { value: string; expiresAt: string }>();
  readonly #passkeys = new Map<string, StoredPasskey>();
  readonly #authenticationAttempts = new Map<string, AuthenticationAttemptRecord>();
  readonly #redemptionAttempts = new Map<string, { attempts: number; resetAt: number }>();

  constructor(
    secret: string,
    private readonly operations: OperationsRepository,
    private readonly territories: TerritoryRepository,
  ) {
    super(secret);
  }

  async issueInvitation(
    assignmentId: string,
    input: CreateMissionInvitationInput,
    siteUrl: string,
    _issuedByActorId: string,
  ): Promise<IssuedMissionInvitationDto> {
    const assignment = await this.operations.findFieldAssignment(assignmentId);
    if (!assignment) throw new MissionAccessDeniedError("La misión no existe.");
    const actor = await this.operations.findActor(input.actorId);
    const memberships = await this.operations.listTeamMemberships(assignment.teamId);
    if (actor?.status !== "active" || !memberships.some((item) => item.actorId === actor.id)) {
      throw new MissionInvitationConflictError(
        "La persona debe ser integrante activo de la brigada.",
      );
    }
    let code = makeCode();
    while (this.#invitations.has(this.hash(code))) code = makeCode();
    const record: InvitationRecord = {
      id: uuidv7(),
      assignmentId,
      actorId: actor.id,
      expiresAt: addMinutes(input.expiresInMinutes),
      redeemedAt: null,
    };
    this.#invitations.set(this.hash(code), record);
    return {
      ...record,
      code,
      link: `${siteUrl.replace(/\/$/, "")}/field?code=${code}`,
    };
  }

  async redeemInvitation(
    input: RedeemMissionInvitationInput,
    sourceIp: string,
  ): Promise<FieldSessionDto> {
    const code = normalizeCode(input.code);
    const rateKey = this.hash(`${sourceIp}:${code}`);
    this.#consumeRedemptionAttempt(rateKey);
    const record = this.#invitations.get(this.hash(code));
    if (!record) throw new MissionAccessDeniedError();
    if (record.redeemedAt || record.expiresAt <= new Date().toISOString()) {
      throw new MissionAccessDeniedError("La invitación venció o ya fue utilizada.");
    }
    const mission = await this.#buildMission(record.assignmentId, record.actorId);
    record.redeemedAt = new Date().toISOString();
    this.#redemptionAttempts.delete(rateKey);
    return this.#storeSession(record.actorId, input.deviceId, mission);
  }

  async resolveSession(token: string): Promise<ResolvedFieldSession> {
    const session = this.#sessions.get(this.hash(token));
    if (!session || session.expiresAt <= new Date().toISOString())
      throw new MissionAccessDeniedError();
    return session;
  }

  async saveRegistrationChallenge(sessionId: string, challenge: string, expiresAt: string) {
    this.#challenges.set(sessionId, { value: challenge, expiresAt });
  }

  async consumeRegistrationChallenge(sessionId: string): Promise<string> {
    const challenge = this.#challenges.get(sessionId);
    this.#challenges.delete(sessionId);
    if (!challenge || challenge.expiresAt <= new Date().toISOString()) {
      throw new MissionAccessDeniedError("La verificación biométrica venció. Intenta nuevamente.");
    }
    return challenge.value;
  }

  async listPasskeys(actorId: string) {
    return [...this.#passkeys.values()].filter((item) => item.actorId === actorId);
  }

  async savePasskey(passkey: StoredPasskey) {
    this.#passkeys.set(passkey.credentialId, passkey);
  }

  async createAuthenticationAttempt(
    input: BeginPasskeyAuthenticationInput,
    challenge: string,
    expiresAt: string,
  ) {
    await this.#buildMission(input.assignmentId, input.actorId);
    const id = uuidv7();
    this.#authenticationAttempts.set(id, { id, ...input, challenge, expiresAt });
    return id;
  }

  async consumeAuthenticationAttempt(attemptId: string) {
    const attempt = this.#authenticationAttempts.get(attemptId);
    this.#authenticationAttempts.delete(attemptId);
    if (!attempt || attempt.expiresAt <= new Date().toISOString()) {
      throw new MissionAccessDeniedError("La validación venció. Intenta nuevamente.");
    }
    return attempt;
  }

  async findPasskey(credentialId: string) {
    return this.#passkeys.get(credentialId);
  }

  async updatePasskeyCounter(credentialId: string, counter: number) {
    const passkey = this.#passkeys.get(credentialId);
    if (!passkey) throw new MissionAccessDeniedError();
    this.#passkeys.set(credentialId, { ...passkey, counter });
  }

  async issueFieldSession(actorId: string, assignmentId: string, deviceId: string) {
    const mission = await this.#buildMission(assignmentId, actorId);
    return this.#storeSession(actorId, deviceId, mission);
  }

  async #storeSession(actorId: string, deviceId: string, mission: MissionPackageDto) {
    const token = makeToken();
    const expiresAt = addMinutes(60 * 24 * 30);
    const session: SessionRecord = {
      id: uuidv7(),
      tokenHash: this.hash(token),
      actorId,
      deviceId,
      expiresAt,
      mission,
    };
    this.#sessions.set(session.tokenHash, session);
    return {
      sessionToken: token,
      sessionExpiresAt: expiresAt,
      passkeyRegistered: (await this.listPasskeys(actorId)).length > 0,
      mission,
    };
  }

  #consumeRedemptionAttempt(rateKey: string) {
    const now = Date.now();
    const current = this.#redemptionAttempts.get(rateKey);
    const next =
      !current || current.resetAt <= now
        ? { attempts: 1, resetAt: now + 15 * 60_000 }
        : { ...current, attempts: current.attempts + 1 };
    this.#redemptionAttempts.set(rateKey, next);
    if (next.attempts > 5) {
      throw new MissionRateLimitError(Math.max(1, Math.ceil((next.resetAt - now) / 1000)));
    }
  }

  async #buildMission(assignmentId: string, actorId: string): Promise<MissionPackageDto> {
    const assignment = await this.operations.findFieldAssignment(assignmentId);
    const actor = await this.operations.findActor(actorId);
    if (!assignment || !actor) throw new MissionAccessDeniedError();
    const team = await this.operations.findTeam(assignment.teamId);
    const zone = await this.territories.findOperationalZone(assignment.zoneId);
    const memberships = await this.operations.listTeamMemberships(assignment.teamId);
    if (!team || !zone || !memberships.some((item) => item.actorId === actorId)) {
      throw new MissionAccessDeniedError();
    }
    return {
      assignmentId,
      incidentId: assignment.incidentId,
      actorId,
      actorName: actor.displayName,
      teamId: team.id,
      teamName: team.name,
      zoneId: zone.id,
      zoneReference: zone.name,
      location: zone.name,
      objective: assignment.objective,
      startsAt: assignment.startsAt,
      dueAt: assignment.dueAt,
    };
  }
}

export class PostgresMissionAccessRepository
  extends HashedAccessRepository
  implements MissionAccessRepository
{
  constructor(
    secret: string,
    private readonly sql: postgres.Sql,
  ) {
    super(secret);
  }

  async issueInvitation(
    assignmentId: string,
    input: CreateMissionInvitationInput,
    siteUrl: string,
    issuedByActorId: string,
  ): Promise<IssuedMissionInvitationDto> {
    const [eligible] = await this.sql<DbRow[]>`
      SELECT fa.id FROM field_assignments fa
      JOIN actors a ON a.id = ${input.actorId} AND a.incident_id = fa.incident_id
        AND a.status = 'active' AND a.deleted_at IS NULL
      JOIN team_memberships tm ON tm.team_id = fa.team_id AND tm.actor_id = a.id
        AND tm.status = 'active'
      WHERE fa.id = ${assignmentId} AND fa.deleted_at IS NULL
    `;
    if (!eligible) {
      throw new MissionInvitationConflictError(
        "La persona debe ser integrante activo de la brigada.",
      );
    }
    const code = makeCode();
    const id = uuidv7();
    const expiresAt = addMinutes(input.expiresInMinutes);
    await this.sql`
      INSERT INTO mission_invitations (
        id, assignment_id, actor_id, code_hash, expires_at, issued_by_actor_id
      ) VALUES (
        ${id}, ${assignmentId}, ${input.actorId}, ${this.hash(code)}, ${expiresAt}, ${issuedByActorId}
      )
    `;
    return {
      id,
      assignmentId,
      actorId: input.actorId,
      code,
      link: `${siteUrl.replace(/\/$/, "")}/field?code=${code}`,
      expiresAt,
    };
  }

  async redeemInvitation(
    input: RedeemMissionInvitationInput,
    sourceIp: string,
  ): Promise<FieldSessionDto> {
    const codeHash = this.hash(normalizeCode(input.code));
    const rateKey = this.hash(`${sourceIp}:${normalizeCode(input.code)}`);
    await this.#consumeRedemptionAttempt(rateKey);
    try {
      const result = await this.sql.begin(async (transaction) => {
        const [row] = await transaction<DbRow[]>`
        SELECT mi.id AS invitation_id, mi.actor_id, mi.expires_at, mi.redeemed_at,
          fa.id AS assignment_id, fa.incident_id, fa.team_id, fa.zone_id, fa.objective,
          fa.starts_at, fa.due_at, a.display_name AS actor_name, t.name AS team_name,
          z.name AS zone_reference, z.name AS location
        FROM mission_invitations mi
        JOIN field_assignments fa ON fa.id = mi.assignment_id AND fa.deleted_at IS NULL
        JOIN actors a ON a.id = mi.actor_id AND a.status = 'active' AND a.deleted_at IS NULL
        JOIN teams t ON t.id = fa.team_id AND t.status = 'active' AND t.deleted_at IS NULL
        JOIN operational_zones z ON z.id = fa.zone_id AND z.deleted_at IS NULL
        WHERE mi.code_hash = ${codeHash} FOR UPDATE OF mi
      `;
        if (!row || row.redeemed_at || new Date(String(row.expires_at)) <= new Date()) {
          throw new MissionAccessDeniedError("La invitación venció, ya fue utilizada o no existe.");
        }
        const mission = missionFromRow(row);
        const token = makeToken();
        const tokenHash = this.hash(token);
        const sessionId = uuidv7();
        const sessionExpiresAt = addMinutes(60 * 24 * 30);
        await transaction`
        UPDATE mission_invitations SET redeemed_at = now() WHERE id = ${String(row.invitation_id)}
      `;
        await transaction`
        INSERT INTO field_sessions (
          id, actor_id, assignment_id, device_id, token_hash, expires_at
        ) VALUES (
          ${sessionId}, ${String(row.actor_id)}, ${mission.assignmentId}, ${input.deviceId},
          ${tokenHash}, ${sessionExpiresAt}
        )
      `;
        const [passkey] = await transaction<DbRow[]>`
        SELECT id FROM actor_passkeys WHERE actor_id = ${String(row.actor_id)} LIMIT 1
      `;
        return {
          sessionToken: token,
          sessionExpiresAt,
          passkeyRegistered: Boolean(passkey),
          mission,
        };
      });
      await this.sql`DELETE FROM access_rate_limits WHERE key_hash = ${rateKey}`;
      await this.#audit(
        "mission_invitation.redeemed",
        result.mission.actorId,
        result.mission.assignmentId,
        sourceIp,
        true,
      );
      return result;
    } catch (error) {
      await this.#audit("mission_invitation.redeem_failed", null, null, sourceIp, false);
      throw error;
    }
  }

  async resolveSession(token: string): Promise<ResolvedFieldSession> {
    const [row] = await this.sql<DbRow[]>`
      SELECT fs.id AS session_id, fs.actor_id, fs.device_id, fs.expires_at,
        fa.id AS assignment_id, fa.incident_id, fa.team_id, fa.zone_id, fa.objective,
        fa.starts_at, fa.due_at, a.display_name AS actor_name, t.name AS team_name,
        z.name AS zone_reference, z.name AS location
      FROM field_sessions fs
      JOIN field_assignments fa ON fa.id = fs.assignment_id AND fa.deleted_at IS NULL
      JOIN actors a ON a.id = fs.actor_id AND a.status = 'active' AND a.deleted_at IS NULL
      JOIN teams t ON t.id = fa.team_id AND t.status = 'active' AND t.deleted_at IS NULL
      JOIN operational_zones z ON z.id = fa.zone_id AND z.deleted_at IS NULL
      WHERE fs.token_hash = ${this.hash(token)} AND fs.revoked_at IS NULL AND fs.expires_at > now()
      LIMIT 1
    `;
    if (!row) throw new MissionAccessDeniedError();
    return {
      id: String(row.session_id),
      actorId: String(row.actor_id),
      deviceId: String(row.device_id),
      expiresAt: new Date(String(row.expires_at)).toISOString(),
      mission: missionFromRow(row),
    };
  }

  async saveRegistrationChallenge(sessionId: string, challenge: string, expiresAt: string) {
    await this.sql`
      UPDATE field_sessions SET registration_challenge = ${challenge},
        challenge_expires_at = ${expiresAt} WHERE id = ${sessionId}
    `;
  }

  async consumeRegistrationChallenge(sessionId: string): Promise<string> {
    return this.sql.begin(async (transaction) => {
      const [challenge] = await transaction<DbRow[]>`
        SELECT registration_challenge FROM field_sessions
        WHERE id = ${sessionId} AND challenge_expires_at > now() FOR UPDATE
      `;
      if (!challenge?.registration_challenge) {
        throw new MissionAccessDeniedError(
          "La verificación biométrica venció. Intenta nuevamente.",
        );
      }
      await transaction`
        UPDATE field_sessions SET registration_challenge = NULL, challenge_expires_at = NULL
        WHERE id = ${sessionId}
      `;
      return String(challenge.registration_challenge);
    });
  }

  async listPasskeys(actorId: string): Promise<StoredPasskey[]> {
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM actor_passkeys WHERE actor_id = ${actorId} ORDER BY created_at
    `;
    return rows.map((row) => ({
      id: String(row.id),
      actorId: String(row.actor_id),
      credentialId: String(row.credential_id),
      publicKey: new Uint8Array(row.public_key as Buffer),
      counter: Number(row.counter),
      transports: (row.transports as string[]) ?? [],
      deviceType: String(row.device_type),
      backedUp: Boolean(row.backed_up),
    }));
  }

  async savePasskey(passkey: StoredPasskey) {
    await this.sql`
      INSERT INTO actor_passkeys (
        id, actor_id, credential_id, public_key, counter, transports, device_type, backed_up
      ) VALUES (
        ${passkey.id}, ${passkey.actorId}, ${passkey.credentialId},
        ${Buffer.from(passkey.publicKey)}, ${passkey.counter}, ${passkey.transports},
        ${passkey.deviceType}, ${passkey.backedUp}
      ) ON CONFLICT (credential_id) DO NOTHING
    `;
  }

  async createAuthenticationAttempt(
    input: BeginPasskeyAuthenticationInput,
    challenge: string,
    expiresAt: string,
  ) {
    const [eligible] = await this.sql<DbRow[]>`
      SELECT fa.id FROM field_assignments fa
      JOIN team_memberships tm ON tm.team_id = fa.team_id AND tm.actor_id = ${input.actorId}
        AND tm.status = 'active'
      JOIN actors a ON a.id = tm.actor_id AND a.status = 'active' AND a.deleted_at IS NULL
      WHERE fa.id = ${input.assignmentId} AND fa.deleted_at IS NULL
    `;
    if (!eligible) throw new MissionAccessDeniedError();
    const id = uuidv7();
    await this.sql`
      INSERT INTO passkey_authentication_attempts (
        id, actor_id, assignment_id, device_id, challenge, expires_at
      ) VALUES (
        ${id}, ${input.actorId}, ${input.assignmentId}, ${input.deviceId}, ${challenge}, ${expiresAt}
      )
    `;
    return id;
  }

  async consumeAuthenticationAttempt(attemptId: string) {
    return this.sql.begin(async (transaction) => {
      const [row] = await transaction<DbRow[]>`
        SELECT * FROM passkey_authentication_attempts
        WHERE id = ${attemptId} AND consumed_at IS NULL AND expires_at > now() FOR UPDATE
      `;
      if (!row) throw new MissionAccessDeniedError("La validación venció. Intenta nuevamente.");
      await transaction`
        UPDATE passkey_authentication_attempts SET consumed_at = now() WHERE id = ${attemptId}
      `;
      return {
        id: String(row.id),
        actorId: String(row.actor_id),
        assignmentId: String(row.assignment_id),
        deviceId: String(row.device_id),
        challenge: String(row.challenge),
        expiresAt: new Date(String(row.expires_at)).toISOString(),
      };
    });
  }

  async findPasskey(credentialId: string): Promise<StoredPasskey | undefined> {
    const [row] = await this.sql<DbRow[]>`
      SELECT * FROM actor_passkeys WHERE credential_id = ${credentialId} LIMIT 1
    `;
    if (!row) return undefined;
    return {
      id: String(row.id),
      actorId: String(row.actor_id),
      credentialId: String(row.credential_id),
      publicKey: new Uint8Array(row.public_key as Buffer),
      counter: Number(row.counter),
      transports: (row.transports as string[]) ?? [],
      deviceType: String(row.device_type),
      backedUp: Boolean(row.backed_up),
    };
  }

  async updatePasskeyCounter(credentialId: string, counter: number) {
    await this.sql`
      UPDATE actor_passkeys SET counter = ${counter}, last_used_at = now()
      WHERE credential_id = ${credentialId}
    `;
  }

  async issueFieldSession(actorId: string, assignmentId: string, deviceId: string) {
    const [row] = await this.sql<DbRow[]>`
      SELECT fa.id AS assignment_id, fa.incident_id, fa.team_id, fa.zone_id, fa.objective,
        fa.starts_at, fa.due_at, a.id AS actor_id, a.display_name AS actor_name,
        t.name AS team_name, z.name AS zone_reference, z.name AS location
      FROM field_assignments fa
      JOIN team_memberships tm ON tm.team_id = fa.team_id AND tm.actor_id = ${actorId}
        AND tm.status = 'active'
      JOIN actors a ON a.id = tm.actor_id AND a.status = 'active' AND a.deleted_at IS NULL
      JOIN teams t ON t.id = fa.team_id AND t.status = 'active' AND t.deleted_at IS NULL
      JOIN operational_zones z ON z.id = fa.zone_id AND z.deleted_at IS NULL
      WHERE fa.id = ${assignmentId} AND fa.deleted_at IS NULL LIMIT 1
    `;
    if (!row) throw new MissionAccessDeniedError();
    const mission = missionFromRow(row);
    const token = makeToken();
    const expiresAt = addMinutes(60 * 24 * 30);
    await this.sql`
      INSERT INTO field_sessions (id, actor_id, assignment_id, device_id, token_hash, expires_at)
      VALUES (${uuidv7()}, ${actorId}, ${assignmentId}, ${deviceId}, ${this.hash(token)}, ${expiresAt})
    `;
    await this.#audit("passkey.authentication_succeeded", actorId, assignmentId, null, true);
    return {
      sessionToken: token,
      sessionExpiresAt: expiresAt,
      passkeyRegistered: true,
      mission,
    };
  }

  async #consumeRedemptionAttempt(rateKey: string) {
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
    assignmentId: string | null,
    sourceIp: string | null,
    succeeded: boolean,
  ) {
    await this.sql`
      INSERT INTO mission_access_events (
        id, event_type, actor_id, assignment_id, source_ip, succeeded
      ) VALUES (${uuidv7()}, ${eventType}, ${actorId}, ${assignmentId}, ${sourceIp}, ${succeeded})
    `;
  }
}
