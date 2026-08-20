import {
  ContractNotFoundError,
  type ContractReviewQueueQuery,
  type PublicContractQuery,
  type PublicFundsRepository,
} from "@pulso/domain";
import type {
  OperationsContractDto,
  PublicContractDto,
  PublicFundsSummaryDto,
  ReviewContractInput,
} from "@pulso/schemas";
import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const asNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asIso = (value: unknown) => (value instanceof Date ? value.toISOString() : null);

const toPublicContract = (row: Record<string, unknown>): PublicContractDto => ({
  id: String(row.id),
  externalId: String(row.external_id),
  reference: (row.reference as string | null) ?? null,
  entityName: String(row.entity_name),
  entityNit: String(row.entity_nit),
  supplierName: String(row.supplier_name),
  supplierDocument: (row.supplier_document as string | null) ?? null,
  object: (row.object as string | null) ?? null,
  contractType: (row.contract_type as string | null) ?? null,
  modality: (row.modality as string | null) ?? null,
  status: (row.status as string | null) ?? null,
  emergencyRelevance: row.emergency_relevance as PublicContractDto["emergencyRelevance"],
  signedAt: asIso(row.signed_at),
  currency: String(row.currency ?? "COP"),
  totalValue: asNumber(row.total_value),
  invoicedValue: asNumber(row.invoiced_value),
  paidValue: asNumber(row.paid_value),
  territoryName: (row.territory_name as string | null) ?? null,
  sourceUrl: (row.source_url as string | null) ?? null,
  provenance: {
    sourceSystem: String(row.source_system),
    sourceReference: String(row.source_reference),
    retrievedAt: asIso(row.retrieved_at) ?? new Date(0).toISOString(),
    parserVersion: String(row.parser_version),
    contentHash: String(row.content_hash),
  },
});

const toOperationsContract = (row: Record<string, unknown>): OperationsContractDto => ({
  ...toPublicContract(row),
  relevanceSignals: (row.relevance_signals as OperationsContractDto["relevanceSignals"]) ?? null,
  reviewedAt: asIso(row.reviewed_at),
  reviewedByActorId: (row.reviewed_by_actor_id as string | null) ?? null,
  reviewNotes: (row.review_notes as string | null) ?? null,
  triage: row.triage_at
    ? {
        verdict: row.triage_verdict as "likely" | "unlikely" | "unclear",
        confidence: Number.parseFloat(String(row.triage_confidence ?? 0)),
        rationale: (row.triage_rationale as string | null) ?? "",
        model: (row.triage_model as string | null) ?? "",
        at: asIso(row.triage_at) ?? "",
      }
    : null,
});

export class PostgresPublicFundsRepository implements PublicFundsRepository {
  constructor(private readonly sql: Sql) {}

