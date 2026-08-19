import { ContractNotFoundError, type PublicFundsRepository } from "@pulso/domain";
import type {
  OperationsContractDto,
  PublicContractDto,
  PublicFundsSummaryDto,
} from "@pulso/schemas";

/**
 * Implementación vacía para cuando la API corre sin Postgres.
 *
 * Devuelve ceros y listas vacías, no datos de ejemplo: una instancia sin base de datos no sabe
 * nada del dinero público, y decir cualquier otra cosa sería inventarlo. Es el mismo criterio de
 * `EmptyCaliPublicSourceRepository`.
 */
export class EmptyPublicFundsRepository implements PublicFundsRepository {
  constructor(private readonly incidentCode = "") {}

  async summarizeByIncident(): Promise<PublicFundsSummaryDto> {
    return {
      incidentCode: this.incidentCode,
      currency: "COP",
      stages: [],
      lastMile: [],
      reviewed: { confirmed: 0, probable: 0, unrelated: 0, unreviewed: 0 },
      territories: [],
      sources: [],
    };
  }

  async listContractsByIncident(): Promise<PublicContractDto[]> {
    return [];
  }

  async listContractsForReview(): Promise<OperationsContractDto[]> {
    return [];
  }

  async reviewContract(contractId: string): Promise<OperationsContractDto> {
    // Sin base de datos no hay contrato que revisar; fingir que la revisión se guardó sería peor
    // que fallar, porque el usuario creería haber confirmado algo.
    throw new ContractNotFoundError(contractId);
  }
}
