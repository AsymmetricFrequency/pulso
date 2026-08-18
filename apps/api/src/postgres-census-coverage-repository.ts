import type { CensusCoverageRepository } from "@pulso/domain";
import type { CensusCoverageRow, CensusCoverageState, CensusCoverageSummary } from "@pulso/schemas";
import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const EMPTY_COUNTS: CensusCoverageSummary["counts"] = {
  silencio: 0,
  sin_censo: 0,
  en_curso: 0,
  con_censo: 0,
  fuera_de_alcance: 0,
};

export class PostgresCensusCoverageRepository implements CensusCoverageRepository {
  constructor(private readonly sql: Sql) {}

  /**
   * Busca un municipio por su nombre, como lo escribiría una persona.
   *
   * Existe porque la respuesta correcta a «¿qué hago para que me censen?» **depende de dónde
   * estés**. En un municipio donde hay brigadas, esperar a que pasen es un consejo útil. En uno de
   * los que llevan ocho días sin que vaya nadie, ese mismo consejo es decirle a alguien que espere
   * indefinidamente. Sin esta consulta la página solo puede dar una respuesta, y a la mitad de la
   * gente a la que se la da es falsa.
   */
  async findMunicipality(incidentId: string, search: string): Promise<CensusCoverageRow | null> {
    const term = search.trim();
    if (term.length < 3) return null;

    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT divipola, municipality, department, mmi_max, mmi_label, report_count,
             coverage_state, reported_people, registered_people, census_observed_at
      FROM territory_census_coverage
      WHERE incident_id = ${incidentId}
        AND (
          divipola = ${term}
          OR pulso_normalize_place(municipality) = pulso_normalize_place(${term})
          OR pulso_normalize_place(municipality) LIKE pulso_normalize_place(${term}) || '%'
        )
      -- La coincidencia exacta primero: escribir «Bello» no puede devolver «Bello Horizonte».
      ORDER BY (pulso_normalize_place(municipality) = pulso_normalize_place(${term})) DESC,
               length(municipality)
      LIMIT 1
    `;
    return row ? mapRow(row) : null;
  }

  /**
   * El municipio en el que cae un punto.
   *
   * Es la versión sin fricción de la pregunta anterior: un toque en «usar mi ubicación» en vez de
   * escribir «El Cantón del San Pablo» con el pulgar. Punto en polígono contra los límites del MGN
   * del DANE, que ya están en la base con índice GiST — no hace falta pedirle nada a nadie ni
   * depender de un servicio externo que puede estar caído justo cuando hace falta.
   */
  async findByPoint(
    incidentId: string,
    latitude: number,
    longitude: number,
  ): Promise<CensusCoverageRow | null> {
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT c.divipola, c.municipality, c.department, c.mmi_max, c.mmi_label, c.report_count,
             c.coverage_state, c.reported_people, c.registered_people, c.census_observed_at
      FROM territories t
      JOIN territory_census_coverage c ON c.territory_id = t.id
      WHERE t.incident_id = ${incidentId}
        AND t.territory_type = 'municipality'
        AND t.deleted_at IS NULL
        AND ST_Contains(t.geometry, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326))
      LIMIT 1
    `;
    return row ? mapRow(row) : null;
  }

  async summaryByIncident(
    incidentId: string,
    incidentCode: string,
    query: { limit?: number } = {},
  ): Promise<CensusCoverageSummary> {
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 1_200);

    // El conteo va sobre los 1.121 municipios y la lista va recortada. Son dos preguntas: «cuántos
    // faltan» tiene que ser exacta aunque la lista se muestre en pedazos, o el titular afirmaría
    // algo que la tabla de abajo no sostiene.
    const [counts, rows] = await Promise.all([
      this.sql<{ coverage_state: string; total: string }[]>`
        SELECT coverage_state, count(*) AS total
        FROM territory_census_coverage
        WHERE incident_id = ${incidentId}
        GROUP BY coverage_state
      `,
      this.sql<Record<string, unknown>[]>`
        SELECT divipola, municipality, department, mmi_max, mmi_label, report_count,
               coverage_state, reported_people, registered_people, census_observed_at
        FROM territory_census_coverage
        WHERE incident_id = ${incidentId}
          AND coverage_state <> 'fuera_de_alcance'
        -- El silencio primero y, dentro de él, lo que más sacudió. Es el orden en que se decide a
        -- dónde sale una brigada mañana: no alfabético, no por población.
        ORDER BY
          CASE coverage_state
            WHEN 'silencio' THEN 0
            WHEN 'sin_censo' THEN 1
            WHEN 'en_curso' THEN 2
            ELSE 3
          END,
          mmi_max DESC NULLS LAST,
          report_count DESC,
          municipality
        LIMIT ${limit}
      `,
    ]);

    const [shaking] = await this.sql<{ total: string }[]>`
      SELECT count(*) AS total
      FROM territory_census_coverage
      WHERE incident_id = ${incidentId} AND mmi_max IS NOT NULL
    `;

    const tally = { ...EMPTY_COUNTS };
    for (const row of counts) {
      const key = row.coverage_state as CensusCoverageState;
      if (key in tally) tally[key] = Number(row.total);
    }

    return {
      incidentCode,
      counts: tally,
      municipalitiesWithShaking: Number(shaking?.total ?? 0),
      rows: rows.map(mapRow),
    };
  }
}

function mapRow(row: Record<string, unknown>): CensusCoverageRow {
  return {
    divipola: (row.divipola as string | null) ?? null,
    municipality: String(row.municipality),
    department: (row.department as string | null) ?? null,
    mmiMax: row.mmi_max === null ? null : Number(row.mmi_max),
    mmiLabel: (row.mmi_label as string | null) ?? null,
    reportCount: Number(row.report_count ?? 0),
    coverageState: row.coverage_state as CensusCoverageState,
    reportedPeople: row.reported_people === null ? null : Number(row.reported_people),
    registeredPeople: row.registered_people === null ? null : Number(row.registered_people),
    censusObservedAt:
      row.census_observed_at instanceof Date ? row.census_observed_at.toISOString() : null,
  };
}

/**
 * Sin Postgres no hay malla ni reportes que cruzar. Devuelve ceros, nunca municipios de ejemplo:
 * un «silencio: 44» inventado en una demo se cita después como si fuera real.
 */
export class EmptyCensusCoverageRepository implements CensusCoverageRepository {
  async findMunicipality(): Promise<CensusCoverageRow | null> {
    return null;
  }

  async findByPoint(): Promise<CensusCoverageRow | null> {
    return null;
  }

  async summaryByIncident(
    _incidentId: string,
    incidentCode: string,
  ): Promise<CensusCoverageSummary> {
    return {
      incidentCode,
      counts: { ...EMPTY_COUNTS },
      municipalitiesWithShaking: 0,
      rows: [],
    };
  }
}
