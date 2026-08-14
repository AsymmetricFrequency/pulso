import {
  type AssessmentMissionContext,
  AssessmentNotFoundError,
  type AssessmentRepository,
  type TerritoryRepository,
} from "@pulso/domain";
import type {
  AssessmentSummaryDto,
  CreateRapidAssessmentInput,
  RapidAssessmentDto,
} from "@pulso/schemas";
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

const summarize = (
  incidentId: string,
  items: Array<{ assessment: RapidAssessmentDto; zoneName: string }>,
): AssessmentSummaryDto => {
  const severity = { low: 0, medium: 0, high: 0, critical: 0 };
  const urgency = { routine: 0, priority: 0, urgent: 0, immediate: 0 };
  const damages = new Map<string, number>();
  const needs = new Map<string, number>();
  const zones = new Map<string, AssessmentSummaryDto["zones"][number]>();
  let affectedHouseholds = 0;
  let affectedPeople = 0;
  for (const { assessment, zoneName } of items) {
    severity[assessment.severity] += 1;
    urgency[assessment.urgency] += 1;
    affectedHouseholds += assessment.affectedHouseholds;
    affectedPeople += assessment.affectedPeople;
    for (const type of assessment.damageTypes) damages.set(type, (damages.get(type) ?? 0) + 1);
    for (const type of assessment.needTypes) needs.set(type, (needs.get(type) ?? 0) + 1);
    const zone = zones.get(assessment.zoneId) ?? {
      zoneId: assessment.zoneId,
      zoneName,
      assessments: 0,
      critical: 0,
      urgent: 0,
      affectedPeople: 0,
      lastObservedAt: assessment.observedAt,
    };
    zone.assessments += 1;
    zone.critical += assessment.severity === "critical" ? 1 : 0;
    zone.urgent += ["urgent", "immediate"].includes(assessment.urgency) ? 1 : 0;
    zone.affectedPeople += assessment.affectedPeople;
    if (assessment.observedAt > zone.lastObservedAt) zone.lastObservedAt = assessment.observedAt;
    zones.set(assessment.zoneId, zone);
  }
  const ranked = (values: Map<string, number>) =>
    [...values].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  return {
    incidentId,
    totalAssessments: items.length,
    affectedHouseholds,
    affectedPeople,
    severity,
    urgency,
    damages: ranked(damages) as AssessmentSummaryDto["damages"],
    needs: ranked(needs) as AssessmentSummaryDto["needs"],
    zones: [...zones.values()].sort(
      (a, b) => b.critical - a.critical || b.urgent - a.urgent || b.assessments - a.assessments,
    ),
    calculatedAt: new Date().toISOString(),
  };
};

export class MemoryAssessmentRepository implements AssessmentRepository {
  readonly #assessments = new Map<string, RapidAssessmentDto>();

  constructor(private readonly territories?: TerritoryRepository) {}

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

  async findByMutation(incidentId: string, clientMutationId: string) {
    return [...this.#assessments.values()].find(
      (item) => item.incidentId === incidentId && item.clientMutationId === clientMutationId,
    );
  }

  async summarizeAssignment(incidentId: string, assignmentId: string) {
    const assessments = [...this.#assessments.values()].filter(
      (item) => item.incidentId === incidentId && item.assignmentId === assignmentId,
    );
    const items = await Promise.all(
      assessments.map(async (assessment) => ({
        assessment,
        zoneName:
          (await this.territories?.findOperationalZone(assessment.zoneId))?.name ??
          "Zona operativa",
      })),
    );
    return summarize(incidentId, items);
  }

  async summarizeIncident(incidentId: string) {
    const assessments = [...this.#assessments.values()].filter(
      (item) => item.incidentId === incidentId && item.status !== "duplicate",
    );
    const items = await Promise.all(
      assessments.map(async (assessment) => ({
        assessment,
        zoneName:
          (await this.territories?.findOperationalZone(assessment.zoneId))?.name ??
          "Zona operativa",
      })),
    );
    return summarize(incidentId, items);
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

  async findByMutation(incidentId: string, clientMutationId: string) {
    const [row] = await this.sql<DbRow[]>`
      SELECT * FROM rapid_assessments
      WHERE incident_id = ${incidentId} AND client_mutation_id = ${clientMutationId} LIMIT 1
    `;
    return row ? fromRow(row) : undefined;
  }

  async summarizeAssignment(incidentId: string, assignmentId: string) {
    const rows = await this.sql<DbRow[]>`
      SELECT ra.*, oz.name AS zone_name FROM rapid_assessments ra
      JOIN operational_zones oz ON oz.id = ra.zone_id
      WHERE ra.incident_id = ${incidentId} AND ra.assignment_id = ${assignmentId}
        AND ra.status <> 'duplicate'
      ORDER BY ra.observed_at DESC
    `;
    return summarize(
      incidentId,
      rows.map((row) => ({ assessment: fromRow(row), zoneName: String(row.zone_name) })),
    );
  }

  async summarizeIncident(incidentId: string) {
    const rows = await this.sql<DbRow[]>`
      SELECT ra.*, oz.name AS zone_name FROM rapid_assessments ra
      JOIN operational_zones oz ON oz.id = ra.zone_id
      WHERE ra.incident_id = ${incidentId} AND ra.status <> 'duplicate'
      ORDER BY ra.observed_at DESC
    `;
    return summarize(
      incidentId,
      rows.map((row) => ({ assessment: fromRow(row), zoneName: String(row.zone_name) })),
    );
  }
}
