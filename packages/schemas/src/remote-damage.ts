import { z } from "zod";

/**
 * Daño señalado desde un satélite.
 *
 * **`method` es el campo que hace que esto se pueda publicar sin engañar.** `analista` es una
 * persona entrenada mirando imagen de muy alta resolución; `modelo` es un modelo puntuando huellas
 * de edificación. Van con el mismo esquema porque son el mismo tipo de dato, pero nunca con el
 * mismo símbolo en el mapa: quien decide a dónde manda una brigada necesita saber cuál está
 * mirando antes de subirse al carro.
 */
export const remoteDamageMethodSchema = z.enum(["analista", "modelo"]);
export const remoteDamageLevelSchema = z.enum(["dano", "posible_dano", "sin_clasificar"]);

export const remoteDamagePointSchema = z.object({
  id: z.uuid(),
  source: z.enum(["unosat", "microsoft_ai_for_good"]),
  method: remoteDamageMethodSchema,
  damageLevel: remoteDamageLevelSchema,
  /** Puntaje del modelo, de 0 a 1. Nulo cuando lo marcó una persona: ahí no hay puntaje. */
  modelScore: z.number().nullable(),
  /**
   * Si alguien fue a mirarlo en el terreno. Hoy es `false` en las 1.627 filas y viaja igual: es la
   * diferencia entre una pista y un hecho, y quien consuma esta API tiene derecho a saberlo sin
   * leer la documentación.
   */
  fieldValidated: z.boolean(),
  /** La fecha de la imagen, no la de la ingesta. Sin ella el mapa aparenta ser de hoy. */
  imageryDate: z.string(),
  sensor: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
});

/** El trozo que el satélite alcanzó a mirar. Fuera de aquí no es que no haya daño: es que no se vio. */
export const remoteDamageAreaSchema = z.object({
  id: z.uuid(),
  source: z.enum(["unosat", "microsoft_ai_for_good"]),
  imageryDate: z.string(),
  geometry: z.unknown(),
});

export const remoteDamageAttributionSchema = z.object({
  source: z.string(),
  license: z.string(),
  attribution: z.string(),
  sourceUrl: z.string(),
  points: z.number().int().min(0),
});

export const remoteDamageMunicipalitySchema = z.object({
  divipola: z.string(),
  municipality: z.string(),
  department: z.string(),
  mmiMax: z.number().nullable(),
  citizenReports: z.number().int().min(0),
  analystFlagged: z.number().int().min(0),
  modelFlagged: z.number().int().min(0),
  levelDamage: z.number().int().min(0),
  levelPossible: z.number().int().min(0),
  fieldValidated: z.number().int().min(0),
});

export const remoteDamageResponseSchema = z.object({
  points: remoteDamagePointSchema.array(),
  areas: remoteDamageAreaSchema.array(),
  byMunicipality: remoteDamageMunicipalitySchema.array(),
  /**
   * La atribución viaja **dentro de la respuesta**, no en la documentación. CC BY y CC BY-SA la
   * exigen, y quien reutilice este endpoint no debería tener que buscarla en otro sitio para
   * cumplir la licencia.
   */
  attribution: remoteDamageAttributionSchema.array(),
});

export type RemoteDamagePoint = z.infer<typeof remoteDamagePointSchema>;
export type RemoteDamageResponse = z.infer<typeof remoteDamageResponseSchema>;
