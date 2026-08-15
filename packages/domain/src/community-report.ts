import type {
  CommunityReportDto,
  CreateCommunityReportInput,
  PublicCommunityReportDto,
  ReviewCommunityReportInput,
  UpsertExternalCommunityReportInput,
} from "@pulso/schemas";

export interface CommunityReportRepository {
  create(
    incidentId: string,
    input: CreateCommunityReportInput,
    context: { sourceIpHash: string | null },
  ): Promise<PublicCommunityReportDto>;
  listPublicByIncident(incidentId: string): Promise<PublicCommunityReportDto[]>;
  listByIncident(incidentId: string): Promise<CommunityReportDto[]>;
  review(
    reportId: string,
    reviewerActorId: string,
    input: ReviewCommunityReportInput,
  ): Promise<CommunityReportDto>;
  /** Upserts a point ingested from a third-party public feed, keyed by (externalSourceId, externalKey). */
  upsertFromExternalSource(
    incidentId: string,
    input: UpsertExternalCommunityReportInput,
  ): Promise<CommunityReportDto>;
}

export class CommunityReportNotFoundError extends Error {
  constructor(id: string) {
    super(`Community report not found: ${id}`);
    this.name = "CommunityReportNotFoundError";
  }
}

export class CommunityReportRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many community reports from this source.");
    this.name = "CommunityReportRateLimitError";
  }
}
