import { z } from "zod";

export const createFieldEvidenceSchema = z.object({
  clientMutationId: z.uuid(),
  assessmentClientMutationId: z.uuid(),
  fileName: z.string().trim().min(1).max(180),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z
    .int()
    .min(4)
    .max(5 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.iso.datetime({ offset: true }),
  dataBase64: z.string().min(4).max(7_000_000),
});

export const fieldEvidenceSchema = createFieldEvidenceSchema.omit({ dataBase64: true }).extend({
  id: z.uuid(),
  incidentId: z.uuid(),
  assignmentId: z.uuid(),
  assessmentId: z.uuid(),
  zoneId: z.uuid(),
  actorId: z.uuid(),
  status: z.enum(["stored", "quarantined", "deleted"]),
  createdAt: z.iso.datetime({ offset: true }),
});

export type CreateFieldEvidenceInput = z.infer<typeof createFieldEvidenceSchema>;
export type FieldEvidenceDto = z.infer<typeof fieldEvidenceSchema>;
