import {
  IncidentNotFoundError,
  type IncidentRepository,
  WorkforceProfileRateLimitError,
  type WorkforceProfileRepository,
} from "@pulso/domain";
import type {
  CreateWorkforceProfileInput,
  OperationsWorkforceProfileDto,
  PublicWorkforceProfileDto,
} from "@pulso/schemas";
import { v7 as uuidv7 } from "uuid";
import { maskDisplayName } from "./field-encryption.js";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

type StoredWorkforceProfile = OperationsWorkforceProfileDto & {
  incidentId: string;
  clientMutationId: string;
};

export class MemoryWorkforceProfileRepository implements WorkforceProfileRepository {
  readonly #profiles = new Map<string, StoredWorkforceProfile>();
  readonly #rateLimits = new Map<string, { attempts: number; resetAt: number }>();

  constructor(private readonly incidents: IncidentRepository) {}

  async create(
    incidentId: string,
    input: CreateWorkforceProfileInput,
    context: { sourceIpHash: string | null },
  ): Promise<PublicWorkforceProfileDto> {
    await this.#requireIncident(incidentId);
    this.#consumeRateLimit(context.sourceIpHash ?? "unknown");

    const duplicate = [...this.#profiles.values()].find(
      (profile) =>
        profile.incidentId === incidentId && profile.clientMutationId === input.clientMutationId,
    );
    if (duplicate) return this.#toPublic(duplicate);

    const now = new Date().toISOString();
    const profile: StoredWorkforceProfile = {
      id: uuidv7(),
      incidentId,
      clientMutationId: input.clientMutationId,
      territoryCode: input.territoryCode,
      displayName: input.displayName,
      maskedDisplayName: maskDisplayName(input.displayName),
      contact: input.contact,
      role: input.role,
      headcount: input.headcount,
      availability: "available",
      verificationLevel: "reported",
      notes: input.notes,
      createdAt: now,
    };
    this.#profiles.set(profile.id, profile);
    return this.#toPublic(profile);
  }

  async listPublicByIncident(incidentId: string): Promise<PublicWorkforceProfileDto[]> {
    await this.#requireIncident(incidentId);
    return [...this.#profiles.values()]
      .filter((profile) => profile.incidentId === incidentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((profile) => this.#toPublic(profile));
  }

  async listByIncident(incidentId: string): Promise<OperationsWorkforceProfileDto[]> {
    await this.#requireIncident(incidentId);
    return [...this.#profiles.values()]
      .filter((profile) => profile.incidentId === incidentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  #toPublic(profile: StoredWorkforceProfile): PublicWorkforceProfileDto {
    return {
      id: profile.id,
      territoryCode: profile.territoryCode,
      maskedDisplayName: profile.maskedDisplayName,
      role: profile.role,
      headcount: profile.headcount,
      availability: profile.availability,
      verificationLevel: profile.verificationLevel,
      notes: profile.notes,
      createdAt: profile.createdAt,
    };
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
      throw new WorkforceProfileRateLimitError(
        Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
      );
    }
  }

  async #requireIncident(incidentId: string) {
    if (!(await this.incidents.findById(incidentId))) throw new IncidentNotFoundError(incidentId);
  }
}
