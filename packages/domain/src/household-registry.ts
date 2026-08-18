import type {
  CreateHouseholdRegistrationInput,
  HouseholdRegistrationReceipt,
  HouseholdRegistryStats,
} from "@pulso/schemas";

/**
 * Censo comunitario de hogares afectados.
 *
 * El puerto expone tres cosas y ninguna devuelve datos personales: registrar, borrar a petición de
 * la persona, y agregar. Descifrar el contacto de un hogar es una operación distinta, con su propia
 * autorización, y no vive aquí — para que nadie la alcance sin darse cuenta.
 */
export interface HouseholdRegistryRepository {
  register(
    incidentId: string,
    input: CreateHouseholdRegistrationInput,
    context: { sourceIpHash: string | null },
  ): Promise<HouseholdRegistrationReceipt>;
  /** Vacía los datos personales y conserva los conteos. Ver la nota en el repositorio de Postgres. */
  redact(incidentId: string, publicCode: string): Promise<boolean>;
  stats(incidentId: string, incidentCode: string): Promise<HouseholdRegistryStats>;
}
