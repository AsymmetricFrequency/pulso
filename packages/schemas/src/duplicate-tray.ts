import { z } from "zod";

/**
 * La señal que emparejó dos registros.
 *
 * Viaja siempre con el par y nunca se resume en un icono: quien decide si dos hogares son el mismo
 * necesita saber si coincidieron en un documento o en que ambos escribieron «Siloé», porque son dos
 * cosas de peso muy distinto y solo una de las dos identifica a alguien.
 */
export const duplicateSignalSchema = z.enum([
  "documento",
  "telefono",
  "barrio_y_tamano",
  "ubicacion",
  "conexion",
]);

/**
 * Cuánto pesa el emparejamiento. **Dos niveles, no un puntaje.**
 *
 * Un número entre 0 y 1 no se puede calibrar contra nada —no existe un conjunto de duplicados
 * etiquetados de este terremoto— y una cifra con decimales hace que quien audita confíe en la
 * precisión aparente en vez de mirar el caso.
 */
export const duplicateStrengthSchema = z.enum(["fuerte", "media"]);

export const duplicateStatusSchema = z.enum(["propuesto", "confirmado", "descartado", "caducado"]);

/**
 * Un lado del par, tal como se muestra en la bandeja.
 *
 * **No lleva nombre, teléfono ni documento.** Para decidir si dos registros son el mismo hogar hace
 * falta el barrio, el tamaño y la fecha; la identidad de la familia no entra en esa decisión, así
 * que tampoco entra en la respuesta. `hasContact` dice si hay un teléfono con el que llamar a
 * confirmar, que es lo único que hay que saber del dato sin verlo.
 */
export const duplicateSideSchema = z.object({
  registrationId: z.uuid(),
  publicCode: z.string(),
  neighborhood: z.string().nullable(),
  territoryName: z.string().nullable(),
  peopleCount: z.number().int(),
  dwellingStatus: z.string(),
  shelteringAt: z.string(),
  officiallyCensused: z.string(),
  hasContact: z.boolean(),
  createdAt: z.string(),
});

export const duplicateCandidateSchema = z.object({
  id: z.uuid(),
  signals: duplicateSignalSchema.array().min(1),
  strength: duplicateStrengthSchema,
  status: duplicateStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  rationale: z.string().nullable(),
  /** Cuál de los dos se conservó. Nulo mientras nadie haya decidido. */
  keepRegistrationId: z.uuid().nullable(),
  a: duplicateSideSchema,
  b: duplicateSideSchema,
});

export const duplicateTraySummarySchema = z.object({
  open: z.number().int().min(0),
  openStrong: z.number().int().min(0),
  confirmed: z.number().int().min(0),
  dismissed: z.number().int().min(0),
  /**
   * Registros vivos del censo. Es el denominador honesto: sin él, «14 pares abiertos» no dice si
   * el censo está limpio o roto.
   */
  registrations: z.number().int().min(0),
  lastMatchedAt: z.string().nullable(),
});

export const duplicateTraySchema = z.object({
  summary: duplicateTraySummarySchema,
  candidates: duplicateCandidateSchema.array(),
});

/**
 * La decisión. `keepRegistrationId` es obligatorio al confirmar y prohibido al descartar — quien
 * dice que dos registros son el mismo hogar tiene que decir además cuál se queda, porque de eso
 * depende a qué puerta va la brigada.
 */
export const resolveDuplicateSchema = z
  .object({
    decision: z.enum(["confirmado", "descartado"]),
    keepRegistrationId: z.uuid().optional(),
    /** Mismo mínimo que el motivo de una auditoría: una decisión sin motivo no se puede revisar. */
    rationale: z.string().trim().min(10).max(1_000),
  })
  .refine((v) => (v.decision === "confirmado") === (v.keepRegistrationId !== undefined), {
    message: "Al confirmar hay que decir cuál registro se conserva; al descartar, ninguno.",
    path: ["keepRegistrationId"],
  });

export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;
export type DuplicateTray = z.infer<typeof duplicateTraySchema>;
export type DuplicateSignal = z.infer<typeof duplicateSignalSchema>;
export type ResolveDuplicateInput = z.infer<typeof resolveDuplicateSchema>;