  async summarizeByIncident(incidentId: string): Promise<PublicFundsSummaryDto> {
    const [stages, relevance, territories, sources, incident, lastMile] = await Promise.all([
      // Solo se suma lo que una persona confirmó como parte de la emergencia. La ingesta trae
      // todos los contratos del territorio en el periodo y la mayoría es operación ordinaria del
      // municipio; sumarlos aquí convertiría el gasto corriente en gasto de emergencia.
      this.sql<{ stage: string; amount: string; contracts: string }[]>`
        SELECT f.stage, sum(f.amount)::text AS amount,
               count(DISTINCT f.contract_id)::text AS contracts
        FROM funding_flows f
        JOIN contracts c ON c.id = f.contract_id
        WHERE f.incident_id = ${incidentId} AND c.emergency_relevance = 'confirmed'
        GROUP BY f.stage
      `,
      this.sql<{ emergency_relevance: string; total: string }[]>`
        SELECT emergency_relevance, count(*)::text AS total
        FROM contracts WHERE incident_id = ${incidentId}
        GROUP BY emergency_relevance
      `,
      this.sql<
        {
          code: string | null;
          name: string | null;
          contracts: string;
          contracted: string;
          paid: string;
        }[]
      >`
        SELECT t.external_code AS code, t.name,
               count(*)::text AS contracts,
               coalesce(sum(c.total_value), 0)::text AS contracted,
               coalesce(sum(c.paid_value), 0)::text AS paid
        FROM contracts c
        LEFT JOIN territories t ON t.id = c.territory_id
        WHERE c.incident_id = ${incidentId} AND c.emergency_relevance = 'confirmed'
        GROUP BY t.external_code, t.name
        ORDER BY sum(c.total_value) DESC
      `,
      // La procedencia se publica agregada: de qué sistema salió cada dato y cuándo se trajo.
      this.sql<
        { source_id: string; source_system: string; records: string; last_retrieved: Date | null }[]
      >`
        SELECT p.source_id, p.source_system, count(*)::text AS records,
               max(p.retrieved_at) AS last_retrieved
        FROM provenance_records p
        JOIN contracts c ON c.provenance_id = p.id
        WHERE c.incident_id = ${incidentId}
        GROUP BY p.source_id, p.source_system
      `,
      this.sql<{ code: string }[]>`SELECT code FROM incidents WHERE id = ${incidentId} LIMIT 1`,
      // La última milla. Sale de una vista y no de una consulta escrita aquí a propósito: la regla
      // de qué cuenta como «llegó a una puerta» tiene que ser la misma para la API, para una
      // consulta de auditoría y para cualquier ente de control que pida acceso de lectura.
      this.sql<
        {
          emergency_relevance: string;
          contracts_with_flow: string;
          tracked_total: string;
          contracts_with_any_delivery: string;
          contracts_confirmed_at_a_door: string;
          confirmed_amount: string;
          contracts_denied_at_a_door: string;
          denied_amount: string;
          households_reached: string;
        }[]
      >`SELECT * FROM funding_execution_gap WHERE incident_id = ${incidentId}`,
    ]);

    const counts = Object.fromEntries(
      relevance.map((row) => [row.emergency_relevance, Number(row.total)]),
    );

    return {
      incidentCode: incident[0]?.code ?? "",
      currency: "COP",
      stages: stages.map((row) => ({
        stage: row.stage as PublicFundsSummaryDto["stages"][number]["stage"],
        amount: asNumber(row.amount),
        contracts: Number(row.contracts),
      })),
      lastMile: lastMile.map((row) => ({
        relevance:
          row.emergency_relevance as PublicFundsSummaryDto["lastMile"][number]["relevance"],
        contractsWithFlow: Number(row.contracts_with_flow),
        trackedAmount: asNumber(row.tracked_total),
        contractsWithAnyDelivery: Number(row.contracts_with_any_delivery),
        contractsConfirmedAtADoor: Number(row.contracts_confirmed_at_a_door),
        confirmedAmount: asNumber(row.confirmed_amount),
        contractsDeniedAtADoor: Number(row.contracts_denied_at_a_door),
        deniedAmount: asNumber(row.denied_amount),
        householdsReached: Number(row.households_reached),
      })),
      reviewed: {
        confirmed: counts.confirmed ?? 0,
        probable: counts.probable ?? 0,
        unrelated: counts.unrelated ?? 0,
        unreviewed: counts.unreviewed ?? 0,
      },
      territories: territories.map((row) => ({
        code: row.code,
        name: row.name,
        contracts: Number(row.contracts),
        contractedAmount: asNumber(row.contracted),
        paidAmount: asNumber(row.paid),
      })),
      sources: sources.map((row) => ({
        sourceId: row.source_id,
        sourceSystem: row.source_system,
        records: Number(row.records),
        lastRetrievedAt: asIso(row.last_retrieved),
      })),
    };
  }

