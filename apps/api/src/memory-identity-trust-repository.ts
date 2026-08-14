import { createHmac } from "node:crypto";
import {
  IdentityTrustConflictError,
  IdentityTrustNotFoundError,
  type IdentityTrustRepository,
  type OperationsRepository,
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
import { v7 as uuidv7 } from "uuid";

type StoredClaim = IdentityClaimDto & { fingerprint: string };
type StoredCredential = ProfessionalCredentialDto & { fingerprint: string };

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
  if (type === "phone") return `***${normalized.slice(-4)}`;
  if (type === "government_id") return `***${normalized.slice(-4)}`;
  return normalized
    .split(" ")
    .map((part) => `${part.slice(0, 1).toUpperCase()}***`)
    .join(" ");
};

export class MemoryIdentityTrustRepository implements IdentityTrustRepository {
  readonly #claims = new Map<string, StoredClaim>();
  readonly #verifications = new Map<string, IdentityVerificationDto>();
  readonly #endorsements = new Map<string, ActorEndorsementDto>();
  readonly #credentials = new Map<string, StoredCredential>();

  constructor(
    private readonly secret: string,
    private readonly operations: OperationsRepository,
  ) {
    if (secret.length < 32) throw new Error("IDENTITY_FINGERPRINT_SECRET requires 32 characters");
  }

