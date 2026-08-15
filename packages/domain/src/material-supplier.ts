import type { CreateMaterialSupplierInput, PublicMaterialSupplierDto } from "@pulso/schemas";

export interface MaterialSupplierRepository {
  create(
    incidentId: string,
    input: CreateMaterialSupplierInput,
    context: { sourceIpHash: string | null },
  ): Promise<PublicMaterialSupplierDto>;
  listPublicByIncident(incidentId: string): Promise<PublicMaterialSupplierDto[]>;
}

export class MaterialSupplierRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many supplier registrations from this source.");
    this.name = "MaterialSupplierRateLimitError";
  }
}
