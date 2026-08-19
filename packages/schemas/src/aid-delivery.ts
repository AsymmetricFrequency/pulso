import { z } from "zod";

/**
 * Cómo se sabe que una entrega llegó. El orden es el de la confianza, y `rechazada` es el estado
 * que hace que esto sea auditoría y no un boletín: es la única señal que no puede venir de quien
 * tiene interés en que la cifra suba.
 */
export const deliveryConfirmationStateSchema = z.enum([
  "declarada",
  "confirmada",
  "verificada",
  "rechazada",
]);

export const createHouseholdDeliverySchema = z.object({
  /** El código del hogar. Quien registra la entrega lo tiene porque lo tuvo delante al entregar. */
  publicCode: z.string().trim().min(6).max(20),
  description: z.string().trim().min(3).max(300),
  quantity: z.number().positive().max(1_000_000).nullable().default(null),
  unit: z.string().trim().max(30).nullable().default(null),
  /** Quién entregó. Una organización con nombre: si nadie responde, no se puede auditar. */
  deliveredBy: z.string().trim().min(3).max(200),
  fundingSource: z.string().trim().max(200).nullable().default(null),
  deliveredAt: z.iso.datetime({ offset: true }),
});

/** Lo que ve el hogar al consultar con su código. Es su propio dato, así que lo ve entero. */
export const householdDeliverySchema = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  deliveredBy: z.string(),
  fundingSource: z.string().nullable(),
  confirmation: deliveryConfirmationStateSchema,
  householdNote: z.string().nullable(),
  deliveredAt: z.string(),
});

export const confirmDeliverySchema = z.object({
  /** `false` es la respuesta que más importa: «esto no me llegó». */
  received: z.boolean(),
  note: z.string().trim().min(3).max(500).nullable().default(null),
});

/** El agregado público: cuánto llegó a una puerta, por municipio y sin identificar a nadie. */
export const aidDeliveryCoverageSchema = z.object({
  incidentCode: z.string(),
  totals: z.object({
    householdsReached: z.number().int().min(0),
    deliveries: z.number().int().min(0),
    confirmedByHousehold: z.number().int().min(0),
    independentlyVerified: z.number().int().min(0),
    /** Se publica igual que las confirmadas. Publicar solo las buenas sería propaganda. */
    disputedByHousehold: z.number().int().min(0),
    onlyDeclared: z.number().int().min(0),
    tracedToContract: z.number().int().min(0),
  }),
  byTerritory: z
    .object({
      divipola: z.string().nullable(),
      municipality: z.string().nullable(),
      householdsReached: z.number().int().min(0),
      deliveries: z.number().int().min(0),
      confirmedByHousehold: z.number().int().min(0),
      disputedByHousehold: z.number().int().min(0),
      lastDeliveryAt: z.string().nullable(),
    })
    .array(),
  generatedAt: z.string(),
});

export type CreateHouseholdDeliveryInput = z.infer<typeof createHouseholdDeliverySchema>;
export type HouseholdDelivery = z.infer<typeof householdDeliverySchema>;
export type ConfirmDeliveryInput = z.infer<typeof confirmDeliverySchema>;
export type AidDeliveryCoverage = z.infer<typeof aidDeliveryCoverageSchema>;
