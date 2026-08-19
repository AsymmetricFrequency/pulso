import type { RemoteDamageRepository } from "@pulso/domain";
import type { RemoteDamageResponse } from "@pulso/schemas";
import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const asDate = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "");
const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export class PostgresRemoteDamageRepository implements RemoteDamageRepository {
  constructor(private readonly sql: Sql) {}

  async publicView(incidentId: string): Promise<RemoteDamageResponse> {
    const [points, areas, byMunicipality, attribution] = await Promise.all([
      this.sql<
        {
          id: string;
          source: string;
          method: string;
          damage_level: string;
          model_score: string | null;
          field_validated: boolean;
          imagery_date: Date;
          sensor: string | null;
          lat: string;
          lon: string;
        }[]
      >`
        SELECT id, source, method, damage_level, model_score, field_validated,
               imagery_date, sensor,
               ST_Y(location)::text AS lat, ST_X(location)::text AS lon
        FROM remote_damage_assessments
        WHERE incident_id = ${incidentId}
        ORDER BY imagery_date, id
      `,
      // Las áreas se simplifican a 3 decimales (~100 m) antes de salir. Dibujadas al detalle no se
      // ven distintas en pantalla y multiplican por diez lo que viaja por la red — y esta capa la
      // carga alguien con el teléfono en la calle.
      this.sql<{ id: string; source: string; imagery_date: Date; geometry: string }[]>`
        SELECT id, source, imagery_date,
               ST_AsGeoJSON(ST_SimplifyPreserveTopology(area, 0.001)) AS geometry
        FROM remote_damage_analysed_areas
        WHERE incident_id = ${incidentId}
      `,
      this.sql<Record<string, unknown>[]>`
        SELECT divipola, municipality, department, mmi_max, citizen_reports,
               analyst_flagged, model_flagged, level_damage, level_possible, field_validated
        FROM remote_damage_vs_reports
        ORDER BY (analyst_flagged + model_flagged) DESC
      `,
      // La atribución sale de las filas, no de una constante en el código: si mañana entra una
      // fuente nueva, su licencia se publica sola.
      this.sql<
        { source: string; license: string; attribution: string; url: string; points: string }[]
      >`
        SELECT source, license, attribution, min(source_url) AS url, count(*)::text AS points
        FROM remote_damage_assessments
        WHERE incident_id = ${incidentId}
        GROUP BY source, license, attribution
        ORDER BY source
      `,
    ]);

    return {
      points: points.map((row) => ({
        id: row.id,
        source: row.source as RemoteDamageResponse["points"][number]["source"],
        method: row.method as RemoteDamageResponse["points"][number]["method"],
        damageLevel: row.damage_level as RemoteDamageResponse["points"][number]["damageLevel"],
        modelScore: row.model_score === null ? null : Number(row.model_score),
        fieldValidated: row.field_validated,
        imageryDate: asDate(row.imagery_date),
        sensor: row.sensor,
        lat: Number(row.lat),
        lon: Number(row.lon),
      })),
      areas: areas.map((row) => ({
        id: row.id,
        source: row.source as RemoteDamageResponse["areas"][number]["source"],
        imageryDate: asDate(row.imagery_date),
        geometry: JSON.parse(row.geometry) as unknown,
      })),
      byMunicipality: byMunicipality.map((row) => ({
        divipola: String(row.divipola),
        municipality: String(row.municipality),
        department: String(row.department),
        mmiMax: row.mmi_max === null ? null : Number(row.mmi_max),
        citizenReports: asNumber(row.citizen_reports),
        analystFlagged: asNumber(row.analyst_flagged),
        modelFlagged: asNumber(row.model_flagged),
        levelDamage: asNumber(row.level_damage),
        levelPossible: asNumber(row.level_possible),
        fieldValidated: asNumber(row.field_validated),
      })),
      attribution: attribution.map((row) => ({
        source: row.source,
        license: row.license,
        attribution: row.attribution,
        sourceUrl: row.url,
        points: Number(row.points),
      })),
    };
  }
}
