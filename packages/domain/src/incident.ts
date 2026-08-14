import type { CreateIncidentInput, IncidentDto } from "@pulso/schemas";

export interface IncidentRepository {
  create(input: CreateIncidentInput): Promise<IncidentDto>;
  findByCode(code: string): Promise<IncidentDto | undefined>;
  findById(id: string): Promise<IncidentDto | undefined>;
  list(): Promise<IncidentDto[]>;
}

export class IncidentCodeAlreadyExistsError extends Error {
  constructor(code: string) {
    super(`Incident code already exists: ${code}`);
    this.name = "IncidentCodeAlreadyExistsError";
  }
}
