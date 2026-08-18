import { createHash, randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";

type DepartmentRow = {
  id: string;
  external_code: string;
  name: string;
  municipalities: Array<{ code: string; name: string }> | null;
};

type ReportStatsRow = {
  code: string;
  total_reports: string;
  necesidad_reports: string;
  necesidad_verified: string;
  verified_reports: string;
};

type DamageStatsRow = {
  code: string;
  total_assessments: string;
  reviewed_assessments: string;
  affected_households: string;
  affected_people: string;
};

type UpdateRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: Date;
  metadata: { city?: string; department?: string; address?: string } | null;
  territory_name: string | null;
};

const asNumber = (value: string | number | null | undefined) => Number(value ?? 0) || 0;

async function fetchDepartments(sql: Sql, incidentId: string): Promise<DepartmentRow[]> {
  return sql<DepartmentRow[]>`
    SELECT d.id, d.external_code, d.name,
      json_agg(
        json_build_object('code', m.external_code, 'name', m.name)
        ORDER BY m.name
      ) FILTER (WHERE m.id IS NOT NULL) AS municipalities
    FROM territories d
    LEFT JOIN territories m
      ON m.parent_id = d.id AND m.territory_type = 'municipality' AND m.deleted_at IS NULL
    WHERE d.territory_type = 'department' AND d.incident_id = ${incidentId} AND d.deleted_at IS NULL
    GROUP BY d.id, d.external_code, d.name
    ORDER BY d.name
  `;
}

async function fetchReportStats(sql: Sql, incidentId: string): Promise<ReportStatsRow[]> {
  return sql<ReportStatsRow[]>`
    SELECT
      d.external_code AS code,
      count(cr.id) AS total_reports,
      count(cr.id) FILTER (WHERE cr.report_type = 'necesidad') AS necesidad_reports,
      count(cr.id) FILTER (
        WHERE cr.report_type = 'necesidad' AND cr.status IN ('corroborated', 'validated')
      ) AS necesidad_verified,
      count(cr.id) FILTER (WHERE cr.status IN ('corroborated', 'validated')) AS verified_reports
    FROM territories d
    LEFT JOIN community_reports cr
      ON ST_Within(cr.location, d.geometry)
      AND cr.incident_id = ${incidentId} AND cr.status NOT IN ('rejected', 'superseded')
    WHERE d.territory_type = 'department' AND d.incident_id = ${incidentId} AND d.deleted_at IS NULL
    GROUP BY d.external_code
  `;
}

// rapid_assessments/operational_zones are populated by field brigades via Pulso Campo — this
// join is real infrastructure that will start returning non-zero rows the moment a team submits
// an assessment. It is intentionally not backfilled with synthetic data.
async function fetchDamageStats(sql: Sql, incidentId: string): Promise<DamageStatsRow[]> {
  return sql<DamageStatsRow[]>`
    SELECT
      t.external_code AS code,
      count(ra.id) AS total_assessments,
      count(ra.id) FILTER (WHERE ra.status = 'reviewed') AS reviewed_assessments,
      coalesce(sum(ra.affected_households), 0) AS affected_households,
      coalesce(sum(ra.affected_people), 0) AS affected_people
    FROM territories t
    LEFT JOIN operational_zones oz ON oz.territory_id = t.id
    LEFT JOIN rapid_assessments ra ON ra.zone_id = oz.id AND ra.incident_id = ${incidentId}
    WHERE t.territory_type = 'department' AND t.incident_id = ${incidentId} AND t.deleted_at IS NULL
    GROUP BY t.external_code
  `;
}

/**
 * El feed público era de cinco entradas, así que cada publicación reemplazaba la anterior y no
 * quedaba histórico: lo que alguien leyó hace una hora ya no existía en ninguna parte. Con una
 * ventana de 60 el informe carga una cronología real y la interfaz decide cuántas muestra.
 *
 * El territorio se resuelve por geometría (`ST_Within` contra los polígonos de departamento del
 * DANE) y no solo por lo que traiga `metadata`: la mayoría de las fuentes externas no publican
 * ciudad ni departamento, y sin esto el feed entero decía "Colombia".
 */
async function fetchRecentUpdates(sql: Sql, incidentId: string): Promise<UpdateRow[]> {
  return sql<UpdateRow[]>`
    SELECT cr.id, cr.title, cr.description, cr.status, cr.created_at, cr.metadata,
           t.name AS territory_name
    FROM community_reports cr
    LEFT JOIN territories t
      ON t.incident_id = cr.incident_id
     AND t.territory_type = 'department'
     AND t.deleted_at IS NULL
     AND ST_Within(cr.location, t.geometry)
    WHERE cr.incident_id = ${incidentId} AND cr.status IN ('corroborated', 'validated')
    ORDER BY cr.created_at DESC
    LIMIT 60
  `;
}

