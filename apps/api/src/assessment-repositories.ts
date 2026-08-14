import {
  type AssessmentMissionContext,
  AssessmentNotFoundError,
  type AssessmentRepository,
} from "@pulso/domain";
import type { CreateRapidAssessmentInput, RapidAssessmentDto } from "@pulso/schemas";
import type postgres from "postgres";
import { v7 as uuidv7 } from "uuid";

type DbRow = Record<string, unknown>;

const asIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

const fromRow = (row: DbRow): RapidAssessmentDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  assignmentId: String(row.assignment_id),
  zoneId: String(row.zone_id),
  teamId: String(row.team_id),
  actorId: String(row.actor_id),
  clientMutationId: String(row.client_mutation_id),
  deviceId: String(row.device_id),
  observedAt: asIso(row.observed_at),
  damageTypes: row.damage_types as RapidAssessmentDto["damageTypes"],
  severity: row.severity as RapidAssessmentDto["severity"],
  needTypes: row.need_types as RapidAssessmentDto["needTypes"],
  urgency: row.urgency as RapidAssessmentDto["urgency"],
  affectedHouseholds: Number(row.affected_households),
  affectedPeople: Number(row.affected_people),
  notes: row.notes ? String(row.notes) : null,
  status: row.status as RapidAssessmentDto["status"],
  createdAt: asIso(row.created_at),
  revision: Number(row.revision),
});

export class MemoryAssessmentRepository implements AssessmentRepository {
  readonly #assessments = new Map<string, RapidAssessmentDto>();

  async create(context: AssessmentMissionContext, input: CreateRapidAssessmentInput) {
    const duplicate = [...this.#assessments.values()].find(
      (item) =>
        item.incidentId === context.incidentId && item.clientMutationId === input.clientMutationId,
    );
    if (duplicate) return duplicate;
    const assessment: RapidAssessmentDto = {
      ...input,
      ...context,
      id: uuidv7(),
      status: "recorded",
      createdAt: new Date().toISOString(),
      revision: 1,
    };
    this.#assessments.set(assessment.id, assessment);
    return assessment;
  }

  async listByAssignment(assignmentId: string) {
    return [...this.#assessments.values()]
      .filter((item) => item.assignmentId === assignmentId)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  }
}

export class PostgresAssessmentRepository implements AssessmentRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async create(context: AssessmentMissionContext, input: CreateRapidAssessmentInput) {
    return this.sql.begin(async (transaction) => {
      const [assignment] = await transaction<DbRow[]>`
        SELECT id FROM field_assignments
        WHERE id = ${context.assignmentId} AND incident_id = ${context.incidentId}
          AND zone_id = ${context.zoneId} AND team_id = ${context.teamId}
          AND status IN ('assigned', 'accepted', 'in_progress')
          AND deleted_at IS NULL LIMIT 1
      `;
      if (!assignment) throw new AssessmentNotFoundError(context.assignmentId);
      const [existing] = await transaction<DbRow[]>`
        SELECT * FROM rapid_assessments
        WHERE incident_id = ${context.incidentId}
          AND client_mutation_id = ${input.clientMutationId} LIMIT 1
      `;
      if (existing) return fromRow(existing);
      const [row] = await transaction<DbRow[]>`
        INSERT INTO rapid_assessments (
          id, incident_id, assignment_id, zone_id, team_id, actor_id,
          client_mutation_id, device_id, observed_at, damage_types, severity,
          need_types, urgency, affected_households, affected_people, notes
        ) VALUES (
          ${uuidv7()}, ${context.incidentId}, ${context.assignmentId}, ${context.zoneId},
          ${context.teamId}, ${context.actorId}, ${input.clientMutationId}, ${input.deviceId},
          ${input.observedAt}, ${input.damageTypes}, ${input.severity}, ${input.needTypes},
          ${input.urgency}, ${input.affectedHouseholds}, ${input.affectedPeople}, ${input.notes}
        ) RETURNING *
      `;
      if (!row) throw new Error("PostgreSQL did not return rapid assessment");
      await transaction`
        INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload)
        VALUES (
          ${uuidv7()}, 'rapid_assessment', ${String(row.id)}, 'rapid_assessment.recorded',
          ${transaction.json({
            incidentId: context.incidentId,
            assignmentId: context.assignmentId,
            zoneId: context.zoneId,
            severity: input.severity,
            urgency: input.urgency,
          })}
        )
      `;
      return fromRow(row);
    });
  }

  async listByAssignment(assignmentId: string) {
    const rows = await this.sql<DbRow[]>`
      SELECT * FROM rapid_assessments
      WHERE assignment_id = ${assignmentId} ORDER BY observed_at DESC
    `;
    return rows.map(fromRow);
  }
}
