import { z } from "zod";

export const identityAssuranceLevelSchema = z.enum(["A0", "A1", "A2", "A3", "A4"]);

export const identityClaimTypeSchema = z.enum(["legal_name", "government_id", "phone", "email"]);

export const createIdentityClaimSchema = z.object({
  type: identityClaimTypeSchema,
  value: z.string().trim().min(2).max(240),
  countryCode: z.string().trim().length(2).toUpperCase().default("CO"),
  documentType: z.string().trim().min(2).max(40).nullable().default(null),
});

export const identityClaimSchema = z.object({
  id: z.uuid(),
  incidentId: z.uuid(),
  actorId: z.uuid(),
  type: identityClaimTypeSchema,
  countryCode: z.string().length(2),
  documentType: z.string().nullable(),
  displayHint: z.string(),
  status: z.enum(["asserted", "verified", "rejected", "revoked"]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const verifyIdentityClaimSchema = z.object({
  method: z.enum([
    "self_asserted",
    "organization_endorsement",
    "document_review",
    "official_registry",
    "government_biometric",
  ]),
  provider: z.string().trim().min(2).max(120),
  result: z.enum(["passed", "failed", "inconclusive"]),
  evidenceRef: z.string().trim().max(500).nullable().default(null),
  checkedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
  notes: z.string().trim().max(500).nullable().default(null),
});

export const identityVerificationSchema = verifyIdentityClaimSchema.extend({
  id: z.uuid(),
  incidentId: z.uuid(),
  claimId: z.uuid(),
  subjectActorId: z.uuid(),
  verifierActorId: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const createActorEndorsementSchema = z.object({
  scope: z.enum(["community_member", "field_worker", "team_member", "coordinator", "professional"]),
  expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
  notes: z.string().trim().max(500).nullable().default(null),
});

export const actorEndorsementSchema = createActorEndorsementSchema.extend({
  id: z.uuid(),
  incidentId: z.uuid(),
  subjectActorId: z.uuid(),
  issuerActorId: z.uuid(),
  status: z.enum(["active", "revoked", "expired"]),
  createdAt: z.iso.datetime({ offset: true }),
});

export const createProfessionalCredentialSchema = z.object({
  registry: z.enum(["CPNAA", "COPNIA", "RETHUS", "OTHER"]),
  profession: z.string().trim().min(2).max(120),
  registrationNumber: z.string().trim().min(3).max(120),
  status: z.enum(["active", "suspended", "revoked", "not_found"]),
  checkedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
  sourceUrl: z.url().nullable().default(null),
});

export const professionalCredentialSchema = createProfessionalCredentialSchema
  .omit({ registrationNumber: true })
  .extend({
    id: z.uuid(),
    incidentId: z.uuid(),
    actorId: z.uuid(),
    verifiedByActorId: z.uuid(),
    registrationHint: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  });

export const actorTrustProfileSchema = z.object({
  actorId: z.uuid(),
  incidentId: z.uuid(),
  displayName: z.string(),
  role: z.string(),
  assuranceLevel: identityAssuranceLevelSchema,
  identityVerified: z.boolean(),
  contactVerified: z.boolean(),
  activeEndorsements: z.int().nonnegative(),
  validProfessionalCredentials: z.int().nonnegative(),
  badges: z.string().array(),
  calculatedAt: z.iso.datetime({ offset: true }),
});

export type CreateIdentityClaimInput = z.infer<typeof createIdentityClaimSchema>;
export type IdentityClaimDto = z.infer<typeof identityClaimSchema>;
export type VerifyIdentityClaimInput = z.infer<typeof verifyIdentityClaimSchema>;
export type IdentityVerificationDto = z.infer<typeof identityVerificationSchema>;
export type CreateActorEndorsementInput = z.infer<typeof createActorEndorsementSchema>;
export type ActorEndorsementDto = z.infer<typeof actorEndorsementSchema>;
export type CreateProfessionalCredentialInput = z.infer<typeof createProfessionalCredentialSchema>;
export type ProfessionalCredentialDto = z.infer<typeof professionalCredentialSchema>;
export type ActorTrustProfileDto = z.infer<typeof actorTrustProfileSchema>;
