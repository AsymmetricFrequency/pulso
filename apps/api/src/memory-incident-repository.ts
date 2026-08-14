import { IncidentCodeAlreadyExistsError, type IncidentRepository } from "@pulso/domain";
import type { CreateIncidentInput, IncidentDto } from "@pulso/schemas";
import { v7 as uuidv7 } from "uuid";

export class MemoryIncidentRepository implements IncidentRepository {
  readonly #incidents = new Map<string, IncidentDto>();

  async create(input: CreateIncidentInput): Promise<IncidentDto> {
    if (await this.findByCode(input.code)) {
      throw new IncidentCodeAlreadyExistsError(input.code);
    }

    const now = new Date().toISOString();
    const incident: IncidentDto = {
      ...input,
      id: uuidv7(),
      status: "active",
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };

    this.#incidents.set(incident.id, incident);
    return incident;
  }

  async findByCode(code: string): Promise<IncidentDto | undefined> {
    return [...this.#incidents.values()].find((incident) => incident.code === code);
  }

  async findById(id: string): Promise<IncidentDto | undefined> {
    return this.#incidents.get(id);
  }

  async list(): Promise<IncidentDto[]> {
    return [...this.#incidents.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
}
