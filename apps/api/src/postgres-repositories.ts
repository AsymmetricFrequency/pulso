import {
  FieldVisitConflictError,
  FieldVisitNotFoundError,
  IncidentCodeAlreadyExistsError,
  IncidentNotFoundError,
  type IncidentRepository,
  OperationalZoneNotFoundError,
  OperationsConflictError,
  type OperationsRepository,
  OperationsResourceNotFoundError,
  type TerritoryRepository,
} from "@pulso/domain";
import type {
  AcceptFieldAssignmentInput,
  ActorDto,
  CompleteFieldVisitInput,
  CoverageEventDto,
  CreateActorInput,
  CreateCoverageEventInput,
  CreateFieldAssignmentInput,
  CreateFieldVisitInput,
  CreateIncidentInput,
  CreateOperationalZoneInput,
  CreateOrganizationInput,
  CreateTeamInput,
  CreateTeamMembershipInput,
  FieldAssignmentDto,
  FieldVisitDto,
  IncidentDto,
  OperationalZoneDto,
  OrganizationDto,
  TeamDto,
  TeamMembershipDto,
  TerritoryDto,
  TerritoryImportInput,
  TerritoryImportResult,
} from "@pulso/schemas";
import postgres from "postgres";
import { v7 as uuidv7 } from "uuid";
import { PostgresAssessmentRepository } from "./assessment-repositories.js";
import { PostgresCaliPublicSourceRepository } from "./cali-public-source-repositories.js";
import { PostgresEvidenceRepository } from "./evidence-repositories.js";
import { PostgresMissionAccessRepository } from "./mission-access-repositories.js";
import { PostgresOperationsAccessRepository } from "./operations-access-repositories.js";
import { PostgresAidTraceabilityRepository } from "./postgres-aid-traceability-repository.js";
import { PostgresCensusCoverageRepository } from "./postgres-census-coverage-repository.js";
import { PostgresCommunityReportRepository } from "./postgres-community-report-repository.js";
import { PostgresHouseholdRegistryRepository } from "./postgres-household-registry-repository.js";
import { PostgresIdentityTrustRepository } from "./postgres-identity-trust-repository.js";
import { PostgresMaterialSupplierRepository } from "./postgres-material-supplier-repository.js";
import { PostgresPublicFundsRepository } from "./postgres-public-funds-repository.js";
import { PostgresPublicReportRepository } from "./postgres-public-report-repository.js";
import { PostgresReconstructionProgressRepository } from "./postgres-reconstruction-progress-repository.js";
import { PostgresSeismicShakingRepository } from "./postgres-seismic-shaking-repository.js";
import { PostgresWorkforceProfileRepository } from "./postgres-workforce-profile-repository.js";
import { PostgresSgcPublicSourceRepository } from "./sgc-public-source-repositories.js";

type DbRow = Record<string, unknown>;

const asIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

const asGeometry = <T>(value: unknown): T =>
  (typeof value === "string" ? JSON.parse(value) : value) as T;

const incidentFromRow = (row: DbRow): IncidentDto => ({
  id: String(row.id),
  code: String(row.code),
  name: String(row.name),
  disasterType: row.disaster_type as IncidentDto["disasterType"],
  countryCode: String(row.country_code),
  timezone: String(row.timezone),
  startedAt: asIso(row.started_at),
  status: row.status as IncidentDto["status"],
  revision: Number(row.revision),
  createdAt: asIso(row.created_at),
  updatedAt: asIso(row.updated_at),
});

const territoryFromRow = (row: DbRow): TerritoryDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  parentId: row.parent_id ? String(row.parent_id) : null,
  externalCode: row.external_code ? String(row.external_code) : null,
  type: row.territory_type as TerritoryDto["type"],
  name: String(row.name),
  geometry: asGeometry<TerritoryDto["geometry"]>(row.geometry),
  accessStatus: row.access_status as TerritoryDto["accessStatus"],
  revision: Number(row.revision),
  createdAt: asIso(row.created_at),
});

