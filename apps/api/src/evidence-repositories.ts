import { createHash } from "node:crypto";
import {
  type AssessmentMissionContext,
  type AssessmentRepository,
  EvidenceAssessmentNotFoundError,
  EvidenceIntegrityError,
  type EvidenceRepository,
} from "@pulso/domain";
import type { CreateFieldEvidenceInput, FieldEvidenceDto } from "@pulso/schemas";
import type postgres from "postgres";
import { v7 as uuidv7 } from "uuid";

type DbRow = Record<string, unknown>;
type StoredEvidence = FieldEvidenceDto & { bytes: Uint8Array };

const asIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

const fromRow = (row: DbRow): FieldEvidenceDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  assignmentId: String(row.assignment_id),
  assessmentId: String(row.assessment_id),
  assessmentClientMutationId: String(row.assessment_client_mutation_id),
  zoneId: String(row.zone_id),
  actorId: String(row.actor_id),
  clientMutationId: String(row.client_mutation_id),
  fileName: String(row.file_name),
  contentType: row.content_type as FieldEvidenceDto["contentType"],
  byteSize: Number(row.byte_size),
  sha256: String(row.sha256),
  capturedAt: asIso(row.captured_at),
  status: row.status as FieldEvidenceDto["status"],
  createdAt: asIso(row.created_at),
});

const decodeAndVerify = (input: CreateFieldEvidenceInput) => {
  const bytes = Buffer.from(input.dataBase64, "base64");
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== input.byteSize || hash !== input.sha256) {
    throw new EvidenceIntegrityError("La evidencia no coincide con su huella de integridad.");
  }
  const signatureMatches =
    (input.contentType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (input.contentType === "image/png" && bytes[0] === 0x89 && bytes[1] === 0x50) ||
    (input.contentType === "image/webp" && bytes.subarray(8, 12).toString() === "WEBP");
  if (!signatureMatches) {
    throw new EvidenceIntegrityError("El archivo no corresponde a una imagen permitida.");
  }
  return bytes;
};

export class MemoryEvidenceRepository implements EvidenceRepository {
  readonly #evidence = new Map<string, StoredEvidence>();

  constructor(private readonly assessments: AssessmentRepository) {}

  async create(context: AssessmentMissionContext, input: CreateFieldEvidenceInput) {
    const duplicate = [...this.#evidence.values()].find(
      (item) =>
        item.incidentId === context.incidentId && item.clientMutationId === input.clientMutationId,
    );
    if (duplicate) return this.#public(duplicate);
    const assessment = await this.assessments.findByMutation(
      context.incidentId,
      input.assessmentClientMutationId,
    );
    if (!assessment || assessment.assignmentId !== context.assignmentId) {
      throw new EvidenceAssessmentNotFoundError(input.assessmentClientMutationId);
    }
    const evidence: StoredEvidence = {
      id: uuidv7(),
      incidentId: context.incidentId,
      assignmentId: context.assignmentId,
      assessmentId: assessment.id,
      assessmentClientMutationId: input.assessmentClientMutationId,
      zoneId: context.zoneId,
      actorId: context.actorId,
      clientMutationId: input.clientMutationId,
      fileName: input.fileName,
      contentType: input.contentType,
      byteSize: input.byteSize,
      sha256: input.sha256,
      capturedAt: input.capturedAt,
      status: "stored",
      createdAt: new Date().toISOString(),
      bytes: decodeAndVerify(input),
    };
    this.#evidence.set(evidence.id, evidence);
    return this.#public(evidence);
  }

  async listByAssignment(assignmentId: string) {
    return [...this.#evidence.values()]
      .filter((item) => item.assignmentId === assignmentId)
      .map((item) => this.#public(item));
  }

  #public({ bytes: _bytes, ...evidence }: StoredEvidence): FieldEvidenceDto {
    return evidence;
  }
}

export class PostgresEvidenceRepository implements EvidenceRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async create(context: AssessmentMissionContext, input: CreateFieldEvidenceInput) {
    const bytes = decodeAndVerify(input);
    return this.sql.begin(async (transaction) => {
      const [existing] = await transaction<DbRow[]>`
        SELECT * FROM field_evidence
        WHERE incident_id = ${context.incidentId}
          AND client_mutation_id = ${input.clientMutationId} LIMIT 1
      `;
      if (existing) return fromRow(existing);
      const [assessment] = await transaction<DbRow[]>`
        SELECT id FROM rapid_assessments
        WHERE incident_id = ${context.incidentId}
          AND assignment_id = ${context.assignmentId}
          AND client_mutation_id = ${input.assessmentClientMutationId} LIMIT 1
      `;
      if (!assessment) {
        throw new EvidenceAssessmentNotFoundError(input.assessmentClientMutationId);
      }
      const [row] = await transaction<DbRow[]>`
        INSERT INTO field_evidence (
          id, incident_id, assignment_id, assessment_id, assessment_client_mutation_id,
          zone_id, actor_id, client_mutation_id, file_name, content_type, byte_size,
          sha256, captured_at, content
        ) VALUES (
          ${uuidv7()}, ${context.incidentId}, ${context.assignmentId}, ${String(assessment.id)},
          ${input.assessmentClientMutationId}, ${context.zoneId}, ${context.actorId},
          ${input.clientMutationId}, ${input.fileName}, ${input.contentType}, ${input.byteSize},
          ${input.sha256}, ${input.capturedAt}, ${bytes}
        ) RETURNING *
      `;
      if (!row) throw new Error("PostgreSQL did not return field evidence");
      await transaction`
        INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload)
        VALUES (
          ${uuidv7()}, 'field_evidence', ${String(row.id)}, 'field_evidence.stored',
          ${transaction.json({
            incidentId: context.incidentId,
            assessmentId: String(assessment.id),
            sha256: input.sha256,
            byteSize: input.byteSize,
          })}
        )
      `;
      return fromRow(row);
    });
  }

  async listByAssignment(assignmentId: string) {
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM field_evidence WHERE assignment_id = ${assignmentId}
      ORDER BY captured_at DESC
    `;
    return rows.map(fromRow);
  }
}
