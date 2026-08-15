import type { ReconstructionProgressDto } from "@pulso/schemas";

export interface ReconstructionProgressRepository {
  getByIncidentCode(incidentCode: string): Promise<ReconstructionProgressDto>;
}
