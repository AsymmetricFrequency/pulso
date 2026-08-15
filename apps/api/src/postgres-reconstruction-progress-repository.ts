import type { ReconstructionProgressRepository } from "@pulso/domain";
import type { ReconstructionProgressDto } from "@pulso/schemas";
import type postgres from "postgres";

type DbRow = Record<string, unknown>;

const asNumber = (value: string | number | null | undefined) => Number(value ?? 0) || 0;

export class PostgresReconstructionProgressRepository implements ReconstructionProgressRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async getByIncidentCode(incidentCode: string): Promise<ReconstructionProgressDto> {
    const [incident] = await this.sql<DbRow[]>`
      SELECT id FROM incidents WHERE code = ${incidentCode} AND deleted_at IS NULL LIMIT 1
    `;
    const generatedAt = new Date().toISOString();
    if (!incident) {
      return {
        incidentCode,
        generatedAt,
        materials: [],
        territories: [],
        totals: {
          casesTotal: 0,
          casesWithMaterialsAssigned: 0,
          suppliersRegistered: 0,
          workforceHeadcount: 0,
          donationsLinkedToCases: 0,
        },
      };
    }
    const incidentId = String(incident.id);

    const [materialRows, territoryRows, totalsRow] = await Promise.all([
      this.#fetchMaterials(incidentId),
      this.#fetchTerritories(incidentId),
      this.#fetchTotals(incidentId),
    ]);