async function fetchIncidentTotals(sql: Sql, incidentId: string) {
  const [row] = await sql<{ total_reports: string; open_needs: string }[]>`
    SELECT
      -- Los retirados (superseded) también fuera. Son los puntos que su fuente dejó de publicar:
      -- siguen en la base con su historial pero ya no están en el mapa, y un titular que los
      -- cuenta dice una cifra que la pantalla de al lado no sostiene.
      -- (Sin comillas invertidas: dentro de una plantilla SQL cierran el literal. Ya van tres.)
      count(*) FILTER (WHERE status NOT IN ('rejected', 'superseded')) AS total_reports,
      count(*) FILTER (
        WHERE report_type = 'necesidad' AND status NOT IN ('rejected', 'superseded')
      ) AS open_needs
    FROM community_reports
    WHERE incident_id = ${incidentId}
  `;
  const [structural] = await sql<{ damaged: string; collapsed: string }[]>`
    SELECT
      count(*) AS damaged,
      count(*) FILTER (WHERE damage_severity = 'colapso') AS collapsed
    FROM community_reports
    WHERE incident_id = ${incidentId}
      AND report_type = 'dano'
      AND status NOT IN ('rejected', 'superseded')
  `;
  const [damage] = await sql<{ affected_households: string }[]>`
    SELECT coalesce(sum(affected_households), 0) AS affected_households
    FROM rapid_assessments WHERE incident_id = ${incidentId}
  `;
  return {
    totalReports: asNumber(row?.total_reports),
    openNeeds: asNumber(row?.open_needs),
    affectedHouseholds: asNumber(damage?.affected_households),
    structuresDamaged: asNumber(structural?.damaged),
    structuresCollapsed: asNumber(structural?.collapsed),
  };
}

function territoryConfidence(
  reportStats: ReportStatsRow | undefined,
  damage: DamageStatsRow | undefined,
) {
  const totalReports = asNumber(reportStats?.total_reports);
  const totalAssessments = asNumber(damage?.total_assessments);
  const reviewed = asNumber(damage?.reviewed_assessments);
  if (totalAssessments > 0 && reviewed === totalAssessments) {
    return { confidence: "validated" as const, confidenceLabel: "Evaluaciones de campo revisadas" };
  }
  if (totalAssessments > 0) {
    return {
      confidence: "corroborated" as const,
      confidenceLabel: "Evaluaciones de campo en revisión",
    };
  }
  if (totalReports > 0) {
    return {
      confidence: "reported" as const,
      confidenceLabel: "Reportes ciudadanos sin verificación oficial",
    };
  }
  return { confidence: "insufficient" as const, confidenceLabel: "Información insuficiente" };
}

