import type { RemoteDamageResponse } from "@pulso/schemas";

/**
 * Lectura de la evaluación de daño por satélite.
 *
 * Solo lectura y a propósito: este dato no lo produce Pulso, lo produce UNOSAT o Microsoft y
 * nosotros lo ingerimos con su licencia a cuestas. No hay ninguna ruta por la que alguien pueda
 * crear un daño de satélite desde la aplicación — inventarlo sería exactamente lo que este dato
 * sirve para evitar.
 */
export interface RemoteDamageRepository {
  publicView(incidentId: string): Promise<RemoteDamageResponse>;
}