  async listContractsByIncident(
    incidentId: string,
    query: PublicContractQuery = {},
  ): Promise<PublicContractDto[]> {
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 1_000);
    const relevanceFilter = query.relevance?.length
      ? this.sql`AND c.emergency_relevance = ANY(${query.relevance})`
      : this.sql``;
    const territoryFilter = query.territoryCode
      ? this.sql`AND t.external_code = ${query.territoryCode}`
      : this.sql``;

    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT c.id, c.external_id, c.reference, c.supplier_name, c.supplier_document,
             c.object, c.contract_type, c.modality, c.status, c.emergency_relevance,
             c.signed_at, c.currency, c.total_value, c.invoiced_value, c.paid_value,
             c.source_url,
             e.name AS entity_name, e.nit AS entity_nit,
             t.name AS territory_name,
             p.source_system, p.source_reference, p.retrieved_at, p.parser_version, p.content_hash
      FROM contracts c
      JOIN public_entities e ON e.id = c.entity_id
      JOIN provenance_records p ON p.id = c.provenance_id
      LEFT JOIN territories t ON t.id = c.territory_id
      WHERE c.incident_id = ${incidentId} ${relevanceFilter} ${territoryFilter}
      ORDER BY c.total_value DESC, c.signed_at DESC
      LIMIT ${limit}
    `;

    return rows.map(toPublicContract);
  }

  /**
   * Cola de revisión.
   *
   * Ordena por monto descendente dentro de lo pendiente: revisar primero el contrato de siete mil
   * millones rinde más que el de cinco, y quien revisa nunca va a terminar los 357 de una sentada.
   */
  async listContractsForReview(
    incidentId: string,
    query: ContractReviewQueueQuery = {},
  ): Promise<OperationsContractDto[]> {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    const pendingFilter =
      query.pendingOnly === false ? this.sql`` : this.sql`AND c.reviewed_at IS NULL`;

    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT c.id, c.external_id, c.reference, c.supplier_name, c.supplier_document,
             c.object, c.contract_type, c.modality, c.status, c.emergency_relevance,
             c.relevance_signals, c.signed_at, c.currency, c.total_value, c.invoiced_value,
             c.paid_value, c.source_url, c.reviewed_at, c.reviewed_by_actor_id, c.review_notes,
             c.triage_verdict, c.triage_confidence, c.triage_rationale, c.triage_model,
             c.triage_at,
             e.name AS entity_name, e.nit AS entity_nit,
             t.name AS territory_name,
             p.source_system, p.source_reference, p.retrieved_at, p.parser_version, p.content_hash
      FROM contracts c
      JOIN public_entities e ON e.id = c.entity_id
      JOIN provenance_records p ON p.id = c.provenance_id
      LEFT JOIN territories t ON t.id = c.territory_id
      WHERE c.incident_id = ${incidentId} ${pendingFilter}
      ORDER BY
        -- La lectura previa manda el orden: revisar primero los contratos que probablemente son
        -- de la emergencia es la diferencia entre una cola de 356 y una de veinte. Dentro de cada
        -- veredicto va lo más caro, y los que aún no tienen lectura quedan después de los
        -- candidatos pero antes de los descartados — nadie los ha mirado todavía.
        CASE c.triage_verdict
          WHEN 'likely' THEN 0 WHEN 'unclear' THEN 1 WHEN 'unlikely' THEN 3 ELSE 2 END,
        CASE c.emergency_relevance WHEN 'probable' THEN 0 ELSE 1 END,
        c.total_value DESC
      LIMIT ${limit}
    `;
    return rows.map(toOperationsContract);
  }

  async reviewContract(
    contractId: string,
    reviewerActorId: string,
    input: ReviewContractInput,
  ): Promise<OperationsContractDto> {
    const [updated] = await this.sql<{ id: string }[]>`
      UPDATE contracts SET
        emergency_relevance = ${input.relevance},
        reviewed_by_actor_id = ${reviewerActorId},
        reviewed_at = now(),
        review_notes = ${input.notes},
        updated_at = now()
      WHERE id = ${contractId}
      RETURNING id
    `;
    if (!updated) throw new ContractNotFoundError(contractId);

    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT c.id, c.external_id, c.reference, c.supplier_name, c.supplier_document,
             c.object, c.contract_type, c.modality, c.status, c.emergency_relevance,
             c.relevance_signals, c.signed_at, c.currency, c.total_value, c.invoiced_value,
             c.paid_value, c.source_url, c.reviewed_at, c.reviewed_by_actor_id, c.review_notes,
             c.triage_verdict, c.triage_confidence, c.triage_rationale, c.triage_model,
             c.triage_at,
             e.name AS entity_name, e.nit AS entity_nit,
             t.name AS territory_name,
             p.source_system, p.source_reference, p.retrieved_at, p.parser_version, p.content_hash
      FROM contracts c
      JOIN public_entities e ON e.id = c.entity_id
      JOIN provenance_records p ON p.id = c.provenance_id
      LEFT JOIN territories t ON t.id = c.territory_id
      WHERE c.id = ${contractId}
      LIMIT 1
    `;
    if (!row) throw new ContractNotFoundError(contractId);
    return toOperationsContract(row);
  }
}