const zoneFromRow = (row: DbRow): OperationalZoneDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  territoryId: row.territory_id ? String(row.territory_id) : null,
  name: String(row.name),
  geometry: asGeometry<OperationalZoneDto["geometry"]>(row.geometry),
  priority: Number(row.priority),
  status: row.status as OperationalZoneDto["status"],
  coverageStatus: row.coverage_status as OperationalZoneDto["coverageStatus"],
  revision: Number(row.revision),
  createdAt: asIso(row.created_at),
});

const coverageFromRow = (row: DbRow): CoverageEventDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  zoneId: String(row.zone_id),
  visitId: row.visit_id ? String(row.visit_id) : null,
  status: row.status as CoverageEventDto["status"],
  occurredAt: asIso(row.occurred_at),
  recordedAt: asIso(row.recorded_at),
  notes: row.notes ? String(row.notes) : null,
});

const visitFromRow = (row: DbRow): FieldVisitDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  zoneId: String(row.zone_id),
  teamId: row.team_id ? String(row.team_id) : null,
  deviceId: String(row.device_id),
  clientMutationId: String(row.client_mutation_id),
  startedAt: asIso(row.started_at),
  status: row.status as FieldVisitDto["status"],
  result: row.result ? (row.result as FieldVisitDto["result"]) : null,
  completedAt: row.completed_at ? asIso(row.completed_at) : null,
  track: row.track ? asGeometry<FieldVisitDto["track"]>(row.track) : null,
  accessNotes: row.access_notes ? String(row.access_notes) : null,
  revision: Number(row.revision),
  createdAt: asIso(row.created_at),
  updatedAt: asIso(row.updated_at),
});

const organizationFromRow = (row: DbRow): OrganizationDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  name: String(row.name),
  type: row.organization_type as OrganizationDto["type"],
  externalCode: row.external_code ? String(row.external_code) : null,
  status: row.status as OrganizationDto["status"],
  createdAt: asIso(row.created_at),
  revision: Number(row.revision),
});

const actorFromRow = (row: DbRow): ActorDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  organizationId: row.organization_id ? String(row.organization_id) : null,
  displayName: String(row.display_name),
  role: row.actor_role as ActorDto["role"],
  externalSubject: row.external_subject ? String(row.external_subject) : null,
  status: row.status as ActorDto["status"],
  createdAt: asIso(row.created_at),
  revision: Number(row.revision),
});

const teamFromRow = (row: DbRow): TeamDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  organizationId: String(row.organization_id),
  name: String(row.name),
  status: row.status as TeamDto["status"],
  createdAt: asIso(row.created_at),
  revision: Number(row.revision),
});

const membershipFromRow = (row: DbRow): TeamMembershipDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  teamId: String(row.team_id),
  actorId: String(row.actor_id),
  responsibility: row.responsibility as TeamMembershipDto["responsibility"],
  status: row.status as TeamMembershipDto["status"],
  createdAt: asIso(row.created_at),
  revision: Number(row.revision),
});

const assignmentFromRow = (row: DbRow): FieldAssignmentDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  zoneId: String(row.zone_id),
  teamId: String(row.team_id),
  objective: String(row.objective),
  startsAt: asIso(row.starts_at),
  dueAt: row.due_at ? asIso(row.due_at) : null,
  clientMutationId: String(row.client_mutation_id),
  status: row.status as FieldAssignmentDto["status"],
  acceptedBy: row.accepted_by ? String(row.accepted_by) : null,
  acceptedAt: row.accepted_at ? asIso(row.accepted_at) : null,
  createdAt: asIso(row.created_at),
  updatedAt: asIso(row.updated_at),
  revision: Number(row.revision),
});

