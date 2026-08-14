import type { CreateFieldEvidenceInput, FieldEvidenceDto } from "@pulso/schemas";
import type { AssessmentMissionContext } from "./assessment.js";

export interface EvidenceRepository {
  create(
    context: AssessmentMissionContext,
    input: CreateFieldEvidenceInput,
  ): Promise<FieldEvidenceDto>;
  listByAssignment(assignmentId: string): Promise<FieldEvidenceDto[]>;
}

export class EvidenceIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceIntegrityError";
  }
}

export class EvidenceAssessmentNotFoundError extends Error {
  constructor(clientMutationId: string) {
    super(`Assessment not found for evidence: ${clientMutationId}`);
    this.name = "EvidenceAssessmentNotFoundError";
  }
}
