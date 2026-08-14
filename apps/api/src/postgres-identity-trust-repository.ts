import { createHmac } from "node:crypto";
import {
  IdentityTrustConflictError,
  IdentityTrustNotFoundError,
  type IdentityTrustRepository,
} from "@pulso/domain";
import type {
  ActorEndorsementDto,
  ActorTrustProfileDto,
  CreateActorEndorsementInput,
  CreateIdentityClaimInput,
  CreateProfessionalCredentialInput,
  IdentityClaimDto,
  IdentityVerificationDto,
  ProfessionalCredentialDto,
  VerifyIdentityClaimInput,
} from "@pulso/schemas";
import type postgres from "postgres";
import { v7 as uuidv7 } from "uuid";

type DbRow = Record<string, unknown>;
type QuerySql = postgres.Sql | postgres.TransactionSql;

const asIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

const normalizeValue = (type: CreateIdentityClaimInput["type"], value: string) => {
  if (type === "email") return value.trim().toLowerCase();
  if (type === "phone") return value.replace(/\D/g, "");
  if (type === "government_id") return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return value.trim().toLowerCase().replace(/\s+/g, " ");
};

const displayHint = (type: CreateIdentityClaimInput["type"], normalized: string) => {
  if (type === "email") {
    const [name = "", domain = ""] = normalized.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  if (type === "phone" || type === "government_id") return `***${normalized.slice(-4)}`;
  return normalized
    .split(" ")
    .map((part) => `${part.slice(0, 1).toUpperCase()}***`)
    .join(" ");
};

const claimFromRow = (row: DbRow): IdentityClaimDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  actorId: String(row.actor_id),
  type: row.claim_type as IdentityClaimDto["type"],
  countryCode: String(row.country_code),
  documentType: row.document_type ? String(row.document_type) : null,
  displayHint: String(row.display_hint),
  status: row.status as IdentityClaimDto["status"],
  createdAt: asIso(row.created_at),
  updatedAt: asIso(row.updated_at),
});

const verificationFromRow = (row: DbRow): IdentityVerificationDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  claimId: String(row.claim_id),
  subjectActorId: String(row.subject_actor_id),
  verifierActorId: String(row.verifier_actor_id),
  method: row.method as IdentityVerificationDto["method"],
  provider: String(row.provider),
  result: row.result as IdentityVerificationDto["result"],
  evidenceRef: row.evidence_ref ? String(row.evidence_ref) : null,
  checkedAt: asIso(row.checked_at),
  expiresAt: row.expires_at ? asIso(row.expires_at) : null,
  notes: row.notes ? String(row.notes) : null,
  createdAt: asIso(row.created_at),
});

const endorsementFromRow = (row: DbRow): ActorEndorsementDto => {
  const expiresAt = row.expires_at ? asIso(row.expires_at) : null;
  const storedStatus = row.status as ActorEndorsementDto["status"];
  return {
    id: String(row.id),
    incidentId: String(row.incident_id),
    subjectActorId: String(row.subject_actor_id),
    issuerActorId: String(row.issuer_actor_id),
    scope: row.scope as ActorEndorsementDto["scope"],
    expiresAt,
    notes: row.notes ? String(row.notes) : null,
    status:
      storedStatus === "active" && expiresAt && expiresAt <= new Date().toISOString()
        ? "expired"
        : storedStatus,
    createdAt: asIso(row.created_at),
  };
};

const credentialFromRow = (row: DbRow): ProfessionalCredentialDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  actorId: String(row.actor_id),
  verifiedByActorId: String(row.verified_by_actor_id),
  registry: row.registry as ProfessionalCredentialDto["registry"],
  profession: String(row.profession),
  registrationHint: String(row.registration_hint),
  status: row.status as ProfessionalCredentialDto["status"],
  checkedAt: asIso(row.checked_at),
  expiresAt: row.expires_at ? asIso(row.expires_at) : null,
  sourceUrl: row.source_url ? String(row.source_url) : null,
  createdAt: asIso(row.created_at),
  updatedAt: asIso(row.updated_at),
});

