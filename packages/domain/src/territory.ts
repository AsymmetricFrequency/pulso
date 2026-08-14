import type {
  CoverageEventDto,
  CreateCoverageEventInput,
  CreateOperationalZoneInput,
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
