import {
  IncidentNotFoundError,
  type IncidentRepository,
  OperationsConflictError,
  type OperationsRepository,
  OperationsResourceNotFoundError,
  type TerritoryRepository,
} from "@pulso/domain";
import type {
  AcceptFieldAssignmentInput,
  ActorDto,
  CreateActorInput,
  CreateFieldAssignmentInput,
  CreateOrganizationInput,
  CreateTeamInput,
  CreateTeamMembershipInput,
  FieldAssignmentDto,
  OrganizationDto,
  TeamDto,
  TeamMembershipDto,
} from "@pulso/schemas";
import { v7 as uuidv7 } from "uuid";

export class MemoryOperationsRepository implements OperationsRepository {
  readonly #organizations = new Map<string, OrganizationDto>();
  readonly #actors = new Map<string, ActorDto>();
  readonly #teams = new Map<string, TeamDto>();
  readonly #memberships = new Map<string, TeamMembershipDto>();
  readonly #assignments = new Map<string, FieldAssignmentDto>();
  readonly #assignmentMutations = new Map<string, string>();
  readonly #acceptMutations = new Map<string, string>();

  constructor(
    private readonly incidents: IncidentRepository,
    private readonly territories: TerritoryRepository,
  ) {}

  async createOrganization(
    incidentId: string,
    input: CreateOrganizationInput,
  ): Promise<OrganizationDto> {
    await this.#requireIncident(incidentId);
    if (
      input.externalCode &&
      [...this.#organizations.values()].some(
        (organization) =>
          organization.incidentId === incidentId &&
          organization.externalCode === input.externalCode,
      )
    ) {
      throw new OperationsConflictError("Ya existe una organización con ese código externo.");
    }
    const organization: OrganizationDto = {
      ...input,
      id: uuidv7(),
      incidentId,
      status: "active",
      createdAt: new Date().toISOString(),
      revision: 1,
    };
    this.#organizations.set(organization.id, organization);
    return organization;
  }

