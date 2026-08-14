import { z } from "zod";

const positionSchema = z.tuple([z.number(), z.number()]).rest(z.number());

export const lineStringGeometrySchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(positionSchema).min(2),
});

export const polygonGeometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(positionSchema).min(4)).min(1),
});

export const multiPolygonGeometrySchema = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(z.array(positionSchema).min(4)).min(1)).min(1),
});

export const areaGeometrySchema = z.discriminatedUnion("type", [
  polygonGeometrySchema,
  multiPolygonGeometrySchema,
]);

export const territoryTypeSchema = z.enum([
  "country",
  "department",
  "municipality",
  "district",
  "neighborhood",
  "rural_area",
]);

export const accessStatusSchema = z.enum(["unknown", "accessible", "restricted", "inaccessible"]);

export const coverageStatusSchema = z.enum([
  "unknown",
  "remote_report",
  "assigned",
  "in_progress",
  "partial",
  "visited",
  "inaccessible",
  "revisit_required",
  "closed",
]);

export const territorySchema = z.object({
  id: z.uuid(),
  incidentId: z.uuid(),
  parentId: z.uuid().nullable(),
  externalCode: z.string().max(80).nullable(),
  type: territoryTypeSchema,
  name: z.string().trim().min(1).max(180),
  geometry: areaGeometrySchema,
  accessStatus: accessStatusSchema,
  createdAt: z.iso.datetime({ offset: true }),
  revision: z.int().positive(),
});

export const geoJsonFeatureSchema = z.object({
  type: z.literal("Feature"),
  properties: z.record(z.string(), z.unknown()),
  geometry: areaGeometrySchema,
});

export const territoryImportSchema = z.object({
  source: z.enum(["dane_departments", "dane_municipalities", "custom"]),
  territoryType: territoryTypeSchema,
  codeProperty: z.string().trim().min(1).max(80),
  nameProperty: z.string().trim().min(1).max(80),
  parentId: z.uuid().nullable().default(null),
  featureCollection: z.object({
    type: z.literal("FeatureCollection"),
    features: z.array(geoJsonFeatureSchema).min(1).max(10_000),
  }),
});

export const territoryImportResultSchema = z.object({
  imported: z.int().nonnegative(),
  skipped: z.int().nonnegative(),
  source: z.string(),
});

export const createOperationalZoneSchema = z.object({
  name: z.string().trim().min(3).max(180),
  territoryId: z.uuid().nullable().default(null),
  geometry: areaGeometrySchema,
  priority: z.int().min(1).max(5).default(3),
});

export const operationalZoneSchema = createOperationalZoneSchema.extend({
  id: z.uuid(),
  incidentId: z.uuid(),
  status: z.enum(["draft", "active", "closed"]),
  coverageStatus: coverageStatusSchema,
  createdAt: z.iso.datetime({ offset: true }),
  revision: z.int().positive(),
});

export const createCoverageEventSchema = z.object({
  status: coverageStatusSchema.exclude(["unknown"]),
  occurredAt: z.iso.datetime({ offset: true }),
  visitId: z.uuid().nullable().default(null),
  notes: z.string().trim().max(2_000).nullable().default(null),
});

export const coverageEventSchema = createCoverageEventSchema.extend({
  id: z.uuid(),
  incidentId: z.uuid(),
  zoneId: z.uuid(),
  recordedAt: z.iso.datetime({ offset: true }),
});

export const fieldVisitResultSchema = z.enum([
  "completed",
  "partial",
  "inaccessible",
  "revisit_required",
]);

export const createFieldVisitSchema = z.object({
  teamId: z.uuid().nullable().default(null),
  deviceId: z.string().trim().min(3).max(120),
  clientMutationId: z.uuid(),
  startedAt: z.iso.datetime({ offset: true }),
  accessNotes: z.string().trim().max(2_000).nullable().default(null),
});

export const completeFieldVisitSchema = z.object({
  clientMutationId: z.uuid(),
  result: fieldVisitResultSchema,
  completedAt: z.iso.datetime({ offset: true }),
  track: lineStringGeometrySchema.nullable().default(null),
  accessNotes: z.string().trim().max(2_000).nullable().default(null),
});

export const fieldVisitSchema = createFieldVisitSchema.extend({
  id: z.uuid(),
  incidentId: z.uuid(),
  zoneId: z.uuid(),
  status: z.enum(["in_progress", "completed"]),
  result: fieldVisitResultSchema.nullable(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  track: lineStringGeometrySchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  revision: z.int().positive(),
});

export type AreaGeometry = z.infer<typeof areaGeometrySchema>;
export type TerritoryDto = z.infer<typeof territorySchema>;
export type TerritoryImportInput = z.infer<typeof territoryImportSchema>;
export type TerritoryImportResult = z.infer<typeof territoryImportResultSchema>;
export type CreateOperationalZoneInput = z.infer<typeof createOperationalZoneSchema>;
export type OperationalZoneDto = z.infer<typeof operationalZoneSchema>;
export type CreateCoverageEventInput = z.infer<typeof createCoverageEventSchema>;
export type CoverageEventDto = z.infer<typeof coverageEventSchema>;
export type CreateFieldVisitInput = z.infer<typeof createFieldVisitSchema>;
export type CompleteFieldVisitInput = z.infer<typeof completeFieldVisitSchema>;
export type FieldVisitDto = z.infer<typeof fieldVisitSchema>;
