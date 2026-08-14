import { z } from "zod";

export const createMissionInvitationSchema = z.object({
  actorId: z.uuid(),
  expiresInMinutes: z.int().min(5).max(10_080).default(1_440),
});

export const issuedMissionInvitationSchema = z.object({
  id: z.uuid(),
  assignmentId: z.uuid(),
  actorId: z.uuid(),
  code: z.string().length(10),
  link: z.url(),
  expiresAt: z.iso.datetime({ offset: true }),
});

export const redeemMissionInvitationSchema = z.object({
  code: z.string().trim().min(6).max(16),
  deviceId: z.string().trim().min(8).max(120),
});

export const missionPackageSchema = z.object({
  assignmentId: z.uuid(),
  incidentId: z.uuid(),
  actorId: z.uuid(),
  actorName: z.string(),
  teamId: z.uuid(),
  teamName: z.string(),
  zoneId: z.uuid(),
  zoneReference: z.string(),
  location: z.string(),
  objective: z.string(),
  startsAt: z.iso.datetime({ offset: true }),
  dueAt: z.iso.datetime({ offset: true }).nullable(),
});

export const fieldSessionSchema = z.object({
  sessionToken: z.string().min(32),
  sessionExpiresAt: z.iso.datetime({ offset: true }),
  passkeyRegistered: z.boolean(),
  mission: missionPackageSchema,
});

export const passkeyRegistrationResponseSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  response: z.object({
    clientDataJSON: z.string().min(1),
    attestationObject: z.string().min(1),
    transports: z.string().array().optional(),
    publicKeyAlgorithm: z.number().optional(),
    publicKey: z.string().optional(),
    authenticatorData: z.string().optional(),
  }),
  type: z.literal("public-key"),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).nullable().optional(),
});

export const passkeyVerificationResultSchema = z.object({
  verified: z.boolean(),
});

export const beginPasskeyAuthenticationSchema = z.object({
  actorId: z.uuid(),
  assignmentId: z.uuid(),
  deviceId: z.string().trim().min(8).max(120),
});

export const passkeyAuthenticationResponseSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  response: z.object({
    clientDataJSON: z.string().min(1),
    authenticatorData: z.string().min(1),
    signature: z.string().min(1),
    userHandle: z.string().nullable().optional(),
  }),
  type: z.literal("public-key"),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).nullable().optional(),
});

export const verifyPasskeyAuthenticationSchema = z.object({
  attemptId: z.uuid(),
  response: passkeyAuthenticationResponseSchema,
});

export type CreateMissionInvitationInput = z.infer<typeof createMissionInvitationSchema>;
export type IssuedMissionInvitationDto = z.infer<typeof issuedMissionInvitationSchema>;
export type RedeemMissionInvitationInput = z.infer<typeof redeemMissionInvitationSchema>;
export type MissionPackageDto = z.infer<typeof missionPackageSchema>;
export type FieldSessionDto = z.infer<typeof fieldSessionSchema>;
export type BeginPasskeyAuthenticationInput = z.infer<typeof beginPasskeyAuthenticationSchema>;
export type VerifyPasskeyAuthenticationInput = z.infer<typeof verifyPasskeyAuthenticationSchema>;
