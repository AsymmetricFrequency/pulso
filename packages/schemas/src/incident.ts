import { z } from "zod";

export const disasterTypeSchema = z.enum([
  "earthquake",
  "flood",
  "fire",
  "hurricane",
  "landslide",
  "other",
]);

export const incidentStatusSchema = z.enum(["draft", "active", "stabilized", "closed"]);

export const createIncidentSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(3).max(160),
  disasterType: disasterTypeSchema,
  countryCode: z.string().trim().length(2).toUpperCase(),
  timezone: z.string().trim().min(3).max(80),
  startedAt: z.iso.datetime({ offset: true }),
});

export const incidentSchema = createIncidentSchema.extend({
  id: z.uuid(),
  status: incidentStatusSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  revision: z.int().positive(),
});

export const incidentListSchema = z.array(incidentSchema);

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type IncidentDto = z.infer<typeof incidentSchema>;
