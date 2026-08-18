import type { AidTraceabilityRepository } from "@pulso/domain";
import type { AidTraceability } from "@pulso/schemas";
import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asIso = (value: unknown): string | null =>
  value instanceof Date ? value.toISOString() : null;

export class PostgresAidTraceabilityRepository implements AidTraceabilityRepository {
  constructor(private readonly sql: Sql) {}

  async summaryByIncident(incidentId: string, incidentCode: string): Promise<AidTraceability> {
    // Una sola consulta con subconsultas escalares. Los cuatro eslabones se leen juntos o no se
    // leen: si se consultaran por separado, una entrega que entra entre dos consultas aparecería
    // contada como entrega sin su asignación, y la cadena mostraría un eslabón imposible.
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT
        (SELECT count(*) FROM supply_needs WHERE incident_id = ${incidentId}
           AND status <> 'cancelled') AS needs,
        (SELECT count(*) FROM supply_needs WHERE incident_id = ${incidentId}
           AND validated_at IS NOT NULL) AS needs_validated,

        (SELECT count(*) FROM material_allocations WHERE incident_id = ${incidentId}
           AND status <> 'cancelled') AS allocations,
        (SELECT count(*) FROM material_allocations WHERE incident_id = ${incidentId}
           AND status IN ('dispatched', 'delivered')) AS allocations_moved,

        (SELECT count(*) FROM material_allocations WHERE incident_id = ${incidentId}
           AND status IN ('dispatched', 'delivered')) AS dispatches,
        (SELECT count(*) FROM material_allocations WHERE incident_id = ${incidentId}
           AND status = 'delivered') AS dispatches_closed,

        (SELECT count(*) FROM aid_deliveries WHERE incident_id = ${incidentId}) AS deliveries,
        (SELECT count(*) FROM aid_deliveries WHERE incident_id = ${incidentId}
           AND evidence_count > 0) AS deliveries_with_evidence,

        (SELECT count(*) FROM aid_deliveries WHERE incident_id = ${incidentId}
           AND confirmation_status = 'reported') AS d_reported,
        (SELECT count(*) FROM aid_deliveries WHERE incident_id = ${incidentId}
           AND confirmation_status = 'recipient_confirmed') AS d_recipient,
        (SELECT count(*) FROM aid_deliveries WHERE incident_id = ${incidentId}
           AND confirmation_status = 'independently_verified') AS d_verified,
        (SELECT count(*) FROM aid_deliveries WHERE incident_id = ${incidentId}
           AND confirmation_status = 'disputed') AS d_disputed,

        (SELECT count(*) FROM public_report_publications WHERE incident_id = ${incidentId}
           AND status = 'published') AS pubs,
        (SELECT min(cutoff_at) FROM public_report_publications WHERE incident_id = ${incidentId}
           AND status = 'published') AS first_cutoff,
        (SELECT max(cutoff_at) FROM public_report_publications WHERE incident_id = ${incidentId}
           AND status = 'published') AS last_cutoff,
        (SELECT count(*) FROM public_report_publications WHERE incident_id = ${incidentId}
           AND status = 'published' AND supersedes_publication_id IS NOT NULL) AS pubs_chained,
        (SELECT count(*) FROM public_report_publications WHERE incident_id = ${incidentId}
           AND status = 'published' AND solana_signature IS NOT NULL) AS pubs_anchored,

        (SELECT count(*) FROM contracts WHERE incident_id = ${incidentId}) AS contracts,
        (SELECT count(*) FROM contracts WHERE incident_id = ${incidentId}
           AND emergency_relevance <> 'unreviewed') AS contracts_reviewed,
        (SELECT coalesce(sum(total_value), 0) FROM contracts WHERE incident_id = ${incidentId}
           AND emergency_relevance IN ('confirmed', 'probable')) AS contracted_amount,
        (SELECT coalesce(sum(paid_value), 0) FROM contracts WHERE incident_id = ${incidentId}
           AND emergency_relevance IN ('confirmed', 'probable')) AS paid_amount,
        (SELECT count(DISTINCT contract_id) FROM delivery_links) AS contracts_linked
    `;

    const source = row ?? {};

    return {
      incidentCode,
      chain: [
        {
          key: "necesidad",
          label: "Necesidades registradas",
          count: asNumber(source.needs),
          backed: asNumber(source.needs_validated),
          backedLabel: "validadas por una persona autorizada",
        },
        {
          key: "asignacion",
          label: "Asignaciones contra una necesidad",
          count: asNumber(source.allocations),
          backed: asNumber(source.allocations_moved),
          backedLabel: "que salieron de la bodega",
        },
        {
          key: "despacho",
          label: "Despachos",
          count: asNumber(source.dispatches),
          backed: asNumber(source.dispatches_closed),
          backedLabel: "cerrados con entrega",
        },
        {
          key: "entrega",
          label: "Entregas registradas",
          count: asNumber(source.deliveries),
          backed: asNumber(source.deliveries_with_evidence),
          backedLabel: "con evidencia adjunta",
        },
      ],
      deliveryConfirmation: {
        reported: asNumber(source.d_reported),
        recipientConfirmed: asNumber(source.d_recipient),
        independentlyVerified: asNumber(source.d_verified),
        disputed: asNumber(source.d_disputed),
      },
      integrity: {
        published: asNumber(source.pubs),
        firstCutoffAt: asIso(source.first_cutoff),
        lastCutoffAt: asIso(source.last_cutoff),
        chained: asNumber(source.pubs_chained),
        externallyAnchored: asNumber(source.pubs_anchored),
      },
      contracts: {
        total: asNumber(source.contracts),
        reviewed: asNumber(source.contracts_reviewed),
        contractedAmount: asNumber(source.contracted_amount),
        paidAmount: asNumber(source.paid_amount),
        linkedToDelivery: asNumber(source.contracts_linked),
      },
      // Lo pone el repositorio y no el reloj del navegador: un ente de control que guarde esta
      // respuesta necesita saber de cuándo es el corte, no cuándo la abrió.
      generatedAt: new Date().toISOString(),
    };
  }
}

/** Sin Postgres no hay cadena que recorrer. Ceros, nunca cifras de ejemplo. */
export class EmptyAidTraceabilityRepository implements AidTraceabilityRepository {
  async summaryByIncident(_incidentId: string, incidentCode: string): Promise<AidTraceability> {
    return {
      incidentCode,
      chain: [],
      deliveryConfirmation: {
        reported: 0,
        recipientConfirmed: 0,
        independentlyVerified: 0,
        disputed: 0,
      },
      integrity: {
        published: 0,
        firstCutoffAt: null,
        lastCutoffAt: null,
        chained: 0,
        externallyAnchored: 0,
      },
      contracts: {
        total: 0,
        reviewed: 0,
        contractedAmount: 0,
        paidAmount: 0,
        linkedToDelivery: 0,
      },
      generatedAt: new Date(0).toISOString(),
    };
  }
}
