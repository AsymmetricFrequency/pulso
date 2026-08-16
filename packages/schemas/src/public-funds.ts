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

export type FundingStage = z.infer<typeof fundingStageSchema>;
export type EmergencyRelevance = z.infer<typeof emergencyRelevanceSchema>;
export type PublicContractDto = z.infer<typeof publicContractSchema>;
export type PublicFundsSummaryDto = z.infer<typeof publicFundsSummarySchema>;