class PostgresIncidentRepository implements IncidentRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async create(input: CreateIncidentInput): Promise<IncidentDto> {
    try {
      const [row] = await this.sql<DbRow[]>`
        INSERT INTO incidents (
          id, code, name, disaster_type, country_code, timezone, started_at
        ) VALUES (
          ${uuidv7()}, ${input.code}, ${input.name}, ${input.disasterType},
          ${input.countryCode}, ${input.timezone}, ${input.startedAt}
        )
        RETURNING *
      `;
      if (!row) throw new Error("PostgreSQL did not return the created incident");
      return incidentFromRow(row);
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new IncidentCodeAlreadyExistsError(input.code);
      }
      throw error;
    }
  }

  async findByCode(code: string): Promise<IncidentDto | undefined> {
    const [row] = await this.sql<DbRow[]>`
      SELECT * FROM incidents WHERE code = ${code} AND deleted_at IS NULL LIMIT 1
    `;
    return row ? incidentFromRow(row) : undefined;
  }

  async findById(id: string): Promise<IncidentDto | undefined> {
    const [row] = await this.sql<DbRow[]>`
      SELECT * FROM incidents WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
    `;
    return row ? incidentFromRow(row) : undefined;
  }

  async list(): Promise<IncidentDto[]> {
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM incidents WHERE deleted_at IS NULL ORDER BY started_at DESC
    `;
    return rows.map(incidentFromRow);
  }
}

class PostgresTerritoryRepository implements TerritoryRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async importTerritories(
    incidentId: string,
    input: TerritoryImportInput,
  ): Promise<TerritoryImportResult> {
    await this.#requireIncident(incidentId);
    let imported = 0;
    let skipped = 0;
    await this.sql.begin(async (transaction) => {
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
        const rows = await transaction<DbRow[]>`
          INSERT INTO territories (
            id, incident_id, parent_id, external_code, territory_type, name, geometry
          ) VALUES (
            ${uuidv7()}, ${incidentId}, ${input.parentId}, ${String(rawCode)},
            ${input.territoryType}, ${rawName.trim()},
            ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(feature.geometry)}), 4326)
          )
          ON CONFLICT (incident_id, territory_type, external_code)
            WHERE deleted_at IS NULL AND external_code IS NOT NULL
          DO NOTHING
          RETURNING id
        `;
        if (rows.length === 1) imported += 1;
        else skipped += 1;
      }
    });
    return { imported, skipped, source: input.source };
  }

  async listTerritories(incidentId: string): Promise<TerritoryDto[]> {
    await this.#requireIncident(incidentId);
    const rows = await this.sql<DbRow[]>`
      SELECT *, ST_AsGeoJSON(geometry)::json AS geometry
      FROM territories
      WHERE incident_id = ${incidentId} AND deleted_at IS NULL
      ORDER BY name
    `;
    return rows.map(territoryFromRow);
  }

  async createOperationalZone(
    incidentId: string,
    input: CreateOperationalZoneInput,
  ): Promise<OperationalZoneDto> {
    await this.#requireIncident(incidentId);
    const [row] = await this.sql<DbRow[]>`
      INSERT INTO operational_zones (
        id, incident_id, territory_id, name, geometry, priority
      ) VALUES (
        ${uuidv7()}, ${incidentId}, ${input.territoryId}, ${input.name},
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(input.geometry)}), 4326), ${input.priority}
      )
      RETURNING *, ST_AsGeoJSON(geometry)::json AS geometry
    `;
    if (!row) throw new Error("PostgreSQL did not return the created operational zone");
    return zoneFromRow(row);
  }

  async listOperationalZones(incidentId: string): Promise<OperationalZoneDto[]> {
    await this.#requireIncident(incidentId);
    const rows = await this.sql<DbRow[]>`
      SELECT *, ST_AsGeoJSON(geometry)::json AS geometry
      FROM operational_zones
      WHERE incident_id = ${incidentId} AND deleted_at IS NULL
      ORDER BY priority DESC, name
    `;
    return rows.map(zoneFromRow);
  }

  async findOperationalZone(zoneId: string): Promise<OperationalZoneDto | undefined> {
    const [row] = await this.sql<DbRow[]>`
      SELECT *, ST_AsGeoJSON(geometry)::json AS geometry
      FROM operational_zones WHERE id = ${zoneId} AND deleted_at IS NULL LIMIT 1
    `;
    return row ? zoneFromRow(row) : undefined;
  }

  async addCoverageEvent(
    zoneId: string,
    input: CreateCoverageEventInput,
  ): Promise<CoverageEventDto> {
    return this.sql.begin(async (transaction) => {
      const [zone] = await transaction<DbRow[]>`
        SELECT incident_id FROM operational_zones
        WHERE id = ${zoneId} AND deleted_at IS NULL FOR UPDATE
      `;
      if (!zone) throw new OperationalZoneNotFoundError(zoneId);
      const [event] = await transaction<DbRow[]>`
        INSERT INTO coverage_events (
          id, incident_id, zone_id, visit_id, status, occurred_at, notes
        ) VALUES (
          ${uuidv7()}, ${String(zone.incident_id)}, ${zoneId}, ${input.visitId},
          ${input.status}, ${input.occurredAt}, ${input.notes}
        ) RETURNING *
      `;
      await transaction`
        UPDATE operational_zones
        SET coverage_status = ${input.status}, revision = revision + 1, updated_at = now()
        WHERE id = ${zoneId}
      `;
      if (!event) throw new Error("PostgreSQL did not return the coverage event");
      return coverageFromRow(event);
    });
  }

  async listCoverageEvents(zoneId: string): Promise<CoverageEventDto[]> {
    if (!(await this.findOperationalZone(zoneId))) throw new OperationalZoneNotFoundError(zoneId);
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM coverage_events WHERE zone_id = ${zoneId} ORDER BY occurred_at
    `;
    return rows.map(coverageFromRow);
  }

  async createFieldVisit(zoneId: string, input: CreateFieldVisitInput): Promise<FieldVisitDto> {
    return this.sql.begin(async (transaction) => {
      const [zone] = await transaction<DbRow[]>`
        SELECT incident_id FROM operational_zones
        WHERE id = ${zoneId} AND deleted_at IS NULL FOR UPDATE
      `;
      if (!zone) throw new OperationalZoneNotFoundError(zoneId);
      const incidentId = String(zone.incident_id);
      const [existing] = await transaction<DbRow[]>`
        SELECT *, ST_AsGeoJSON(track)::json AS track FROM field_visits
        WHERE incident_id = ${incidentId} AND client_mutation_id = ${input.clientMutationId}
        LIMIT 1
      `;
      if (existing) return visitFromRow(existing);

      const visitId = uuidv7();
      const [visit] = await transaction<DbRow[]>`
        INSERT INTO field_visits (
          id, incident_id, zone_id, team_id, device_id, client_mutation_id,
          started_at, status, result, access_notes
        ) VALUES (
          ${visitId}, ${incidentId}, ${zoneId}, ${input.teamId}, ${input.deviceId},
          ${input.clientMutationId}, ${input.startedAt}, 'in_progress', NULL, ${input.accessNotes}
        ) RETURNING *, ST_AsGeoJSON(track)::json AS track
      `;
      await transaction`
        INSERT INTO coverage_events (
          id, incident_id, zone_id, visit_id, status, occurred_at, notes, idempotency_key
        ) VALUES (
          ${uuidv7()}, ${incidentId}, ${zoneId}, ${visitId}, 'in_progress',
          ${input.startedAt}, ${input.accessNotes}, ${input.clientMutationId}
        )
      `;
      await transaction`
        UPDATE operational_zones
        SET coverage_status = 'in_progress', revision = revision + 1, updated_at = now()
        WHERE id = ${zoneId}
      `;
      if (!visit) throw new Error("PostgreSQL did not return the created field visit");
      return visitFromRow(visit);
    });
  }

  async completeFieldVisit(
    visitId: string,
    input: CompleteFieldVisitInput,
  ): Promise<FieldVisitDto> {
    return this.sql.begin(async (transaction) => {
      const [current] = await transaction<DbRow[]>`
        SELECT *, ST_AsGeoJSON(track)::json AS track FROM field_visits
        WHERE id = ${visitId} FOR UPDATE
      `;
      if (!current) throw new FieldVisitNotFoundError(visitId);
      const existing = visitFromRow(current);
      if (existing.status === "completed") {
        if (existing.result === input.result) return existing;
        throw new FieldVisitConflictError("La visita ya fue cerrada con un resultado diferente.");
      }
      if (input.completedAt < existing.startedAt) {
        throw new FieldVisitConflictError("La visita no puede finalizar antes de comenzar.");
      }
      const coverageStatus = input.result === "completed" ? "visited" : input.result;
      const track = input.track ? JSON.stringify(input.track) : null;
      const [completed] = await transaction<DbRow[]>`
        UPDATE field_visits SET
          status = 'completed', result = ${input.result}, completed_at = ${input.completedAt},
          track = CASE WHEN ${track}::text IS NULL THEN NULL
            ELSE ST_SetSRID(ST_GeomFromGeoJSON(${track}), 4326) END,
          access_notes = COALESCE(${input.accessNotes}, access_notes),
          revision = revision + 1, updated_at = now()
        WHERE id = ${visitId}
        RETURNING *, ST_AsGeoJSON(track)::json AS track
      `;
      await transaction`
        INSERT INTO coverage_events (
          id, incident_id, zone_id, visit_id, status, occurred_at, notes, idempotency_key
        ) VALUES (
          ${uuidv7()}, ${existing.incidentId}, ${existing.zoneId}, ${visitId},
          ${coverageStatus}, ${input.completedAt}, ${input.accessNotes}, ${input.clientMutationId}
        ) ON CONFLICT (incident_id, idempotency_key)
          WHERE idempotency_key IS NOT NULL DO NOTHING
      `;
      await transaction`
        UPDATE operational_zones SET
          coverage_status = ${coverageStatus}, revision = revision + 1, updated_at = now()
        WHERE id = ${existing.zoneId}
      `;
      if (!completed) throw new Error("PostgreSQL did not return the completed field visit");
      return visitFromRow(completed);
    });
  }

  async listFieldVisits(zoneId: string): Promise<FieldVisitDto[]> {
    if (!(await this.findOperationalZone(zoneId))) throw new OperationalZoneNotFoundError(zoneId);
    const rows = await this.sql<DbRow[]>`
      SELECT *, ST_AsGeoJSON(track)::json AS track
      FROM field_visits WHERE zone_id = ${zoneId} ORDER BY started_at DESC
    `;
    return rows.map(visitFromRow);
  }

  async #requireIncident(incidentId: string) {
    const [row] = await this.sql<DbRow[]>`
      SELECT id FROM incidents WHERE id = ${incidentId} AND deleted_at IS NULL LIMIT 1
    `;
    if (!row) throw new IncidentNotFoundError(incidentId);
  }
}