export class PostgresIdentityTrustRepository implements IdentityTrustRepository {
  constructor(
    private readonly secret: string,
    private readonly sql: postgres.Sql,
  ) {
    if (secret.length < 32) throw new Error("IDENTITY_FINGERPRINT_SECRET requires 32 characters");
  }

  async createClaim(actorId: string, input: CreateIdentityClaimInput) {
    const actor = await this.#requireActor(actorId);
    const normalized = normalizeValue(input.type, input.value);
    const fingerprint = this.#fingerprint(
      `${actor.incidentId}:${input.countryCode}:${input.documentType ?? ""}:${input.type}:${normalized}`,
    );
    const [existing] = await this.sql<DbRow[]>`
      SELECT * FROM identity_claims
      WHERE incident_id = ${actor.incidentId} AND value_fingerprint = ${fingerprint}
        AND status <> 'revoked' LIMIT 1
    `;
    if (existing) {
      if (String(existing.actor_id) === actorId) return claimFromRow(existing);
      throw new IdentityTrustConflictError(
        "Esta identidad ya está vinculada a otro actor de la emergencia.",
      );
    }
    const [row] = await this.sql<DbRow[]>`
      INSERT INTO identity_claims (
        id, incident_id, actor_id, claim_type, country_code, document_type,
        value_fingerprint, display_hint
      ) VALUES (
        ${uuidv7()}, ${actor.incidentId}, ${actorId}, ${input.type}, ${input.countryCode},
        ${input.documentType}, ${fingerprint}, ${displayHint(input.type, normalized)}
      ) RETURNING *
    `;
    if (!row) throw new Error("PostgreSQL did not return identity claim");
    await this.#audit(
      actor.incidentId,
      actorId,
      actorId,
      "identity_claim.asserted",
      "identity_claim",
      String(row.id),
      { claimType: input.type },
    );
    return claimFromRow(row);
  }

  async listClaims(actorId: string) {
    await this.#requireActor(actorId);
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM identity_claims WHERE actor_id = ${actorId} ORDER BY created_at
    `;
    return rows.map(claimFromRow);
  }

  async verifyClaim(
    actorId: string,
    claimId: string,
    verifierActorId: string,
    input: VerifyIdentityClaimInput,
  ) {
    return this.sql.begin(async (transaction) => {
      const [claim] = await transaction<DbRow[]>`
        SELECT * FROM identity_claims
        WHERE id = ${claimId} AND actor_id = ${actorId} FOR UPDATE
      `;
      if (!claim) throw new IdentityTrustNotFoundError("Identity claim", claimId);
      await this.#requireVerifier(verifierActorId, String(claim.incident_id), transaction);
      const [row] = await transaction<DbRow[]>`
        INSERT INTO identity_verifications (
          id, incident_id, claim_id, subject_actor_id, verifier_actor_id, method,
          provider, result, evidence_ref, checked_at, expires_at, notes
        ) VALUES (
          ${uuidv7()}, ${String(claim.incident_id)}, ${claimId}, ${actorId},
          ${verifierActorId}, ${input.method}, ${input.provider}, ${input.result},
          ${input.evidenceRef}, ${input.checkedAt}, ${input.expiresAt}, ${input.notes}
        ) RETURNING *
      `;
      const status =
        input.result === "passed"
          ? "verified"
          : input.result === "failed"
            ? "rejected"
            : "asserted";
      await transaction`
        UPDATE identity_claims SET status = ${status}, updated_at = now() WHERE id = ${claimId}
      `;
      if (!row) throw new Error("PostgreSQL did not return identity verification");
      await this.#audit(
        String(claim.incident_id),
        actorId,
        verifierActorId,
        "identity_claim.verified",
        "identity_verification",
        String(row.id),
        { method: input.method, result: input.result },
        transaction,
      );
      return verificationFromRow(row);
    });
  }

  async listVerifications(actorId: string) {
    await this.#requireActor(actorId);
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM identity_verifications
      WHERE subject_actor_id = ${actorId} ORDER BY checked_at DESC
    `;
    return rows.map(verificationFromRow);
  }

  async createEndorsement(
    subjectActorId: string,
    issuerActorId: string,
    input: CreateActorEndorsementInput,
  ) {
    if (subjectActorId === issuerActorId) {
      throw new IdentityTrustConflictError("Un actor no puede respaldarse a sí mismo.");
    }
    const subject = await this.#requireActor(subjectActorId);
    await this.#requireVerifier(issuerActorId, subject.incidentId, this.sql);
    const [existing] = await this.sql<DbRow[]>`
      SELECT * FROM actor_endorsements
      WHERE subject_actor_id = ${subjectActorId} AND issuer_actor_id = ${issuerActorId}
        AND scope = ${input.scope} AND status = 'active' LIMIT 1
    `;
    if (existing) return endorsementFromRow(existing);
    const [row] = await this.sql<DbRow[]>`
      INSERT INTO actor_endorsements (
        id, incident_id, subject_actor_id, issuer_actor_id, scope, expires_at, notes
      ) VALUES (
        ${uuidv7()}, ${subject.incidentId}, ${subjectActorId}, ${issuerActorId},
        ${input.scope}, ${input.expiresAt}, ${input.notes}
      ) RETURNING *
    `;
    if (!row) throw new Error("PostgreSQL did not return actor endorsement");
    await this.#audit(
      subject.incidentId,
      subjectActorId,
      issuerActorId,
      "actor.endorsed",
      "actor_endorsement",
      String(row.id),
      { scope: input.scope },
    );
    return endorsementFromRow(row);
  }

  async listEndorsements(actorId: string) {
    await this.#requireActor(actorId);
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM actor_endorsements
      WHERE subject_actor_id = ${actorId} ORDER BY created_at DESC
    `;
    return rows.map(endorsementFromRow);
  }

  async addProfessionalCredential(
    actorId: string,
    verifierActorId: string,
    input: CreateProfessionalCredentialInput,
  ) {
    const actor = await this.#requireActor(actorId);
    await this.#requireVerifier(verifierActorId, actor.incidentId, this.sql);
    const normalized = input.registrationNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const fingerprint = this.#fingerprint(`${actor.incidentId}:${input.registry}:${normalized}`);
    const [existing] = await this.sql<DbRow[]>`
      SELECT * FROM professional_credentials
      WHERE incident_id = ${actor.incidentId} AND registry = ${input.registry}
        AND registration_fingerprint = ${fingerprint} LIMIT 1
    `;
    if (existing && String(existing.actor_id) !== actorId) {
      throw new IdentityTrustConflictError(
        "Esta matrícula profesional ya está vinculada a otro actor.",
      );
    }
    const [row] = existing
      ? await this.sql<DbRow[]>`
          UPDATE professional_credentials SET
            verified_by_actor_id = ${verifierActorId}, profession = ${input.profession},
            status = ${input.status}, checked_at = ${input.checkedAt},
            expires_at = ${input.expiresAt}, source_url = ${input.sourceUrl}, updated_at = now()
          WHERE id = ${String(existing.id)} RETURNING *
        `
      : await this.sql<DbRow[]>`
          INSERT INTO professional_credentials (
            id, incident_id, actor_id, verified_by_actor_id, registry, profession,
            registration_fingerprint, registration_hint, status, checked_at, expires_at, source_url
          ) VALUES (
            ${uuidv7()}, ${actor.incidentId}, ${actorId}, ${verifierActorId}, ${input.registry},
            ${input.profession}, ${fingerprint}, ${`***${normalized.slice(-4)}`}, ${input.status},
            ${input.checkedAt}, ${input.expiresAt}, ${input.sourceUrl}
          ) RETURNING *
        `;
    if (!row) throw new Error("PostgreSQL did not return professional credential");
    await this.#audit(
      actor.incidentId,
      actorId,
      verifierActorId,
      "professional_credential.checked",
      "professional_credential",
      String(row.id),
      { registry: input.registry, status: input.status },
    );
    return credentialFromRow(row);
  }

  async listProfessionalCredentials(actorId: string) {
    await this.#requireActor(actorId);
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM professional_credentials WHERE actor_id = ${actorId} ORDER BY checked_at DESC
    `;
    return rows.map(credentialFromRow);
  }

  async getTrustProfile(actorId: string): Promise<ActorTrustProfileDto> {
    const actor = await this.#requireActor(actorId);
    const [claims, endorsements, credentials] = await Promise.all([
      this.listClaims(actorId),
      this.listEndorsements(actorId),
      this.listProfessionalCredentials(actorId),
    ]);
    const now = new Date().toISOString();
    const identityVerified = claims.some(
      (item) => item.type === "government_id" && item.status === "verified",
    );
    const contactVerified = claims.some(
      (item) => ["email", "phone"].includes(item.type) && item.status === "verified",
    );
    const activeEndorsements = endorsements.filter(
      (item) => item.status === "active" && (!item.expiresAt || item.expiresAt > now),
    ).length;
    const validCredentials = credentials.filter(
      (item) => item.status === "active" && (!item.expiresAt || item.expiresAt > now),
    );
    let assuranceLevel: ActorTrustProfileDto["assuranceLevel"] = "A0";
    if (contactVerified) assuranceLevel = "A1";
    if (activeEndorsements > 0) assuranceLevel = "A2";
    if (identityVerified && validCredentials.length > 0) assuranceLevel = "A3";
    if (
      identityVerified &&
      activeEndorsements >= 2 &&
      ["auditor", "incident_admin"].includes(actor.role)
    ) {
      assuranceLevel = "A4";
    }
    return {
      actorId,
      incidentId: actor.incidentId,
      displayName: actor.displayName,
      role: actor.role,
      assuranceLevel,
      identityVerified,
      contactVerified,
      activeEndorsements,
      validProfessionalCredentials: validCredentials.length,
      badges: [
        ...(contactVerified ? ["Contacto verificado"] : []),
        ...(activeEndorsements > 0 ? ["Respaldado por organización"] : []),
        ...validCredentials.map((item) => `${item.profession} · ${item.registry}`),
      ],
      calculatedAt: now,
    };
  }

  #fingerprint(value: string) {
    return createHmac("sha256", this.secret).update(value).digest("hex");
  }

  async #audit(
    incidentId: string,
    subjectActorId: string,
    performedByActorId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    metadata: postgres.JSONValue,
    sql: QuerySql = this.sql,
  ) {
    await sql`
      INSERT INTO identity_trust_events (
        id, incident_id, subject_actor_id, performed_by_actor_id,
        event_type, aggregate_type, aggregate_id, metadata
      ) VALUES (
        ${uuidv7()}, ${incidentId}, ${subjectActorId}, ${performedByActorId},
        ${eventType}, ${aggregateType}, ${aggregateId}, ${sql.json(metadata)}
      )
    `;
  }

  async #requireActor(actorId: string) {
    const [row] = await this.sql<DbRow[]>`
      SELECT * FROM actors WHERE id = ${actorId} AND deleted_at IS NULL LIMIT 1
    `;
    if (!row) throw new IdentityTrustNotFoundError("Actor", actorId);
    return {
      id: String(row.id),
      incidentId: String(row.incident_id),
      displayName: String(row.display_name),
      role: String(row.actor_role),
      status: String(row.status),
    };
  }

  async #requireVerifier(actorId: string, incidentId: string, sql: QuerySql) {
    const [row] = await sql<DbRow[]>`
      SELECT id FROM actors WHERE id = ${actorId} AND incident_id = ${incidentId}
        AND actor_role IN ('coordinator', 'auditor', 'incident_admin')
        AND status = 'active' AND deleted_at IS NULL LIMIT 1
    `;
    if (!row) throw new IdentityTrustConflictError("El actor no puede verificar identidad.");
  }
}
