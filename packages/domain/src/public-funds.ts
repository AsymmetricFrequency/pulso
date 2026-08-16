import type { EmergencyRelevance, PublicContractDto, PublicFundsSummaryDto } from "@pulso/schemas";

export type PublicContractQuery = {
  /**
   * Filtro de relevancia. Por omisión la lista pública no se restringe, porque ocultar los
   * contratos sin revisar los volvería invisibles y nadie podría revisarlos; lo que sí está
   * acotado es el **resumen**, que solo suma lo confirmado.
   */
  relevance?: EmergencyRelevance[];
  territoryCode?: string;
  limit?: number;
};

export interface PublicFundsRepository {
  summarizeByIncident(incidentId: string): Promise<PublicFundsSummaryDto>;
  listContractsByIncident(
    incidentId: string,
    query?: PublicContractQuery,
  ): Promise<PublicContractDto[]>;
}
