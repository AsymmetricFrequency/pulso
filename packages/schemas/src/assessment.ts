import { z } from "zod";

export const damageTypeSchema = z.enum([
  "housing",
  "infrastructure",
  "access",
  "utilities",
  "health",
  "livelihoods",
  "animals",
  "other",
]);

export const needTypeSchema = z.enum([
  "shelter",
  "water",
  "food",
  "healthcare",
  "sanitation",
  "protection",
  "construction_materials",
  "animal_care",
  "communications",
  "transport",
  "other",
]);

export const createRapidAssessmentSchema = z
  .object({
    clientMutationId: z.uuid(),
    deviceId: z.string().trim().min(3).max(120),
    observedAt: z.iso.datetime({ offset: true }),
    damageTypes: damageTypeSchema.array().max(8).default([]),
    severity: z.enum(["low", "medium", "high", "critical"]),
    needTypes: needTypeSchema.array().max(11).default([]),
    urgency: z.enum(["routine", "priority", "urgent", "immediate"]),
    affectedHouseholds: z.int().min(0).max(100_000).default(0),
    affectedPeople: z.int().min(0).max(1_000_000).default(0),
    notes: z.string().trim().max(1_000).nullable().default(null),
  })
  .refine((value) => value.damageTypes.length > 0 || value.needTypes.length > 0, {
    message: "Registra al menos un daño o una necesidad.",
  });

export const rapidAssessmentSchema = createRapidAssessmentSchema.extend({
  id: z.uuid(),
  incidentId: z.uuid(),
  assignmentId: z.uuid(),
  zoneId: z.uuid(),
  teamId: z.uuid(),
  actorId: z.uuid(),
  status: z.enum(["recorded", "reviewed", "duplicate"]),
  createdAt: z.iso.datetime({ offset: true }),
  revision: z.int().positive(),
});

export type CreateRapidAssessmentInput = z.infer<typeof createRapidAssessmentSchema>;
export type RapidAssessmentDto = z.infer<typeof rapidAssessmentSchema>;
