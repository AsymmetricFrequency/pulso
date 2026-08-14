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

export interface IdentityTrustRepository {
  createClaim(actorId: string, input: CreateIdentityClaimInput): Promise<IdentityClaimDto>;
  listClaims(actorId: string): Promise<IdentityClaimDto[]>;
  verifyClaim(
    actorId: string,
    claimId: string,
    verifierActorId: string,
    input: VerifyIdentityClaimInput,
  ): Promise<IdentityVerificationDto>;
  listVerifications(actorId: string): Promise<IdentityVerificationDto[]>;
  createEndorsement(
    subjectActorId: string,
    issuerActorId: string,
    input: CreateActorEndorsementInput,
  ): Promise<ActorEndorsementDto>;
  listEndorsements(actorId: string): Promise<ActorEndorsementDto[]>;
  addProfessionalCredential(
    actorId: string,
    verifierActorId: string,
    input: CreateProfessionalCredentialInput,
  ): Promise<ProfessionalCredentialDto>;
  listProfessionalCredentials(actorId: string): Promise<ProfessionalCredentialDto[]>;
  getTrustProfile(actorId: string): Promise<ActorTrustProfileDto>;
}

export class IdentityTrustNotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = "IdentityTrustNotFoundError";
  }
}

export class IdentityTrustConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityTrustConflictError";
  }
}