    return {
      incidentCode,
      generatedAt,
      materials: materialRows,
      territories: territoryRows,
      totals: totalsRow,
    };
  }

  async #fetchMaterials(incidentId: string) {
    const rows = await this.sql<DbRow[]>`
      SELECT
        mci.code AS catalog_item_code,
        mci.name AS catalog_item_name,
        mci.category,
        mci.canonical_unit AS unit,
        coalesce(sum(sn.canonical_quantity), 0) AS quantity_needed,
        coalesce(sum(delivered.qty), 0) AS quantity_delivered
      FROM material_catalog_items mci
      JOIN supply_needs sn ON sn.catalog_item_id = mci.id AND sn.incident_id = ${incidentId}
      LEFT JOIN LATERAL (
        SELECT sum(ad.canonical_quantity_delivered) AS qty
        FROM material_allocations ma
        JOIN aid_deliveries ad ON ad.allocation_id = ma.id
        WHERE ma.need_id = sn.id
      ) delivered ON true
      GROUP BY mci.id, mci.code, mci.name, mci.category, mci.canonical_unit
      ORDER BY mci.name
    `;
    return rows.map((row) => ({
      catalogItemCode: String(row.catalog_item_code),
      catalogItemName: String(row.catalog_item_name),
      category: String(row.category),
      unit: String(row.unit),
      quantityNeeded: asNumber(row.quantity_needed as string | number),
      quantityDelivered: asNumber(row.quantity_delivered as string | number),
    }));
  }

  async #fetchTerritories(incidentId: string) {
    const rows = await this.sql<DbRow[]>`
      WITH case_counts AS (
        SELECT t.id AS territory_id, count(*) AS cases_total
        FROM disaster_cases dc
        JOIN affected_places ap ON ap.id = dc.affected_place_id
        JOIN territories t ON t.id = ap.territory_id
        WHERE dc.incident_id = ${incidentId} AND dc.case_type = 'housing_damage'
        GROUP BY t.id
      ),
      case_with_materials AS (
        SELECT t.id AS territory_id, count(DISTINCT dc.id) AS cases_with_materials
        FROM disaster_cases dc
        JOIN affected_places ap ON ap.id = dc.affected_place_id
        JOIN territories t ON t.id = ap.territory_id
        JOIN supply_needs sn
          ON sn.disaster_case_id = dc.id AND sn.status IN ('partially_covered', 'covered')
        WHERE dc.incident_id = ${incidentId} AND dc.case_type = 'housing_damage'
        GROUP BY t.id
      ),
      supplier_counts AS (
        SELECT territory_id, count(*) AS suppliers_registered
        FROM material_suppliers
        WHERE incident_id = ${incidentId} AND status = 'active' AND territory_id IS NOT NULL
        GROUP BY territory_id
      ),
      workforce_counts AS (
        SELECT territory_id, sum(headcount) AS workforce_headcount
        FROM workforce_profiles
        WHERE incident_id = ${incidentId} AND status = 'active' AND territory_id IS NOT NULL
        GROUP BY territory_id
      )
      SELECT
        t.external_code AS territory_code,
        t.name AS territory_name,
        coalesce(cc.cases_total, 0) AS cases_total,
        coalesce(cwm.cases_with_materials, 0) AS cases_with_materials,
        coalesce(sc.suppliers_registered, 0) AS suppliers_registered,
        coalesce(wc.workforce_headcount, 0) AS workforce_headcount
      FROM territories t
      LEFT JOIN case_counts cc ON cc.territory_id = t.id
      LEFT JOIN case_with_materials cwm ON cwm.territory_id = t.id
      LEFT JOIN supplier_counts sc ON sc.territory_id = t.id
      LEFT JOIN workforce_counts wc ON wc.territory_id = t.id
      WHERE t.territory_type = 'department' AND t.incident_id = ${incidentId}
        AND t.deleted_at IS NULL
        AND (
          coalesce(cc.cases_total, 0) > 0
          OR coalesce(sc.suppliers_registered, 0) > 0
          OR coalesce(wc.workforce_headcount, 0) > 0
        )
      ORDER BY t.name
    `;
    return rows.map((row) => ({
      territoryCode: String(row.territory_code),
      territoryName: String(row.territory_name),
      casesTotal: asNumber(row.cases_total as string | number),
      casesWithMaterialsAssigned: asNumber(row.cases_with_materials as string | number),
      suppliersRegistered: asNumber(row.suppliers_registered as string | number),
      workforceHeadcount: asNumber(row.workforce_headcount as string | number),
    }));
  }

  async #fetchTotals(incidentId: string) {
    const [row] = await this.sql<DbRow[]>`
      SELECT
        (
          SELECT count(*) FROM disaster_cases
          WHERE incident_id = ${incidentId} AND case_type = 'housing_damage'
        ) AS cases_total,
        (
          SELECT count(DISTINCT sn.disaster_case_id) FROM supply_needs sn
          WHERE sn.incident_id = ${incidentId} AND sn.disaster_case_id IS NOT NULL
            AND sn.status IN ('partially_covered', 'covered')
        ) AS cases_with_materials_assigned,
        (
          SELECT count(*) FROM material_suppliers
          WHERE incident_id = ${incidentId} AND status = 'active'
        ) AS suppliers_registered,
        (
          SELECT coalesce(sum(headcount), 0) FROM workforce_profiles
          WHERE incident_id = ${incidentId} AND status = 'active'
        ) AS workforce_headcount,
        (
          SELECT count(DISTINCT dc.donor_organization_id) FROM donation_commitments dc
          JOIN material_lots ml ON ml.commitment_id = dc.id
          JOIN material_allocations ma ON ma.lot_id = ml.id
          JOIN supply_needs sn ON sn.id = ma.need_id
          WHERE dc.incident_id = ${incidentId} AND sn.disaster_case_id IS NOT NULL
        ) AS donations_linked_to_cases
    `;
    return {
      casesTotal: asNumber(row?.cases_total as string | number),
      casesWithMaterialsAssigned: asNumber(row?.cases_with_materials_assigned as string | number),
      suppliersRegistered: asNumber(row?.suppliers_registered as string | number),
      workforceHeadcount: asNumber(row?.workforce_headcount as string | number),
      donationsLinkedToCases: asNumber(row?.donations_linked_to_cases as string | number),
    };
  }
}
