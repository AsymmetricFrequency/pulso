import { z } from "zod";

/**
 * Etapas del recorrido del dinero público, en orden.
 *
 * El orden importa: la diferencia entre lo anunciado y lo verificado en territorio es toda la
 * pregunta que este módulo existe para responder.
 */
export const fundingStageSchema = z.enum([
  "announced",
  "appropriated",
  "available",
  "committed",
  "in_procurement",
  "contracted",
  "obligated",
  "paid",
  "delivered",
  "verified_in_territory",
]);

export const emergencyRelevanceSchema = z.enum([
  "confirmed",
  "probable",
  "unrelated",
  "unreviewed",
]);

export const fundingConfidenceSchema = z.enum(["reported", "corroborated", "validated"]);

export const fundingVerificationSchema = z.enum([
  "unverified",
  "under_review",
  "verified",
  "disputed",
]);

/**
 * Un contrato tal como se publica.
 *
 * `supplierDocument` viaja solo cuando es un NIT: la contraparte persona natural se identifica por
 * nombre —que es el objeto de rendición de cuentas— pero su cédula no se almacena ni se publica.
 */
export const publicContractSchema = z.object({
  id: z.uuid(),
  externalId: z.string(),
  reference: z.string().nullable(),
  entityName: z.string(),
  entityNit: z.string(),
  supplierName: z.string(),
  supplierDocument: z.string().nullable(),
  object: z.string().nullable(),
  contractType: z.string().nullable(),
  modality: z.string().nullable(),
  status: z.string().nullable(),
  emergencyRelevance: emergencyRelevanceSchema,
  signedAt: z.string().nullable(),
  currency: z.string(),
  totalValue: z.number(),
  invoicedValue: z.number(),
  paidValue: z.number(),
  territoryName: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  /** Procedencia: sin esto una cifra pública no se puede volver a comprobar. */
  provenance: z.object({
    sourceSystem: z.string(),
    sourceReference: z.string(),
    retrievedAt: z.string(),
    parserVersion: z.string(),
    contentHash: z.string(),
  }),
});

export const fundingStageTotalSchema = z.object({
  stage: fundingStageSchema,
  amount: z.number(),
  contracts: z.number().int().min(0),
});

/**
 * Resumen público de recursos.
 *
 * `reviewPending` no es un detalle: la ingesta trae todos los contratos del territorio en el
 * periodo, y solo una parte responde a la emergencia. Publicar el total sin decir cuánto falta por
 * revisar convertiría la operación ordinaria del municipio en gasto de emergencia.
 */
export const publicFundsSummarySchema = z.object({
  incidentCode: z.string(),
  currency: z.string(),
  stages: fundingStageTotalSchema.array(),
  reviewed: z.object({
    confirmed: z.number().int().min(0),
    probable: z.number().int().min(0),
    unrelated: z.number().int().min(0),
    unreviewed: z.number().int().min(0),
  }),
  territories: z
    .object({
      code: z.string().nullable(),
      name: z.string().nullable(),
      contracts: z.number().int().min(0),
      contractedAmount: z.number(),
      paidAmount: z.number(),
    })
    .array(),
  sources: z
    .object({
      sourceId: z.string(),
      sourceSystem: z.string(),
      records: z.number().int().min(0),
      lastRetrievedAt: z.string().nullable(),
    })
    .array(),
});

/**
 * Contrato en la cola de revisión de Operaciones.
 *
 * Trae lo que hace falta para decidir sin salir de la pantalla: el objeto completo, las señales que
 * levantó el clasificador y el enlace a la fuente. Quien revisa no debería tener que adivinar por
 * qué un contrato llegó a la cola.
 */
export const operationsContractSchema = publicContractSchema.extend({
  relevanceSignals: z
    .object({
      emergencyTerms: z.string().array().default([]),
      supportingTerms: z.string().array().default([]),
      declaredUrgency: z.boolean().default(false),
      strength: z.enum(["strong", "weak", "none"]).default("none"),
    })
    .nullable(),
  reviewedAt: z.string().nullable(),
  reviewedByActorId: z.uuid().nullable(),
  reviewNotes: z.string().nullable(),
  /**
   * Lectura previa automática del objeto, para ordenar la cola.
   *
   * Vocabulario propio (`likely`/`unlikely`/`unclear`) y no el de `emergencyRelevance`: esto es
   * lo que opinó un modelo tras leer el objeto, no lo que decidió una persona. Viaja solo en la
   * vista de operaciones — el informe público no publica suposiciones de máquina.
   */
  triage: z
    .object({
      verdict: z.enum(["likely", "unlikely", "unclear"]),
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
      model: z.string(),
      at: z.string(),
    })
    .nullable(),
});

/**
 * Decisión de revisión.
 *
 * `probable` sigue siendo una opción válida: devolver un contrato a la cola —"esto podría ser, pero
 * no me alcanza para decidir"— es una respuesta legítima, y forzar un sí o un no produciría
 * confirmaciones sin fundamento, que es justo lo que este flujo existe para evitar.
 */
export const reviewContractSchema = z.object({
  relevance: z.enum(["confirmed", "probable", "unrelated"]),
  notes: z.string().trim().max(2_000).nullable().default(null),
});

export type OperationsContractDto = z.infer<typeof operationsContractSchema>;
export type ReviewContractInput = z.infer<typeof reviewContractSchema>;
export type FundingStage = z.infer<typeof fundingStageSchema>;
export type EmergencyRelevance = z.infer<typeof emergencyRelevanceSchema>;
export type PublicContractDto = z.infer<typeof publicContractSchema>;
export type PublicFundsSummaryDto = z.infer<typeof publicFundsSummarySchema>;

/**
 * Intensidad sísmica por territorio.
 *
 * Se publica aparte de las capas de daño y con rótulo propio: la intensidad es la sacudida que
 * modeló el USGS, no la afectación observada. Confundirlas haría que un municipio con MMI 7
 * apareciera como "con daño severo" sin que nadie haya ido a mirar.
 */
export const territoryShakingSchema = z.object({
  territoryCode: z.string().nullable(),
  territoryName: z.string(),
  territoryType: z.string(),
  mmiMax: z.number(),
  mmiMean: z.number().nullable(),
  mmiLabel: z.string(),
  gridCells: z.number().int().min(0),
  sourceId: z.string(),
  computedAt: z.string(),
});

export type TerritoryShakingDto = z.infer<typeof territoryShakingSchema>;
