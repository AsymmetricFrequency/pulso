import type {
  EmergencyRelevance,
  OperationsContractDto,
  PublicContractDto,
  PublicFundsSummaryDto,
  ReviewContractInput,
  TerritoryShakingDto,
} from "@pulso/schemas";

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

export type ContractReviewQueueQuery = {
  /** Por omisión la cola trae lo que nadie ha revisado todavía. */
  pendingOnly?: boolean;
  limit?: number;
};

export interface PublicFundsRepository {
  summarizeByIncident(incidentId: string): Promise<PublicFundsSummaryDto>;
  listContractsByIncident(
    incidentId: string,
    query?: PublicContractQuery,
  ): Promise<PublicContractDto[]>;
  listContractsForReview(
    incidentId: string,
    query?: ContractReviewQueueQuery,
  ): Promise<OperationsContractDto[]>;
  reviewContract(
    contractId: string,
    reviewerActorId: string,
    input: ReviewContractInput,
  ): Promise<OperationsContractDto>;
}

export class ContractNotFoundError extends Error {
  constructor(id: string) {
    super(`Contract not found: ${id}`);
    this.name = "ContractNotFoundError";
  }
}

export type TerritoryShakingQuery = { level?: "department" | "municipality"; limit?: number };

export interface SeismicShakingRepository {
  listByIncident(incidentId: string, query?: TerritoryShakingQuery): Promise<TerritoryShakingDto[]>;
}