class PostgresOperationsRepository implements OperationsRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async createOrganization(
    incidentId: string,
    input: CreateOrganizationInput,
  ): Promise<OrganizationDto> {
    await this.#requireIncident(incidentId);
    try {
      const [row] = await this.sql<DbRow[]>`
        INSERT INTO organizations (
          id, incident_id, name, organization_type, external_code
        ) VALUES (
          ${uuidv7()}, ${incidentId}, ${input.name}, ${input.type}, ${input.externalCode}
        ) RETURNING *
      `;
      if (!row) throw new Error("PostgreSQL did not return the created organization");
      return organizationFromRow(row);
    } catch (error: unknown) {
      this.#translateConflict(error, "Ya existe una organización con esos datos.");
    }
  }

  async listOrganizations(incidentId: string): Promise<OrganizationDto[]> {
    await this.#requireIncident(incidentId);
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM organizations
      WHERE incident_id = ${incidentId} AND deleted_at IS NULL ORDER BY name
    `;
    return rows.map(organizationFromRow);
  }

  async createActor(incidentId: string, input: CreateActorInput): Promise<ActorDto> {
    await this.#requireIncident(incidentId);
    if (input.organizationId) {
      await this.#requireScoped("organizations", input.organizationId, incidentId, "Organization");
    }
    try {
      const [row] = await this.sql<DbRow[]>`
        INSERT INTO actors (
          id, incident_id, organization_id, display_name, actor_role, external_subject
        ) VALUES (
          ${uuidv7()}, ${incidentId}, ${input.organizationId}, ${input.displayName},
          ${input.role}, ${input.externalSubject}
        ) RETURNING *
      `;
      if (!row) throw new Error("PostgreSQL did not return the created actor");
      return actorFromRow(row);
    } catch (error: unknown) {
      this.#translateConflict(error, "Ya existe un actor vinculado a esa identidad externa.");
    }
  }

  async listActors(incidentId: string): Promise<ActorDto[]> {
    await this.#requireIncident(incidentId);
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM actors
      WHERE incident_id = ${incidentId} AND deleted_at IS NULL ORDER BY display_name
    `;
    return rows.map(actorFromRow);
  }

  async findActor(actorId: string): Promise<ActorDto | undefined> {
    const [row] = await this.sql<DbRow[]>`
      SELECT * FROM actors WHERE id = ${actorId} AND deleted_at IS NULL LIMIT 1
    `;
    return row ? actorFromRow(row) : undefined;
  }

  async createTeam(incidentId: string, input: CreateTeamInput): Promise<TeamDto> {
    await this.#requireIncident(incidentId);
    await this.#requireScoped("organizations", input.organizationId, incidentId, "Organization");
    try {
      const [row] = await this.sql<DbRow[]>`
        INSERT INTO teams (id, incident_id, organization_id, name)
        VALUES (${uuidv7()}, ${incidentId}, ${input.organizationId}, ${input.name})
        RETURNING *
      `;
      if (!row) throw new Error("PostgreSQL did not return the created team");
      return teamFromRow(row);
    } catch (error: unknown) {
      this.#translateConflict(error, "Ya existe un equipo con ese nombre en la emergencia.");
    }
  }

  async listTeams(incidentId: string): Promise<TeamDto[]> {
    await this.#requireIncident(incidentId);
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM teams
      WHERE incident_id = ${incidentId} AND deleted_at IS NULL ORDER BY name
    `;
    return rows.map(teamFromRow);
  }

  async findTeam(teamId: string): Promise<TeamDto | undefined> {
    const [row] = await this.sql<DbRow[]>`
      SELECT * FROM teams WHERE id = ${teamId} AND deleted_at IS NULL LIMIT 1
    `;
    return row ? teamFromRow(row) : undefined;
  }

  async addTeamMembership(
    teamId: string,
    input: CreateTeamMembershipInput,
  ): Promise<TeamMembershipDto> {
    const [team] = await this.sql<DbRow[]>`
      SELECT incident_id FROM teams WHERE id = ${teamId} AND deleted_at IS NULL LIMIT 1
    `;
    if (!team) throw new OperationsResourceNotFoundError("Team", teamId);
    const incidentId = String(team.incident_id);
    await this.#requireScoped("actors", input.actorId, incidentId, "Actor");
    const [existing] = await this.sql<DbRow[]>`
      SELECT * FROM team_memberships
      WHERE team_id = ${teamId} AND actor_id = ${input.actorId} AND status = 'active' LIMIT 1
    `;
    if (existing) return membershipFromRow(existing);
    const [row] = await this.sql<DbRow[]>`
      INSERT INTO team_memberships (
        id, incident_id, team_id, actor_id, responsibility
      ) VALUES (
        ${uuidv7()}, ${incidentId}, ${teamId}, ${input.actorId}, ${input.responsibility}
      ) RETURNING *
    `;
    if (!row) throw new Error("PostgreSQL did not return the created membership");
    return membershipFromRow(row);
  }

  async listTeamMemberships(teamId: string): Promise<TeamMembershipDto[]> {
    const [team] = await this.sql<DbRow[]>`
      SELECT id FROM teams WHERE id = ${teamId} AND deleted_at IS NULL LIMIT 1
    `;
    if (!team) throw new OperationsResourceNotFoundError("Team", teamId);
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM team_memberships
      WHERE team_id = ${teamId} AND status = 'active' ORDER BY created_at
    `;
    return rows.map(membershipFromRow);
  }

  async createFieldAssignment(
    incidentId: string,
    input: CreateFieldAssignmentInput,
  ): Promise<FieldAssignmentDto> {
    await this.#requireIncident(incidentId);
    return this.sql.begin(async (transaction) => {
      const [existing] = await transaction<DbRow[]>`
        SELECT * FROM field_assignments
        WHERE incident_id = ${incidentId} AND client_mutation_id = ${input.clientMutationId}
        LIMIT 1
      `;
      if (existing) return assignmentFromRow(existing);
      const [team] = await transaction<DbRow[]>`
        SELECT id FROM teams
        WHERE id = ${input.teamId} AND incident_id = ${incidentId}
          AND status = 'active' AND deleted_at IS NULL LIMIT 1
      `;
      if (!team) throw new OperationsResourceNotFoundError("Team", input.teamId);
      const [zone] = await transaction<DbRow[]>`
        SELECT id FROM operational_zones
        WHERE id = ${input.zoneId} AND incident_id = ${incidentId}
          AND deleted_at IS NULL FOR UPDATE
      `;
      if (!zone) throw new OperationsResourceNotFoundError("Operational zone", input.zoneId);
      const assignmentId = uuidv7();
      const now = new Date().toISOString();
      const [assignment] = await transaction<DbRow[]>`
        INSERT INTO field_assignments (
          id, incident_id, zone_id, team_id, objective, starts_at, due_at, client_mutation_id
        ) VALUES (
          ${assignmentId}, ${incidentId}, ${input.zoneId}, ${input.teamId}, ${input.objective},
          ${input.startsAt}, ${input.dueAt}, ${input.clientMutationId}
        ) RETURNING *
      `;
      await transaction`
        INSERT INTO coverage_events (
          id, incident_id, zone_id, status, occurred_at, notes, idempotency_key
        ) VALUES (
          ${uuidv7()}, ${incidentId}, ${input.zoneId}, 'assigned', ${now},
          ${input.objective}, ${input.clientMutationId}
        )
      `;
      await transaction`
        UPDATE operational_zones
        SET coverage_status = 'assigned', revision = revision + 1, updated_at = now()
        WHERE id = ${input.zoneId}
      `;
      await transaction`
        INSERT INTO outbox_events (
          id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES (
          ${uuidv7()}, 'field_assignment', ${assignmentId}, 'field_assignment.created',
          ${transaction.json({ incidentId, zoneId: input.zoneId, teamId: input.teamId })}
        )
      `;
      if (!assignment) throw new Error("PostgreSQL did not return the created assignment");
      return assignmentFromRow(assignment);
    });
  }

  async listFieldAssignments(incidentId: string): Promise<FieldAssignmentDto[]> {
    await this.#requireIncident(incidentId);
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM field_assignments
      WHERE incident_id = ${incidentId} AND deleted_at IS NULL ORDER BY starts_at DESC
    `;
    return rows.map(assignmentFromRow);
  }

  async findFieldAssignment(assignmentId: string): Promise<FieldAssignmentDto | undefined> {
    const [row] = await this.sql<DbRow[]>`
      SELECT * FROM field_assignments WHERE id = ${assignmentId} AND deleted_at IS NULL LIMIT 1
    `;
    return row ? assignmentFromRow(row) : undefined;
  }

  async acceptFieldAssignment(
    assignmentId: string,
    input: AcceptFieldAssignmentInput,
  ): Promise<FieldAssignmentDto> {
    return this.sql.begin(async (transaction) => {
      const [assignmentRow] = await transaction<DbRow[]>`
        SELECT * FROM field_assignments WHERE id = ${assignmentId} AND deleted_at IS NULL FOR UPDATE
      `;
      if (!assignmentRow) {
        throw new OperationsResourceNotFoundError("Field assignment", assignmentId);
      }
      const assignment = assignmentFromRow(assignmentRow);
      if (assignment.status === "accepted" && assignment.acceptedBy === input.actorId) {
        return assignment;
      }
      if (assignment.status !== "assigned") {
        throw new OperationsConflictError("La misión ya no está disponible para aceptación.");
      }
      const [member] = await transaction<DbRow[]>`
        SELECT id FROM team_memberships
        WHERE team_id = ${assignment.teamId} AND actor_id = ${input.actorId}
          AND incident_id = ${assignment.incidentId} AND status = 'active' LIMIT 1
      `;
      if (!member) throw new OperationsConflictError("El actor no pertenece al equipo asignado.");
      const [accepted] = await transaction<DbRow[]>`
        UPDATE field_assignments SET
          status = 'accepted', accepted_by = ${input.actorId}, accepted_at = ${input.occurredAt},
          accept_client_mutation_id = ${input.clientMutationId},
          revision = revision + 1, updated_at = now()
        WHERE id = ${assignmentId} RETURNING *
      `;
      await transaction`
        INSERT INTO outbox_events (
          id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES (
          ${uuidv7()}, 'field_assignment', ${assignmentId}, 'field_assignment.accepted',
          ${transaction.json({ actorId: input.actorId, occurredAt: input.occurredAt })}
        )
      `;
      if (!accepted) throw new Error("PostgreSQL did not return the accepted assignment");
      return assignmentFromRow(accepted);
    });
  }

  async #requireIncident(incidentId: string) {
    const [row] = await this.sql<DbRow[]>`
      SELECT id FROM incidents WHERE id = ${incidentId} AND deleted_at IS NULL LIMIT 1
    `;
    if (!row) throw new IncidentNotFoundError(incidentId);
  }

  async #requireScoped(
    table: "organizations" | "actors",
    id: string,
    incidentId: string,
    label: string,
  ) {
    const rows = await this.sql.unsafe<DbRow[]>(
      `SELECT id FROM ${table} WHERE id = $1 AND incident_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [id, incidentId],
    );
    if (!rows[0]) throw new OperationsResourceNotFoundError(label, id);
  }

  #translateConflict(error: unknown, message: string): never {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new OperationsConflictError(message);
    }
    throw error;
  }
}

