import type {
  CompleteFieldVisitInput,
  CoverageEventDto,
  CreateCoverageEventInput,
  CreateFieldVisitInput,
  CreateOperationalZoneInput,
  FieldVisitDto,
  OperationalZoneDto,
  TerritoryDto,
  TerritoryImportInput,
  TerritoryImportResult,
} from "@pulso/schemas";

export interface TerritoryRepository {
  importTerritories(
    incidentId: string,
    input: TerritoryImportInput,
  ): Promise<TerritoryImportResult>;
  listTerritories(incidentId: string): Promise<TerritoryDto[]>;
  createOperationalZone(
    incidentId: string,
    input: CreateOperationalZoneInput,
  ): Promise<OperationalZoneDto>;
  listOperationalZones(incidentId: string): Promise<OperationalZoneDto[]>;
  addCoverageEvent(zoneId: string, input: CreateCoverageEventInput): Promise<CoverageEventDto>;
  listCoverageEvents(zoneId: string): Promise<CoverageEventDto[]>;
  findOperationalZone(zoneId: string): Promise<OperationalZoneDto | undefined>;
  createFieldVisit(zoneId: string, input: CreateFieldVisitInput): Promise<FieldVisitDto>;
  completeFieldVisit(visitId: string, input: CompleteFieldVisitInput): Promise<FieldVisitDto>;
  listFieldVisits(zoneId: string): Promise<FieldVisitDto[]>;
}

export class FieldVisitNotFoundError extends Error {
  constructor(id: string) {
    super(`Field visit not found: ${id}`);
    this.name = "FieldVisitNotFoundError";
  }
}

export class FieldVisitConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldVisitConflictError";
  }
}

export class IncidentNotFoundError extends Error {
  constructor(id: string) {
    super(`Incident not found: ${id}`);
    this.name = "IncidentNotFoundError";
  }
}

export class OperationalZoneNotFoundError extends Error {
  constructor(id: string) {
    super(`Operational zone not found: ${id}`);
    this.name = "OperationalZoneNotFoundError";
  }
}
