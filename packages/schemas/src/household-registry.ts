import { z } from "zod";

/**
 * Censo comunitario: un hogar afectado se registra por su cuenta.
 *
 * **No es el Registro Único de Damnificados y no da derecho a ninguna ayuda.** El censo oficial lo
 * diligencia personal autorizado casa a casa. Lo que este registro hace es permitir que un hogar
 * diga «aquí estamos y no ha venido nadie», para poder entregarle esa lista a su alcaldía.
 *
 * Ocho campos y no los cuarenta del diccionario del RUD: cada campo extra es una razón más para
 * abandonar el formulario a mitad, y una responsabilidad más sobre datos que no somos autoridad
 * para tratar. Lo que no sirva para que una brigada llegue a una puerta, no se pide.
 */
export const dwellingStatusSchema = z.enum([
  "destruida",
  "inhabitable",
  "con_danos",
  "sin_danos",
  "no_sabe",
]);

export const shelteringAtSchema = z.enum([
  "vivienda",
  "albergue",
  "familiares",
  "calle_o_carpa",
  "otro",
]);

/** La pregunta que justifica todo el registro. */
export const censusedSchema = z.enum(["si", "no", "no_sabe"]);

const pointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
});

export const createHouseholdRegistrationSchema = z
  .object({
    clientMutationId: z.uuid(),

    /** Barrio o vereda. Es el único dato de ubicación obligatorio: **no se pide dirección exacta.** */
    neighborhood: z.string().trim().min(2).max(120),
    territoryCode: z.string().trim().max(10).nullable().default(null),
    location: pointSchema.nullable().default(null),

    peopleCount: z.int().min(1).max(40),
    childrenCount: z.int().min(0).max(40).default(0),
    olderAdultsCount: z.int().min(0).max(40).default(0),
    hasDisability: z.boolean().default(false),
    hasPregnancy: z.boolean().default(false),
    hasChronicIllness: z.boolean().default(false),

    dwellingStatus: dwellingStatusSchema,
    shelteringAt: shelteringAtSchema,
    officiallyCensused: censusedSchema.default("no_sabe"),

    /** Opcionales de verdad. Una persona sin documento no puede quedar bloqueada. */
    contactName: z.string().trim().min(2).max(120).nullable().default(null),
    contactPhone: z.string().trim().min(7).max(20).nullable().default(null),
    document: z.string().trim().min(4).max(20).nullable().default(null),

    /**
     * El consentimiento viaja explícito y con la versión del texto que se mostró. Un booleano
     * suelto no prueba **a qué** consintió la persona, y eso es lo que exige la Ley 1581.
     */
    consentVersion: z.int().min(1),
    consentAccepted: z.literal(true),
  })
  .refine((input) => input.childrenCount + input.olderAdultsCount <= input.peopleCount, {
    message: "Los niños y las personas mayores no pueden sumar más que el total del hogar.",
    path: ["childrenCount"],
  });

/**
 * Lo que se le devuelve a quien se registra: su código y nada más.
 *
 * Deliberadamente no devuelve lo que envió. Si la respuesta repitiera el nombre y el teléfono, ese
 * dato quedaría en el historial del navegador de un teléfono que puede ser prestado o compartido.
 */
export const householdRegistrationReceiptSchema = z.object({
  publicCode: z.string(),
  createdAt: z.string(),
});

/** La vista para quien coordina. Sin datos personales: eso vive cifrado y se descifra aparte. */
export const householdRegistrationSummarySchema = z.object({
  publicCode: z.string(),
  neighborhood: z.string().nullable(),
  territoryName: z.string().nullable(),
  peopleCount: z.number().int(),
  childrenCount: z.number().int(),
  olderAdultsCount: z.number().int(),
  hasDisability: z.boolean(),
  hasPregnancy: z.boolean(),
  hasChronicIllness: z.boolean(),
  dwellingStatus: dwellingStatusSchema,
  shelteringAt: shelteringAtSchema,
  officiallyCensused: censusedSchema,
  status: z.string(),
  hasContact: z.boolean(),
  createdAt: z.string(),
});

/**
 * El agregado público. Es lo único que sale sin sesión.
 *
 * `uncensusedHouseholds` es la cifra que se le lleva a una alcaldía, y `peopleInUncensused` la que
 * la hace accionable: veinte hogares es una tarde de brigada, ochenta son tres días.
 */
export const householdRegistryStatsSchema = z.object({
  incidentCode: z.string(),
  households: z.number().int().min(0),
  people: z.number().int().min(0),
  uncensusedHouseholds: z.number().int().min(0),
  peopleInUncensused: z.number().int().min(0),
  sleepingRough: z.number().int().min(0),
  withPriorityCondition: z.number().int().min(0),
  /**
   * El estado del cruce automático. Se publica porque **es la única cifra honesta sobre la calidad
   * del registro**: decir «tenemos N hogares» sin decir cuántos se pudieron contrastar es afirmar
   * una solidez que no se tiene. `uncontrasted` no es sospecha — es el caso normal en un municipio
   * del que no hay dato, que es donde más falta hace registrarse.
   */
  validation: z.object({
    coherent: z.number().int().min(0),
    uncontrasted: z.number().int().min(0),
    toReview: z.number().int().min(0),
    humanReviewed: z.number().int().min(0),
  }),
  byTerritory: z
    .object({
      territoryCode: z.string().nullable(),
      territoryName: z.string().nullable(),
      households: z.number().int().min(0),
      people: z.number().int().min(0),
      uncensused: z.number().int().min(0),
    })
    .array(),
  generatedAt: z.string(),
});

export type CreateHouseholdRegistrationInput = z.infer<typeof createHouseholdRegistrationSchema>;
export type HouseholdRegistrationReceipt = z.infer<typeof householdRegistrationReceiptSchema>;
export type HouseholdRegistrationSummary = z.infer<typeof householdRegistrationSummarySchema>;
export type HouseholdRegistryStats = z.infer<typeof householdRegistryStatsSchema>;
