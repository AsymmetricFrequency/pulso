import type {
  CreateWorkforceProfileInput,
  OperationsWorkforceProfileDto,
  PublicWorkforceProfileDto,
} from "@pulso/schemas";

export interface WorkforceProfileRepository {
  create(
    incidentId: string,
    input: CreateWorkforceProfileInput,
    context: { sourceIpHash: string | null },
  ): Promise<PublicWorkforceProfileDto>;
  listPublicByIncident(incidentId: string): Promise<PublicWorkforceProfileDto[]>;
  /** Operations-only: includes the decrypted name/contact so a coordinator can reach the worker. */
  listByIncident(incidentId: string): Promise<OperationsWorkforceProfileDto[]>;
}

export class WorkforceProfileRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many workforce registrations from this source.");
    this.name = "WorkforceProfileRateLimitError";
  }
}
