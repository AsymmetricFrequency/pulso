import { z } from "zod";

export const communityReportTypeSchema = z.enum(["pmu", "necesidad"]);

export const communityReportUrgencySchema = z.enum(["baja", "media", "alta", "critica"]);

export const communityReportUrgencyLabel: Record<
  z.infer<typeof communityReportUrgencySchema>,
  string
> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  critica: "Crítica",
};

export const communityReportCategorySchema = z.enum([
  "agua",
  "alimentos",
  "salud",
  "albergues",
  "higiene",
  "herramienta",
  "escombros",
  "voluntariado",
  "animales",
  "logistica",
  "catastros",
  "puntos_ayuda",
  "centros_acopio",
  "otro",
]);

export const communityReportStatusSchema = z.enum([
  "reported",
  "corroborated",
  "validated",
  "rejected",
  "superseded",
]);

export const pointGeometrySchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
});

// Aggregate/institutional context pulled from external sources — never names, phones, or
// other personal identifiers. Every field is optional since sources expose different subsets.
export const communityReportMetadataSchema = z.object({
  address: z.string().trim().max(600).nullish(),
  neighborhood: z.string().trim().max(120).nullish(),
  city: z.string().trim().max(120).nullish(),
  department: z.string().trim().max(120).nullish(),
  urgency: z.string().trim().max(40).nullish(),
  sourceStatus: z.string().trim().max(40).nullish(),
  needs: z.array(z.string().trim().max(400)).max(40).nullish(),
  personsNeeded: z.number().int().min(0).nullish(),
  personsPresent: z.number().int().min(0).nullish(),
  capacity: z.string().trim().max(80).nullish(),
  schedule: z.string().trim().max(400).nullish(),
  organization: z.string().trim().max(160).nullish(),
  // Third-party sources emit inconsistent timestamp formats (some without a UTC offset) —
  // kept as a loosely-validated string rather than z.iso.datetime() to avoid rejecting real data.
  reportedAt: z.string().trim().max(40).nullish(),
  reportUpdatedAt: z.string().trim().max(40).nullish(),
  confidence: z.string().trim().max(40).nullish(),
  corroborationCount: z.number().int().min(0).nullish(),
  needsOpen: z.number().int().min(0).nullish(),
  needsCovered: z.number().int().min(0).nullish(),
  departmentPriority: z.string().trim().max(40).nullish(),
  subSource: z.string().trim().max(160).nullish(),
  hasContact: z.boolean().nullish(),
});

export const createCommunityReportSchema = z
  .object({
    clientMutationId: z.uuid(),
    reportType: communityReportTypeSchema,
    category: communityReportCategorySchema.nullable().default(null),
    urgency: communityReportUrgencySchema.nullable().default(null),
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().max(2_000).nullable().default(null),
    location: pointGeometrySchema,
    contact: z.string().trim().max(160).nullable().default(null),
  })
  .refine((input) => input.reportType !== "necesidad" || input.category !== null, {
    message: "category is required when reportType is 'necesidad'",
    path: ["category"],
  });

export const publicCommunityReportSchema = z.object({
  id: z.uuid(),
  reportType: communityReportTypeSchema,
  category: communityReportCategorySchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  location: pointGeometrySchema,
  status: communityReportStatusSchema,
  externalSourceId: z.string().nullable(),
  metadata: communityReportMetadataSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const communityReportSchema = publicCommunityReportSchema.extend({
  incidentId: z.uuid(),
  territoryId: z.uuid().nullable(),
  contact: z.string().nullable(),
  externalKey: z.string().nullable(),
  reviewedByActorId: z.uuid().nullable(),
  reviewedAt: z.iso.datetime({ offset: true }).nullable(),
  reviewNotes: z.string().nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
});

/**
 * Proyección para dibujar el mapa.
 *
 * Deja fuera `description` y `metadata`, que son la mitad del peso de la respuesta: con 2.288
 * reportes el listado completo pasa de 2 MB, y el mapa no necesita nada de eso para pintar un
 * punto. El detalle se pide por separado cuando alguien abre un marcador, que es cuando de verdad
 * hace falta.
 */
export const mapCommunityReportSchema = publicCommunityReportSchema.pick({
  id: true,
  reportType: true,
  category: true,
  title: true,
  location: true,
  status: true,
  createdAt: true,
});

export const reviewCommunityReportSchema = z.object({
  status: communityReportStatusSchema.exclude(["reported"]),
  notes: z.string().trim().max(2_000).nullable().default(null),
});

// Server-side only (worker ingestion) — never accepted from a public HTTP request.
// Deliberately has no `contact` field: third-party contact details are never imported.
export const upsertExternalCommunityReportSchema = z.object({
  externalSourceId: z.string().trim().min(1).max(120),
  externalKey: z.string().trim().min(1).max(200),
  reportType: communityReportTypeSchema,
  category: communityReportCategorySchema.nullable().default(null),
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().max(2_000).nullable().default(null),
  location: pointGeometrySchema,
  status: communityReportStatusSchema.default("reported"),
  metadata: communityReportMetadataSchema.nullable().default(null),
});

export type CommunityReportType = z.infer<typeof communityReportTypeSchema>;
export type CommunityReportUrgency = z.infer<typeof communityReportUrgencySchema>;
export type CommunityReportCategory = z.infer<typeof communityReportCategorySchema>;
export type CommunityReportStatus = z.infer<typeof communityReportStatusSchema>;
export type CommunityReportMetadata = z.infer<typeof communityReportMetadataSchema>;
export type CreateCommunityReportInput = z.infer<typeof createCommunityReportSchema>;
export type PublicCommunityReportDto = z.infer<typeof publicCommunityReportSchema>;
export type CommunityReportDto = z.infer<typeof communityReportSchema>;
export type MapCommunityReportDto = z.infer<typeof mapCommunityReportSchema>;
export type ReviewCommunityReportInput = z.infer<typeof reviewCommunityReportSchema>;
export type UpsertExternalCommunityReportInput = z.infer<
  typeof upsertExternalCommunityReportSchema
>;
