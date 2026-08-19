import { z } from "zod";

/**
 * El responsable del tratamiento, tal y como lo exige el art. 13.1 del Decreto 1377.
 *
 * Se sirve como dato y no como texto fijo porque va a cambiar: los datos se van a canalizar por una
 * fundación constituida. Cuando llegue, es una fila nueva y esta respuesta cambia sola.
 */
export const dataControllerSchema = z.object({
  version: z.number().int().min(1),
  legalName: z.string(),
  /** Nulo mientras la figura jurídica no exista. Nulo es más honesto que un número inventado. */
  taxId: z.string().nullable(),
  legalForm: z.enum(["proyecto_voluntario", "fundacion", "corporacion", "entidad_publica", "otra"]),
  address: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  privacyContact: z.string(),
  /** Si es `false`, la página lo dice en vez de aparentar una formalidad que no hay. */
  legallyConstituted: z.boolean(),
  effectiveFrom: z.string(),
});

export type DataController = z.infer<typeof dataControllerSchema>;