export async function runPublishSituationReport(options: {
  databaseUrl: string;
  incidentCode: string;
}) {
  const sql = postgres(options.databaseUrl, { max: 1 });
  try {
    const [incident] = await sql<
      { id: string; name: string; country_code: string; started_at: Date }[]
    >`
      SELECT id, name, country_code, started_at FROM incidents
      WHERE code = ${options.incidentCode} AND deleted_at IS NULL LIMIT 1
    `;
    if (!incident) throw new Error(`Incident ${options.incidentCode} does not exist`);

    const [departments, reportStats, damageStats, updates, totals] = await Promise.all([
      fetchDepartments(sql, incident.id),
      fetchReportStats(sql, incident.id),
      fetchDamageStats(sql, incident.id),
      fetchRecentUpdates(sql, incident.id),
      fetchIncidentTotals(sql, incident.id),
    ]);

    const reportStatsByCode = new Map(reportStats.map((row) => [row.code, row]));
    const damageStatsByCode = new Map(damageStats.map((row) => [row.code, row]));
    const now = new Date().toISOString();

    const territories = departments.map((department) => {
      const reportRow = reportStatsByCode.get(department.external_code);
      const damageRow = damageStatsByCode.get(department.external_code);
      const totalAssessments = asNumber(damageRow?.total_assessments);
      const reviewedAssessments = asNumber(damageRow?.reviewed_assessments);
      const necesidadReports = asNumber(reportRow?.necesidad_reports);
      const necesidadVerified = asNumber(reportRow?.necesidad_verified);

      return {
        code: department.external_code,
        name: department.name,
        municipalities: (department.municipalities ?? []).map((municipality) => ({
          code: municipality.code,
          name: municipality.name,
          localities: ["Todo el municipio"],
        })),
        updatedAt: now,
        ...territoryConfidence(reportRow, damageRow),
        coverage: "Sin zonas operativas registradas",
        damage:
          totalAssessments > 0
            ? `${totalAssessments} evaluaciones · ${reviewedAssessments} revisadas`
            : "Sin evaluaciones de daño registradas",
        supplies:
          necesidadReports > 0
            ? `${necesidadReports} necesidades reportadas · ${necesidadVerified} verificadas`
            : "Sin necesidades reportadas",
        donations: "Sin entregas publicadas",
        teams: "Sin equipos registrados",
      };
    });

    const snapshot = {
      schemaVersion: 1 as const,
      incident: {
        code: options.incidentCode,
        name: incident.name,
        countryCode: incident.country_code,
        dataMode: "live" as const,
        cutoffAt: now,
        publishedAt: now,
      },
      metrics: [
        {
          id: "reports-received",
          label: "Reportes recibidos",
          value: String(totals.totalReports),
          note: "Reportes ciudadanos y de fuentes oficiales, sin rechazados",
        },
        {
          // La portada decía «Viviendas afectadas: 0» mientras el mapa de al lado mostraba 97
          // edificaciones colapsadas. La cifra era cierta por su propia definición —cuenta
          // evaluaciones de campo, y no hay ninguna— pero quien la lee concluye que no hay daño.
          // Una métrica honesta que se lee como una mentira sigue siendo un problema.
          id: "structures-damaged",
          label: "Edificaciones con daño",
          value: String(totals.structuresDamaged),
          note:
            totals.structuresCollapsed > 0
              ? `${totals.structuresCollapsed} colapsadas · reportadas por fuentes públicas, sin evaluación de campo`
              : "Reportadas por fuentes públicas, sin evaluación de campo",
        },
        {
          id: "affected-households",
          label: "Viviendas evaluadas en campo",
          value: String(totals.affectedHouseholds),
          note: "Solo evaluaciones hechas por una brigada en el sitio. Es otra cosa que lo de arriba.",
        },
        {
          id: "open-needs",
          label: "Necesidades abiertas",
          value: String(totals.openNeeds),
          note: "Reportes tipo necesidad sin cerrar",
        },
        {
          id: "donations-registered",
          label: "Donaciones registradas",
          value: "$0",
          note: "Aún sin ledger de donaciones conectado",
        },
        {
          id: "deliveries-verified",
          label: "Entregas verificadas",
          value: "0",
          note: "Aún sin entregas con receptor y evidencia",
        },
        {
          id: "active-teams",
          label: "Equipos activos",
          value: "0",
          note: "Aún sin equipos desplegados registrados",
        },
      ],
      territories,
      updates: updates.map((update) => ({
        id: update.id,
        title: update.title.slice(0, 160),
        territory: (
          update.metadata?.city ??
          update.metadata?.department ??
          update.territory_name ??
          "Colombia"
        ).slice(0, 240),
        detail: (update.description ?? update.title).slice(0, 500),
        verificationLabel: update.status === "validated" ? "Validado" : "Corroborado",
        observedAt: update.created_at.toISOString(),
      })),
      aidBalances: [],
      donationFlow: {
        currency: "COP",
        registered: 0,
        reconciled: 0,
        allocated: 0,
        delivered: 0,
      },
      integrity: {
        status: "pending" as const,
        network: "none" as const,
        merkleRoot: null,
        transactionSignature: null,
      },
    };

    const snapshotJson = JSON.stringify(snapshot);
    const snapshotHash = createHash("sha256").update(snapshotJson).digest("hex");

    await sql`
      INSERT INTO public_report_publications (
        id, incident_id, schema_version, status, cutoff_at, snapshot, snapshot_hash,
        privacy_reviewed_at, published_at
      ) VALUES (
        ${randomUUID()}, ${incident.id}, 1, 'published', ${now}, ${sql.json(snapshot)},
        ${snapshotHash}, ${now}, ${now}
      )
    `;

    return {
      status: "published" as const,
      incidentCode: options.incidentCode,
      territories: territories.length,
      totalReports: totals.totalReports,
      openNeeds: totals.openNeeds,
      updates: snapshot.updates.length,
    };
  } finally {
    await sql.end();
  }
}
