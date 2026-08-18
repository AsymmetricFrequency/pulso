import { z } from "zod";

/**
 * En qué estado está el censo de un municipio.
 *
 * Cuatro frases y no un puntaje del 0 al 100 a propósito: un número se discute y estas cuatro se
 * verifican. Cada una responde una pregunta distinta a quien tiene que decidir a dónde manda una
 * brigada mañana.
 */
export const censusCoverageStateSchema = z.enum([
  /** Sacudió fuerte, nadie reportó nada y nadie dice haber censado. Nadie ha ido a mirar. */
  "silencio",
  /** Hay señal de gente afectada y todavía no hay censo. */
  "sin_censo",
  "en_curso",
  "con_censo",
  /** Sacudida baja y sin señal: no es que falte censar, es que no aplica. */
  "fuera_de_alcance",
]);

export const censusCoverageRowSchema = z.object({
  /** Código DIVIPOLA. Es el que usa la UNGRD, y por eso lo que salga de aquí lo puede leer. */
  divipola: z.string().nullable(),
  municipality: z.string(),
  department: z.string().nullable(),
  /** Intensidad Mercalli máxima modelada por el USGS. Null si la malla no cubre el municipio. */
  mmiMax: z.number().nullable(),
  mmiLabel: z.string().nullable(),
  reportCount: z.number().int().min(0),
  coverageState: censusCoverageStateSchema,
  /**
   * Nulo no es cero. Un cero dice «fueron y no inscribieron a nadie»; un nulo dice «no sabemos si
   * fueron». Confundirlos inventaría cobertura donde solo hay silencio.
   */
  reportedPeople: z.number().int().nullable(),
  registeredPeople: z.number().int().nullable(),
  censusObservedAt: z.string().nullable(),
});

export const censusCoverageSummarySchema = z.object({
  incidentCode: z.string(),
  /** Municipios en cada estado. Es el titular: cuántos siguen sin que nadie haya ido. */
  counts: z.object({
    silencio: z.number().int().min(0),
    sin_censo: z.number().int().min(0),
    en_curso: z.number().int().min(0),
    con_censo: z.number().int().min(0),
    fuera_de_alcance: z.number().int().min(0),
  }),
  /** Municipios con lectura de sacudida. Sin esto, «44 en silencio» no se puede dimensionar. */
  municipalitiesWithShaking: z.number().int().min(0),
  rows: censusCoverageRowSchema.array(),
});

export type CensusCoverageState = z.infer<typeof censusCoverageStateSchema>;
export type CensusCoverageRow = z.infer<typeof censusCoverageRowSchema>;
export type CensusCoverageSummary = z.infer<typeof censusCoverageSummarySchema>;