export function createPostgresRepositories(
  databaseUrl: string,
  missionInvitationSecret: string,
  identityFingerprintSecret = missionInvitationSecret,
  /**
   * Clave con la que se cifran los datos personales del censo comunitario. Propia y no prestada:
   * una fuga en el sistema de invitaciones no puede llevarse por delante los nombres y teléfonos
   * de familias que perdieron su casa.
   */
  piiEncryptionKey = missionInvitationSecret,
) {
  const sql = postgres(databaseUrl, { max: 10, idle_timeout: 20, connect_timeout: 10 });
  return {
    assessments: new PostgresAssessmentRepository(sql),
    communityReports: new PostgresCommunityReportRepository(sql, identityFingerprintSecret),
    evidence: new PostgresEvidenceRepository(sql),
    identityTrust: new PostgresIdentityTrustRepository(identityFingerprintSecret, sql),
    incidents: new PostgresIncidentRepository(sql),
    materialSuppliers: new PostgresMaterialSupplierRepository(sql),
    missionAccess: new PostgresMissionAccessRepository(missionInvitationSecret, sql),
    operationsAccess: new PostgresOperationsAccessRepository(missionInvitationSecret, sql),
    operations: new PostgresOperationsRepository(sql),
    publicReports: new PostgresPublicReportRepository(sql),
    caliPublicSource: new PostgresCaliPublicSourceRepository(sql),
    publicFunds: new PostgresPublicFundsRepository(sql),
    seismicShaking: new PostgresSeismicShakingRepository(sql),
    censusCoverage: new PostgresCensusCoverageRepository(sql),
    aidTraceability: new PostgresAidTraceabilityRepository(sql),
    householdRegistry: new PostgresHouseholdRegistryRepository(sql, {
      // **Clave propia, no prestada.**
      //
      // Antes esto derivaba del secreto de invitaciones de misión, que es de otro sistema
      // completamente. `deriveKey` separa por propósito, así que no había colisión criptográfica —
      // pero compartir el secreto de origen significa que una fuga en el sistema de invitaciones
      // se lleva por delante los nombres y teléfonos de familias que perdieron su casa. Dos cosas
      // sin ninguna relación no deben caer juntas.
      //
      // La caída al secreto viejo existe para que un despliegue sin la variable nueva no deje de
      // funcionar, y se anuncia en el arranque para que no pase inadvertida.
      fieldSecret: piiEncryptionKey,
      fingerprintSecret: identityFingerprintSecret,
    }),
    reconstructionProgress: new PostgresReconstructionProgressRepository(sql),
    sgcPublicSource: new PostgresSgcPublicSourceRepository(sql),
    territories: new PostgresTerritoryRepository(sql),
    workforceProfiles: new PostgresWorkforceProfileRepository(identityFingerprintSecret, sql),
    close: () => sql.end({ timeout: 5 }),
  };
}