  async listOrganizations(incidentId: string): Promise<OrganizationDto[]> {
    await this.#requireIncident(incidentId);
    return [...this.#organizations.values()]
      .filter((organization) => organization.incidentId === incidentId)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  async createActor(incidentId: string, input: CreateActorInput): Promise<ActorDto> {
    await this.#requireIncident(incidentId);
    if (input.organizationId) this.#requireOrganization(input.organizationId, incidentId);
    const actor: ActorDto = {
      ...input,
      id: uuidv7(),
      incidentId,
      status: "active",
      createdAt: new Date().toISOString(),
      revision: 1,
    };
    this.#actors.set(actor.id, actor);
    return actor;
  }

  async listActors(incidentId: string): Promise<ActorDto[]> {
    await this.#requireIncident(incidentId);
    return [...this.#actors.values()]
      .filter((actor) => actor.incidentId === incidentId)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
  }

  async createTeam(incidentId: string, input: CreateTeamInput): Promise<TeamDto> {
    await this.#requireIncident(incidentId);
    this.#requireOrganization(input.organizationId, incidentId);
    const team: TeamDto = {
      ...input,
      id: uuidv7(),
      incidentId,
      status: "active",
      createdAt: new Date().toISOString(),
      revision: 1,
    };
    this.#teams.set(team.id, team);
    return team;
  }

  async listTeams(incidentId: string): Promise<TeamDto[]> {
    await this.#requireIncident(incidentId);
    return [...this.#teams.values()]
      .filter((team) => team.incidentId === incidentId)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  async addTeamMembership(
    teamId: string,
    input: CreateTeamMembershipInput,
  ): Promise<TeamMembershipDto> {
    const team = this.#teams.get(teamId);
    if (!team) throw new OperationsResourceNotFoundError("Team", teamId);
    const actor = this.#actors.get(input.actorId);
    if (!actor) throw new OperationsResourceNotFoundError("Actor", input.actorId);
    if (actor.incidentId !== team.incidentId) {
      throw new OperationsConflictError(
        "El actor y el equipo pertenecen a emergencias diferentes.",
      );
    }
    const existing = [...this.#memberships.values()].find(
      (membership) =>
        membership.teamId === teamId &&
        membership.actorId === input.actorId &&
        membership.status === "active",
    );
    if (existing) return existing;
    const membership: TeamMembershipDto = {
      ...input,
      id: uuidv7(),
      incidentId: team.incidentId,
      teamId,
      status: "active",
      createdAt: new Date().toISOString(),
      revision: 1,
    };
    this.#memberships.set(membership.id, membership);
    return membership;
  }

  async listTeamMemberships(teamId: string): Promise<TeamMembershipDto[]> {
    if (!this.#teams.has(teamId)) throw new OperationsResourceNotFoundError("Team", teamId);
    return [...this.#memberships.values()].filter(
      (membership) => membership.teamId === teamId && membership.status === "active",
    );
  }

  async createFieldAssignment(
    incidentId: string,
    input: CreateFieldAssignmentInput,
  ): Promise<FieldAssignmentDto> {
    await this.#requireIncident(incidentId);
    const existingId = this.#assignmentMutations.get(`${incidentId}:${input.clientMutationId}`);
    if (existingId) {
      const existing = this.#assignments.get(existingId);
      if (existing) return existing;
    }
    const team = this.#teams.get(input.teamId);
    if (!team) throw new OperationsResourceNotFoundError("Team", input.teamId);
    if (team.incidentId !== incidentId) {
      throw new OperationsConflictError("El equipo pertenece a otra emergencia.");
    }
    const zone = await this.territories.findOperationalZone(input.zoneId);
    if (!zone) throw new OperationsResourceNotFoundError("Operational zone", input.zoneId);
    if (zone.incidentId !== incidentId) {
      throw new OperationsConflictError("La zona pertenece a otra emergencia.");
    }

    const now = new Date().toISOString();
    const assignment: FieldAssignmentDto = {
      ...input,
      id: uuidv7(),
      incidentId,
      status: "assigned",
      acceptedBy: null,
      acceptedAt: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    this.#assignments.set(assignment.id, assignment);
    this.#assignmentMutations.set(`${incidentId}:${input.clientMutationId}`, assignment.id);
    await this.territories.addCoverageEvent(input.zoneId, {
      status: "assigned",
      occurredAt: now,
      notes: input.objective,
      visitId: null,
    });
    return assignment;
  }

  async listFieldAssignments(incidentId: string): Promise<FieldAssignmentDto[]> {
    await this.#requireIncident(incidentId);
    return [...this.#assignments.values()]
      .filter((assignment) => assignment.incidentId === incidentId)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  }

  async acceptFieldAssignment(
    assignmentId: string,
    input: AcceptFieldAssignmentInput,
  ): Promise<FieldAssignmentDto> {
    const assignment = this.#assignments.get(assignmentId);
    if (!assignment) throw new OperationsResourceNotFoundError("Field assignment", assignmentId);
    const priorAssignmentId = this.#acceptMutations.get(
      `${assignment.incidentId}:${input.clientMutationId}`,
    );
    if (priorAssignmentId === assignmentId) return assignment;
    if (assignment.status !== "assigned") {
      if (assignment.status === "accepted" && assignment.acceptedBy === input.actorId)
        return assignment;
      throw new OperationsConflictError("La misión ya no está disponible para aceptación.");
    }
    const isMember = [...this.#memberships.values()].some(
      (membership) =>
        membership.teamId === assignment.teamId &&
        membership.actorId === input.actorId &&
        membership.status === "active",
    );
    if (!isMember) {
      throw new OperationsConflictError("El actor no pertenece al equipo asignado.");
    }
    const accepted: FieldAssignmentDto = {
      ...assignment,
      status: "accepted",
      acceptedBy: input.actorId,
      acceptedAt: input.occurredAt,
      updatedAt: new Date().toISOString(),
      revision: assignment.revision + 1,
    };
    this.#assignments.set(assignmentId, accepted);
    this.#acceptMutations.set(`${assignment.incidentId}:${input.clientMutationId}`, assignmentId);
    return accepted;
  }

  async #requireIncident(incidentId: string) {
    if (!(await this.incidents.findById(incidentId))) throw new IncidentNotFoundError(incidentId);
  }

  #requireOrganization(organizationId: string, incidentId: string) {
    const organization = this.#organizations.get(organizationId);
    if (!organization) throw new OperationsResourceNotFoundError("Organization", organizationId);
    if (organization.incidentId !== incidentId) {
      throw new OperationsConflictError("La organización pertenece a otra emergencia.");
    }
  }
}
