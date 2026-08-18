import type {
  CreateHouseholdRegistrationInput,
  CreateRegistrationEvidenceInput,
  HouseholdRegistrationReceipt,
  HouseholdRegistryStats,
  RegistrationQueueItem,
  ReviewRegistrationInput,
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

  /** Foto del daño. El código público es la credencial: se añade a *su* registro y a ningún otro. */
  addEvidence(
    incidentId: string,
    input: CreateRegistrationEvidenceInput,
  ): Promise<{ stored: boolean; stripped: boolean }>;

  /** La cola de quien audita. Sin imágenes: esas se piden aparte y queda constancia de quién miró. */
  queue(
    incidentId: string,
    query?: { signal?: string; limit?: number },
  ): Promise<RegistrationQueueItem[]>;

  review(
    incidentId: string,
    registrationId: string,
    reviewerActorId: string,
    input: ReviewRegistrationInput,
  ): Promise<boolean>;
}
