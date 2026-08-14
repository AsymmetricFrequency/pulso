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

export interface OperationsRepository {
  createOrganization(incidentId: string, input: CreateOrganizationInput): Promise<OrganizationDto>;
  listOrganizations(incidentId: string): Promise<OrganizationDto[]>;
  createActor(incidentId: string, input: CreateActorInput): Promise<ActorDto>;
  listActors(incidentId: string): Promise<ActorDto[]>;
  createTeam(incidentId: string, input: CreateTeamInput): Promise<TeamDto>;
  listTeams(incidentId: string): Promise<TeamDto[]>;
  addTeamMembership(teamId: string, input: CreateTeamMembershipInput): Promise<TeamMembershipDto>;
  listTeamMemberships(teamId: string): Promise<TeamMembershipDto[]>;
  createFieldAssignment(
    incidentId: string,
    input: CreateFieldAssignmentInput,
  ): Promise<FieldAssignmentDto>;
  listFieldAssignments(incidentId: string): Promise<FieldAssignmentDto[]>;
  acceptFieldAssignment(
    assignmentId: string,
    input: AcceptFieldAssignmentInput,
  ): Promise<FieldAssignmentDto>;
}

export class OperationsResourceNotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = "OperationsResourceNotFoundError";
  }
}

export class OperationsConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationsConflictError";
  }
}
