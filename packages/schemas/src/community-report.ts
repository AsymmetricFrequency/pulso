import { z } from "zod";
import { redactContacts } from "./redact-contacts.js";

// `rescate` va primero a propósito: es el orden en que se declaran las prioridades del proyecto y
// el orden en que aparecen en la interfaz. Significa «hay personas atrapadas aquí», que no es lo
// mismo que la categoría `escombros` de una necesidad —esa pide una retroexcavadora, esta pide un
// equipo de búsqueda y rescate—.
export const communityReportTypeSchema = z.enum(["rescate", "pmu", "necesidad"]);

/**
 * Señales de vida en un punto de rescate.
 *
 * `unknown` no es un descarte: es la respuesta honesta de alguien que acaba de llegar al sitio, y
 * es la más común. Obligar a decir sí o no produciría datos inventados justo en el campo que más
 * pesa al ordenar la cola.
 */
export const rescueSignsOfLifeSchema = z.enum(["yes", "no", "unknown"]);

export const communityReportCategorySchema = z.enum([
  "agua",
  "alimentos",
  "salud",
  "refugio",
  "higiene",
  "herramienta",
  "escombros",
  "voluntariado",
  "animales",
  "logistica",
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
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().max(2_000).nullable().default(null),
    location: pointGeometrySchema,
    contact: z.string().trim().max(160).nullable().default(null),
    // Los tres datos de un rescate. Todos opcionales: un reporte incompleto llega igual y sirve,
    // porque la ubicación ya es la mitad del valor. Exigirlos convertiría treinta segundos en un
    // formulario que nadie termina desde un teléfono, de pie, al lado de un derrumbe.
    peopleReported: z.number().int().min(1).max(500).nullable().default(null),
    signsOfLife: rescueSignsOfLifeSchema.nullable().default(null),
    respondersOnSite: z.boolean().nullable().default(null),
  })
  .refine((input) => input.reportType !== "necesidad" || input.category !== null, {
    message: "category is required when reportType is 'necesidad'",
    path: ["category"],
  })
  .refine(
    (input) =>
      input.reportType === "rescate" ||
      (input.peopleReported === null &&
        input.signsOfLife === null &&
        input.respondersOnSite === null),
    {
      message: "rescue fields are only valid when reportType is 'rescate'",
      path: ["reportType"],
    },
  );

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
  // Públicos y sin reservas: cuánta gente se cree que hay debajo y si se oye algo es exactamente lo
  // que un equipo de rescate necesita para decidir a cuál de dos puntos va primero, y no identifica
  // a nadie.
  peopleReported: z.number().int().nullable(),
  signsOfLife: rescueSignsOfLifeSchema.nullable(),
  respondersOnSite: z.boolean().nullable(),
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
  // Sí viajan en la proyección ligera, a diferencia de `description` y `metadata`: el mapa los usa
  // para pintar el marcador de rescate distinto según haya o no señales de vida, y son tres campos
  // escalares contra los cientos de KB de jsonb que se dejan fuera.
  peopleReported: true,
  signsOfLife: true,
  respondersOnSite: true,
});

export const reviewCommunityReportSchema = z.object({
  status: communityReportStatusSchema.exclude(["reported"]),
  notes: z.string().trim().max(2_000).nullable().default(null),
});

/**
 * Solo del lado del servidor (ingesta del worker) — nunca se acepta desde una petición HTTP pública.
 *
 * No tiene campo `contact` a propósito: los datos de contacto de terceros no se importan. Y la
 * descripción pasa por `redactContacts` **aquí, en el esquema**, no en cada importador: es el único
 * punto por el que pasan todas las fuentes, así que un importador nuevo lo hereda sin que su autor
 * tenga que acordarse. Se descubrió tarde —43 descripciones ya ingeridas traían un móvil visible y
 * se sirvieron por la API pública— y por eso está donde no se puede saltar.
 */
export const upsertExternalCommunityReportSchema = z.object({
  externalSourceId: z.string().trim().min(1).max(120),
  externalKey: z.string().trim().min(1).max(200),
  reportType: communityReportTypeSchema,
  category: communityReportCategorySchema.nullable().default(null),
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().max(2_000).nullable().default(null).transform(redactContacts),
  location: pointGeometrySchema,
  status: communityReportStatusSchema.default("reported"),
  metadata: communityReportMetadataSchema.nullable().default(null),
});

export type CommunityReportType = z.infer<typeof communityReportTypeSchema>;
export type RescueSignsOfLife = z.infer<typeof rescueSignsOfLifeSchema>;
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
