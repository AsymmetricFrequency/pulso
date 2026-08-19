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

    /**
     * Datos de salud = sensibles (art. 5, Ley 1581). El art. 6 del Decreto 1377 exige autorización
     * **expresa** y separada, e informar que responder es facultativo. Sin esta marca, los tres
     * campos de salud se ignoran aunque lleguen llenos.
     */
    sensitiveDataAuthorized: z.boolean().default(false),

    /**
     * Las finalidades autorizadas. Independientes a propósito: alguien puede querer aparecer en la
     * lista que va a la alcaldía y **no** querer que una fundación lo llame. Usar el dato para una
     * finalidad no marcada viola el principio de finalidad.
     */
    consentPurposes: z
      .array(z.enum(["autoridad", "entrega_ayuda"]))
      .min(1)
      .default(["autoridad"]),

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
  })
  // La misma invariante que impone la base, aquí arriba para que el error llegue antes y con un
  // mensaje que se entienda en vez de un fallo de restricción.
  .refine(
    (input) =>
      input.sensitiveDataAuthorized ||
      (!input.hasDisability && !input.hasPregnancy && !input.hasChronicIllness),
    {
      message: "No se pueden guardar datos de salud sin autorización expresa para ellos.",
      path: ["sensitiveDataAuthorized"],
    },
  );

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

/**
 * Foto del daño. **La vía universal**: sirve igual para propietario, arrendatario y ocupante, que
 * es la razón por la que la evidencia no se apoya en papeles de propiedad.
 */
export const createRegistrationEvidenceSchema = z.object({
  /** El código que recibió la persona. Es su credencial, igual que para borrar. */
  publicCode: z.string().trim().min(6).max(20),
  fileName: z.string().trim().min(1).max(180),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataBase64: z
    .string()
    .min(4)
    // 12 MB en binario, con el margen que añade base64.
    .max(17_000_000),
});

/** Lo que ve quien audita. Sin la imagen: esa se pide aparte y queda registrado quién la miró. */
export const registrationQueueItemSchema = z.object({
  registrationId: z.string(),
  publicCode: z.string(),
  neighborhood: z.string().nullable(),
  territoryName: z.string().nullable(),
  peopleCount: z.number().int(),
  dwellingStatus: dwellingStatusSchema,
  shelteringAt: shelteringAtSchema,
  officiallyCensused: censusedSchema,
  signal: z.enum(["coherente", "sin_contraste", "revisar"]).nullable(),
  checks: z.record(z.string(), z.unknown()).nullable(),
  evidenceLevel: z.enum(["declarada", "contrastada", "con_foto", "reforzada", "auditado"]),
  evidenceCount: z.number().int().min(0),
  hasContact: z.boolean(),
  reviewedOutcome: z.string().nullable(),
  createdAt: z.string(),
});

export const reviewRegistrationSchema = z.object({
  outcome: z.enum(["respaldado", "sin_evidencia", "duplicado", "inconsistente"]),
  /** Obligatorio: una auditoría que dice quién y no dice con qué se apoyó no se puede revisar. */
  rationale: z.string().trim().min(10).max(1_000),
  evidenceKind: z.enum([
    "visita_en_terreno",
    "llamada",
    "lista_oficial",
    "senales_automaticas",
    "otro",
  ]),
});

export type CreateRegistrationEvidenceInput = z.infer<typeof createRegistrationEvidenceSchema>;
export type RegistrationQueueItem = z.infer<typeof registrationQueueItemSchema>;
export type ReviewRegistrationInput = z.infer<typeof reviewRegistrationSchema>;

export type CreateHouseholdRegistrationInput = z.infer<typeof createHouseholdRegistrationSchema>;
export type HouseholdRegistrationReceipt = z.infer<typeof householdRegistrationReceiptSchema>;
export type HouseholdRegistrationSummary = z.infer<typeof householdRegistrationSummarySchema>;
export type HouseholdRegistryStats = z.infer<typeof householdRegistryStatsSchema>;
