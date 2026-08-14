import {
  FieldVisitConflictError,
  FieldVisitNotFoundError,
  IncidentNotFoundError,
  type IncidentRepository,
  OperationalZoneNotFoundError,
  type TerritoryRepository,
} from "@pulso/domain";
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
import { v7 as uuidv7 } from "uuid";

export class MemoryTerritoryRepository implements TerritoryRepository {
  readonly #territories = new Map<string, TerritoryDto>();
  readonly #zones = new Map<string, OperationalZoneDto>();
  readonly #coverageEvents = new Map<string, CoverageEventDto[]>();
  readonly #fieldVisits = new Map<string, FieldVisitDto>();

  constructor(private readonly incidents: IncidentRepository) {}

  async importTerritories(
    incidentId: string,
    input: TerritoryImportInput,
  ): Promise<TerritoryImportResult> {
    await this.#requireIncident(incidentId);
    let imported = 0;
    let skipped = 0;

    for (const feature of input.featureCollection.features) {
      const rawCode = feature.properties[input.codeProperty];
      const rawName = feature.properties[input.nameProperty];
      if (
        (typeof rawCode !== "string" && typeof rawCode !== "number") ||
        typeof rawName !== "string"
      ) {
        skipped += 1;
        continue;
      }

      const externalCode = String(rawCode);
      const duplicate = [...this.#territories.values()].some(
        (territory) =>
          territory.incidentId === incidentId &&
          territory.type === input.territoryType &&
          territory.externalCode === externalCode,
      );
      if (duplicate) {
        skipped += 1;
        continue;
      }

      const territory: TerritoryDto = {
        id: uuidv7(),
        incidentId,
        parentId: input.parentId,
        externalCode,
        type: input.territoryType,
        name: rawName.trim(),
        geometry: feature.geometry,
        accessStatus: "unknown",
        createdAt: new Date().toISOString(),
        revision: 1,
      };
      this.#territories.set(territory.id, territory);
      imported += 1;
    }

    return { imported, skipped, source: input.source };
  }

  async listTerritories(incidentId: string): Promise<TerritoryDto[]> {
    await this.#requireIncident(incidentId);
    return [...this.#territories.values()]
      .filter((territory) => territory.incidentId === incidentId)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  async createOperationalZone(
    incidentId: string,
    input: CreateOperationalZoneInput,
  ): Promise<OperationalZoneDto> {
    await this.#requireIncident(incidentId);
    const zone: OperationalZoneDto = {
      ...input,
      id: uuidv7(),
      incidentId,
      status: "active",
      coverageStatus: "unknown",
      createdAt: new Date().toISOString(),
      revision: 1,
    };
    this.#zones.set(zone.id, zone);
    return zone;
  }

  async listOperationalZones(incidentId: string): Promise<OperationalZoneDto[]> {
    await this.#requireIncident(incidentId);
    return [...this.#zones.values()]
      .filter((zone) => zone.incidentId === incidentId)
      .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "es"));
  }

  async addCoverageEvent(
    zoneId: string,
    input: CreateCoverageEventInput,
  ): Promise<CoverageEventDto> {
    const zone = this.#zones.get(zoneId);
    if (!zone) throw new OperationalZoneNotFoundError(zoneId);

    const recordedAt = new Date().toISOString();
    const event: CoverageEventDto = {
      ...input,
      id: uuidv7(),
      incidentId: zone.incidentId,
      zoneId,
      recordedAt,
    };
    this.#coverageEvents.set(zoneId, [...(this.#coverageEvents.get(zoneId) ?? []), event]);
    this.#zones.set(zoneId, {
      ...zone,
      coverageStatus: input.status,
      revision: zone.revision + 1,
    });
    return event;
  }

  async listCoverageEvents(zoneId: string): Promise<CoverageEventDto[]> {
    if (!this.#zones.has(zoneId)) throw new OperationalZoneNotFoundError(zoneId);
    return [...(this.#coverageEvents.get(zoneId) ?? [])].sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt),
    );
  }

  async findOperationalZone(zoneId: string): Promise<OperationalZoneDto | undefined> {
    return this.#zones.get(zoneId);
  }

  async createFieldVisit(zoneId: string, input: CreateFieldVisitInput): Promise<FieldVisitDto> {
    const zone = this.#zones.get(zoneId);
    if (!zone) throw new OperationalZoneNotFoundError(zoneId);
    const duplicate = [...this.#fieldVisits.values()].find(
      (visit) =>
        visit.incidentId === zone.incidentId && visit.clientMutationId === input.clientMutationId,
    );
    if (duplicate) return duplicate;

    const now = new Date().toISOString();
    const visit: FieldVisitDto = {
      ...input,
      id: uuidv7(),
      incidentId: zone.incidentId,
      zoneId,
      status: "in_progress",
      result: null,
      completedAt: null,
      track: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    this.#fieldVisits.set(visit.id, visit);
    await this.addCoverageEvent(zoneId, {
      status: "in_progress",
      occurredAt: input.startedAt,
      visitId: visit.id,
      notes: input.accessNotes,
    });
    return visit;
  }

  async completeFieldVisit(
    visitId: string,
    input: CompleteFieldVisitInput,
  ): Promise<FieldVisitDto> {
    const visit = this.#fieldVisits.get(visitId);
    if (!visit) throw new FieldVisitNotFoundError(visitId);
    if (visit.status === "completed") {
      if (visit.result === input.result) return visit;
      throw new FieldVisitConflictError("La visita ya fue cerrada con un resultado diferente.");
    }
    if (input.completedAt < visit.startedAt) {
      throw new FieldVisitConflictError("La visita no puede finalizar antes de comenzar.");
    }

    const completed: FieldVisitDto = {
      ...visit,
      status: "completed",
      result: input.result,
      completedAt: input.completedAt,
      track: input.track,
      accessNotes: input.accessNotes ?? visit.accessNotes,
      updatedAt: new Date().toISOString(),
      revision: visit.revision + 1,
    };
    this.#fieldVisits.set(visitId, completed);
    const coverageStatus = input.result === "completed" ? "visited" : input.result;
    await this.addCoverageEvent(visit.zoneId, {
      status: coverageStatus,
      occurredAt: input.completedAt,
      visitId,
      notes: completed.accessNotes,
    });
    return completed;
  }

  async listFieldVisits(zoneId: string): Promise<FieldVisitDto[]> {
    if (!this.#zones.has(zoneId)) throw new OperationalZoneNotFoundError(zoneId);
    return [...this.#fieldVisits.values()]
      .filter((visit) => visit.zoneId === zoneId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async #requireIncident(incidentId: string) {
    if (!(await this.incidents.findById(incidentId))) throw new IncidentNotFoundError(incidentId);
  }
}
