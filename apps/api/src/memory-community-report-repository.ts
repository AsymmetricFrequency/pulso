import {
  CommunityReportNotFoundError,
  CommunityReportRateLimitError,
  type CommunityReportRepository,
  IncidentNotFoundError,
  type IncidentRepository,
  type PublicCommunityReportPage,
  type PublicCommunityReportQuery,
} from "@pulso/domain";
import {
  type CommunityReportDto,
  type CreateCommunityReportInput,
  communityReportUrgencyLabel,
  type PublicCommunityReportDto,
  type ReviewCommunityReportInput,
  type UpsertExternalCommunityReportInput,
} from "@pulso/schemas";
import { v7 as uuidv7 } from "uuid";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

type StoredCommunityReport = CommunityReportDto & { clientMutationId: string };

const toPublic = (report: CommunityReportDto): PublicCommunityReportDto => ({
  id: report.id,
  reportType: report.reportType,
  category: report.category,
  title: report.title,
  description: report.description,
  location: report.location,
  status: report.status,
  externalSourceId: report.externalSourceId,
  metadata: report.metadata,
  createdAt: report.createdAt,
});

export class MemoryCommunityReportRepository implements CommunityReportRepository {
  readonly #reports = new Map<string, StoredCommunityReport>();
  readonly #rateLimits = new Map<string, { attempts: number; resetAt: number }>();

  constructor(private readonly incidents: IncidentRepository) {}

  async create(
    incidentId: string,
    input: CreateCommunityReportInput,
    context: { sourceIpHash: string | null },
  ): Promise<PublicCommunityReportDto> {
    await this.#requireIncident(incidentId);
    this.#consumeRateLimit(context.sourceIpHash ?? "unknown");

    const duplicate = [...this.#reports.values()].find(
      (report) =>
        report.incidentId === incidentId && report.clientMutationId === input.clientMutationId,
    );
    if (duplicate) return toPublic(duplicate);

    const now = new Date().toISOString();
    const report: StoredCommunityReport = {
      id: uuidv7(),
      incidentId,
      territoryId: null,
      reportType: input.reportType,
      category: input.category,
      title: input.title,
      description: input.description,
      location: input.location,
      status: "reported",
      contact: input.contact,
      externalSourceId: null,
      metadata: input.urgency ? { urgency: communityReportUrgencyLabel[input.urgency] } : null,
      externalKey: null,
      reviewedByActorId: null,
      reviewedAt: null,
      reviewNotes: null,
      createdAt: now,
      updatedAt: now,
      clientMutationId: input.clientMutationId,
    };
    this.#reports.set(report.id, report);
    return toPublic(report);
  }

  async upsertFromExternalSource(
    incidentId: string,
    input: UpsertExternalCommunityReportInput,
  ): Promise<CommunityReportDto> {
    await this.#requireIncident(incidentId);
    const existing = [...this.#reports.values()].find(
      (report) =>
        report.externalSourceId === input.externalSourceId &&
        report.externalKey === input.externalKey,
    );
    const now = new Date().toISOString();
    const report: StoredCommunityReport = {
      id: existing?.id ?? uuidv7(),
      incidentId,
      territoryId: null,
      reportType: input.reportType,
      category: input.category,
      title: input.title,
      description: input.description,
      location: input.location,
      status: input.status,
      contact: null,
      metadata: input.metadata,
      externalSourceId: input.externalSourceId,
      externalKey: input.externalKey,
      reviewedByActorId: existing?.reviewedByActorId ?? null,
      reviewedAt: existing?.reviewedAt ?? null,
      reviewNotes: existing?.reviewNotes ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      clientMutationId: existing?.clientMutationId ?? uuidv7(),
    };
    this.#reports.set(report.id, report);
    return report;
  }

  async listPublicByIncident(
    incidentId: string,
    query: PublicCommunityReportQuery = {},
  ): Promise<PublicCommunityReportPage> {
    await this.#requireIncident(incidentId);
    const statusRank: Record<CommunityReportDto["status"], number> = {
      validated: 0,
      corroborated: 1,
      reported: 2,
      superseded: 2,
      rejected: 3,
    };
    const box = query.boundingBox;
    const scoped = [...this.#reports.values()].filter((report) => {
      if (report.incidentId !== incidentId || report.status === "rejected") return false;
      if (!box) return true;
      const [lng, lat] = report.location.coordinates;
      return lng >= box[0] && lng <= box[2] && lat >= box[1] && lat <= box[3];
    });
    return {
      reports: scoped
        .sort(
          (a, b) =>
            statusRank[a.status] - statusRank[b.status] || b.createdAt.localeCompare(a.createdAt),
        )
        .slice(0, box ? 4_000 : 800)
        .map(toPublic),
      total: scoped.length,
    };
  }

  async findPublicById(
    incidentId: string,
    reportId: string,
  ): Promise<PublicCommunityReportDto | null> {
    await this.#requireIncident(incidentId);
    const report = this.#reports.get(reportId);
    if (!report || report.incidentId !== incidentId || report.status === "rejected") return null;
    return toPublic(report);
  }

  async listByIncident(incidentId: string): Promise<CommunityReportDto[]> {
    await this.#requireIncident(incidentId);
    return [...this.#reports.values()]
      .filter((report) => report.incidentId === incidentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async review(
    reportId: string,
    reviewerActorId: string,
    input: ReviewCommunityReportInput,
  ): Promise<CommunityReportDto> {
    const report = this.#reports.get(reportId);
    if (!report) throw new CommunityReportNotFoundError(reportId);
    const reviewed: StoredCommunityReport = {
      ...report,
      status: input.status,
      reviewedByActorId: reviewerActorId,
      reviewedAt: new Date().toISOString(),
      reviewNotes: input.notes,
      updatedAt: new Date().toISOString(),
    };
    this.#reports.set(reportId, reviewed);
    return reviewed;
  }

  #consumeRateLimit(key: string) {
    const now = Date.now();
    const existing = this.#rateLimits.get(key);
    if (!existing || existing.resetAt <= now) {
      this.#rateLimits.set(key, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return;
    }
    existing.attempts += 1;
    if (existing.attempts > RATE_LIMIT_MAX_ATTEMPTS) {
      throw new CommunityReportRateLimitError(
        Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
      );
    }
  }

  async #requireIncident(incidentId: string) {
    if (!(await this.incidents.findById(incidentId))) throw new IncidentNotFoundError(incidentId);
  }
}
