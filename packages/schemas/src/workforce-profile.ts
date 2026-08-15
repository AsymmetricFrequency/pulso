import { z } from "zod";

export const workforceRoleSchema = z.enum([
  "site_lead",
  "construction_master",
  "mason",
  "electrician",
  "plumber",
  "carpenter",
  "general_labor",
  "other",
]);

export const workforceAvailabilitySchema = z.enum(["available", "assigned", "unavailable"]);
export const workforceVerificationLevelSchema = z.enum(["reported", "corroborated", "verified"]);

// Voluntary self-disclosure for a stated purpose ("so Operations can reach me about an
// assignment") — unlike third-party data imported without the subject's knowledge, so a name and
// optional contact are collected here. Both are encrypted at rest (see field-encryption.ts).
// The public listing only ever sees a masked name ("María G***"); contact is never public.
export const createWorkforceProfileSchema = z.object({
  clientMutationId: z.uuid(),
  territoryCode: z.string().trim().min(1).max(20),
  displayName: z.string().trim().min(2).max(160),
  contact: z.string().trim().max(160).nullable().default(null),
  role: workforceRoleSchema,
  headcount: z.number().int().min(1).max(500).default(1),
  notes: z.string().trim().max(500).nullable().default(null),
});

export const publicWorkforceProfileSchema = z.object({
  id: z.uuid(),
  territoryCode: z.string().nullable(),
  maskedDisplayName: z.string(),
  role: workforceRoleSchema,
  headcount: z.number().int(),
  availability: workforceAvailabilitySchema,
  verificationLevel: workforceVerificationLevelSchema,
  notes: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

// Operations-authenticated only — never served from a public route. Carries the decrypted
// name/contact so a coordinator can actually reach a registered worker about an assignment.
export const operationsWorkforceProfileSchema = publicWorkforceProfileSchema.extend({
  displayName: z.string(),
  contact: z.string().nullable(),
});

export type WorkforceRole = z.infer<typeof workforceRoleSchema>;
export type WorkforceAvailability = z.infer<typeof workforceAvailabilitySchema>;
export type WorkforceVerificationLevel = z.infer<typeof workforceVerificationLevelSchema>;
export type CreateWorkforceProfileInput = z.infer<typeof createWorkforceProfileSchema>;
export type PublicWorkforceProfileDto = z.infer<typeof publicWorkforceProfileSchema>;
export type OperationsWorkforceProfileDto = z.infer<typeof operationsWorkforceProfileSchema>;
