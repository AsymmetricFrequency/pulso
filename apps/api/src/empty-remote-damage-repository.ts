import type { RemoteDamageRepository } from "@pulso/domain";
import type { RemoteDamageResponse } from "@pulso/schemas";

/**
 * Sin base de datos no hay evaluación de satélite que servir. Listas vacías, no datos de ejemplo:
 * una fila inventada aquí sería indistinguible de una real para quien consuma la API.
 */
export class EmptyRemoteDamageRepository implements RemoteDamageRepository {
  async publicView(): Promise<RemoteDamageResponse> {
    return { points: [], areas: [], byMunicipality: [], attribution: [] };
  }
}
