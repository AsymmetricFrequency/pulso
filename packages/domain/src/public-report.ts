import type { PublicSituationReportDto } from "@pulso/schemas";

export interface PublicReportRepository {
  findPublishedByIncidentCode(incidentCode: string): Promise<PublicSituationReportDto | undefined>;
}
