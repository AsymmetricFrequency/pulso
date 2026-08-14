import type { CreateRapidAssessmentInput, RapidAssessmentDto } from "@pulso/schemas";

export type AssessmentMissionContext = {
  incidentId: string;
  assignmentId: string;
  zoneId: string;
  teamId: string;
  actorId: string;
};

export interface AssessmentRepository {
  create(
    context: AssessmentMissionContext,
    input: CreateRapidAssessmentInput,
  ): Promise<RapidAssessmentDto>;
  listByAssignment(assignmentId: string): Promise<RapidAssessmentDto[]>;
  findByMutation(
    incidentId: string,
    clientMutationId: string,
  ): Promise<RapidAssessmentDto | undefined>;
}

export class AssessmentNotFoundError extends Error {
  constructor(assignmentId: string) {
    super(`Field assignment not found: ${assignmentId}`);
    this.name = "AssessmentNotFoundError";
  }
}
