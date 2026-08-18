import { z } from "zod";

/**
 * Un eslabón de la cadena de la ayuda.
 *
 * La cadena es `necesidad → asignación → despacho → entrega`, y cada eslabón se cuenta aparte
 * porque **una promesa no es un despacho y un despacho no es una entrega**. Juntarlos en un solo
 * número «ayuda gestionada» es exactamente cómo se llega a afirmar que llegó algo que no llegó.
 */
export const aidChainLinkSchema = z.object({
  key: z.enum(["necesidad", "asignacion", "despacho", "entrega"]),
  label: z.string(),
  count: z.number().int().min(0),
  /**
   * Cuántos de esos llevan respaldo verificable. En una necesidad es que alguien la validó; en una
   * entrega, que hay evidencia adjunta. Un eslabón con muchos registros y poco respaldo no es
   * trazabilidad — es volumen.
   */
  backed: z.number().int().min(0),
  backedLabel: z.string(),
});

/**
 * Qué tan confirmada está una entrega.
 *
 * Cuatro estados y no un booleano «entregado»: quien entrega diciendo que entregó no es lo mismo
 * que el receptor confirmándolo, y ninguna de las dos es lo mismo que un tercero verificándolo.
 * Para un ente de control esa diferencia es el objeto de su trabajo.
 */
export const deliveryConfirmationSchema = z.object({
  reported: z.number().int().min(0),
  recipientConfirmed: z.number().int().min(0),
  independentlyVerified: z.number().int().min(0),
  disputed: z.number().int().min(0),
});

/**
 * Integridad de los cortes publicados.
 *
 * Cada corte guarda el hash de lo que se publicó y apunta al que reemplaza, así que se puede
 * comprobar que una cifra no cambió después de haber sido publicada. `externallyAnchored` dice
 * cuántos están anclados **fuera** de Pulso: mientras sea cero, la cadena se verifica contra
 * nosotros mismos, y eso hay que decirlo en vez de dejarlo entender.
 */
export const publicationIntegritySchema = z.object({
  published: z.number().int().min(0),
  firstCutoffAt: z.string().nullable(),
  lastCutoffAt: z.string().nullable(),
  chained: z.number().int().min(0),
  externallyAnchored: z.number().int().min(0),
});

export const aidTraceabilitySchema = z.object({
  incidentCode: z.string(),
  chain: aidChainLinkSchema.array(),
  deliveryConfirmation: deliveryConfirmationSchema,
  integrity: publicationIntegritySchema,
  /** Contratos con dinero público, que es el otro carril de la trazabilidad. */
  contracts: z.object({
    total: z.number().int().min(0),
    reviewed: z.number().int().min(0),
    contractedAmount: z.number(),
    paidAmount: z.number(),
    /** Contratos con una entrega verificada en territorio enlazada. El eslabón que casi nunca existe. */
    linkedToDelivery: z.number().int().min(0),
  }),
  generatedAt: z.string(),
});

export type AidChainLink = z.infer<typeof aidChainLinkSchema>;
export type AidTraceability = z.infer<typeof aidTraceabilitySchema>;