  async createClaim(actorId: string, input: CreateIdentityClaimInput) {
    const actor = await this.#requireActor(actorId);
    const normalized = normalizeValue(input.type, input.value);
    const fingerprint = this.#fingerprint(
      `${actor.incidentId}:${input.countryCode}:${input.documentType ?? ""}:${input.type}:${normalized}`,
    );
    const duplicate = [...this.#claims.values()].find(
      (claim) =>
        claim.incidentId === actor.incidentId &&
        claim.fingerprint === fingerprint &&
        claim.status !== "revoked",
    );
    if (duplicate) {
      if (duplicate.actorId === actorId) return this.#publicClaim(duplicate);
      throw new IdentityTrustConflictError(
        "Esta identidad ya está vinculada a otro actor de la emergencia.",
      );
    }
    const now = new Date().toISOString();
    const claim: StoredClaim = {
      id: uuidv7(),
      incidentId: actor.incidentId,
      actorId,
      type: input.type,
      countryCode: input.countryCode,
      documentType: input.documentType,
      displayHint: displayHint(input.type, normalized),
      status: "asserted",
      createdAt: now,
      updatedAt: now,
      fingerprint,
    };
    this.#claims.set(claim.id, claim);
    return this.#publicClaim(claim);
  }

  async listClaims(actorId: string) {
    await this.#requireActor(actorId);
    return [...this.#claims.values()]
      .filter((claim) => claim.actorId === actorId)
      .map((claim) => this.#publicClaim(claim));
  }

  async verifyClaim(
    actorId: string,
    claimId: string,
    verifierActorId: string,
    input: VerifyIdentityClaimInput,
  ) {
    const claim = this.#claims.get(claimId);
    if (!claim || claim.actorId !== actorId) {
      throw new IdentityTrustNotFoundError("Identity claim", claimId);
    }
    await this.#requireVerifier(verifierActorId, claim.incidentId);
    const verification: IdentityVerificationDto = {
      ...input,
      id: uuidv7(),
      incidentId: claim.incidentId,
      claimId,
      subjectActorId: actorId,
      verifierActorId,
      createdAt: new Date().toISOString(),
    };
    this.#verifications.set(verification.id, verification);
    claim.status =
      input.result === "passed" ? "verified" : input.result === "failed" ? "rejected" : "asserted";
    claim.updatedAt = new Date().toISOString();
    return verification;
  }

  async listVerifications(actorId: string) {
    await this.#requireActor(actorId);
    return [...this.#verifications.values()].filter(
      (verification) => verification.subjectActorId === actorId,
    );
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
    await this.#requireVerifier(issuerActorId, subject.incidentId);
    const existing = [...this.#endorsements.values()].find(
      (item) =>
        item.subjectActorId === subjectActorId &&
        item.issuerActorId === issuerActorId &&
        item.scope === input.scope &&
        item.status === "active",
    );
    if (existing) return existing;
    const endorsement: ActorEndorsementDto = {
      ...input,
      id: uuidv7(),
      incidentId: subject.incidentId,
      subjectActorId,
      issuerActorId,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    this.#endorsements.set(endorsement.id, endorsement);
    return endorsement;
  }

  async listEndorsements(actorId: string) {
    await this.#requireActor(actorId);
    return [...this.#endorsements.values()]
      .filter((item) => item.subjectActorId === actorId)
      .map((item) => this.#withExpiry(item));
  }

  async addProfessionalCredential(
    actorId: string,
    verifierActorId: string,
    input: CreateProfessionalCredentialInput,
  ) {
    const actor = await this.#requireActor(actorId);
    await this.#requireVerifier(verifierActorId, actor.incidentId);
    const normalized = input.registrationNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const fingerprint = this.#fingerprint(`${actor.incidentId}:${input.registry}:${normalized}`);
    const duplicate = [...this.#credentials.values()].find(
      (item) => item.fingerprint === fingerprint,
    );
    if (duplicate && duplicate.actorId !== actorId) {
      throw new IdentityTrustConflictError(
        "Esta matrícula profesional ya está vinculada a otro actor.",
      );
    }
    const now = new Date().toISOString();
    const credential: StoredCredential = {
      id: duplicate?.id ?? uuidv7(),
      incidentId: actor.incidentId,
      actorId,
      verifiedByActorId: verifierActorId,
      registry: input.registry,
      profession: input.profession,
      status: input.status,
      checkedAt: input.checkedAt,
      expiresAt: input.expiresAt,
      sourceUrl: input.sourceUrl,
      registrationHint: `***${normalized.slice(-4)}`,
      createdAt: duplicate?.createdAt ?? now,
      updatedAt: now,
      fingerprint,
    };
    this.#credentials.set(credential.id, credential);
    return this.#publicCredential(credential);
  }

  async listProfessionalCredentials(actorId: string) {
    await this.#requireActor(actorId);
    return [...this.#credentials.values()]
      .filter((item) => item.actorId === actorId)
      .map((item) => this.#publicCredential(item));
  }

  async getTrustProfile(actorId: string): Promise<ActorTrustProfileDto> {
    const actor = await this.#requireActor(actorId);
    const now = new Date().toISOString();
    const claims = [...this.#claims.values()].filter((item) => item.actorId === actorId);
    const identityVerified = claims.some(
      (item) => item.type === "government_id" && item.status === "verified",
    );
    const contactVerified = claims.some(
      (item) => ["email", "phone"].includes(item.type) && item.status === "verified",
    );
    const activeEndorsements = [...this.#endorsements.values()].filter(
      (item) =>
        item.subjectActorId === actorId &&
        item.status === "active" &&
        (!item.expiresAt || item.expiresAt > now),
    ).length;
    const validCredentials = [...this.#credentials.values()].filter(
      (item) =>
        item.actorId === actorId &&
        item.status === "active" &&
        (!item.expiresAt || item.expiresAt > now),
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
    const badges = [
      ...(contactVerified ? ["Contacto verificado"] : []),
      ...(activeEndorsements > 0 ? ["Respaldado por organización"] : []),
      ...validCredentials.map((item) => `${item.profession} · ${item.registry}`),
    ];
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
      badges,
      calculatedAt: now,
    };
  }

  #fingerprint(value: string) {
    return createHmac("sha256", this.secret).update(value).digest("hex");
  }

  #publicClaim({ fingerprint: _fingerprint, ...claim }: StoredClaim): IdentityClaimDto {
    return claim;
  }

  #publicCredential({ fingerprint: _fingerprint, ...credential }: StoredCredential) {
    return credential;
  }

  #withExpiry(endorsement: ActorEndorsementDto): ActorEndorsementDto {
    if (
      endorsement.status === "active" &&
      endorsement.expiresAt &&
      endorsement.expiresAt <= new Date().toISOString()
    ) {
      return { ...endorsement, status: "expired" };
    }
    return endorsement;
  }

  async #requireActor(actorId: string) {
    const actor = await this.operations.findActor(actorId);
    if (!actor) throw new IdentityTrustNotFoundError("Actor", actorId);
    return actor;
  }

  async #requireVerifier(actorId: string, incidentId: string) {
    const actor = await this.#requireActor(actorId);
    if (
      actor.incidentId !== incidentId ||
      actor.status !== "active" ||
      !["coordinator", "auditor", "incident_admin"].includes(actor.role)
    ) {
      throw new IdentityTrustConflictError("El actor no puede verificar identidad.");
    }
    return actor;
  }
}
