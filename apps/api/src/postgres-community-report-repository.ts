import { createHash } from "node:crypto";
import {
  CommunityReportNotFoundError,
  CommunityReportRateLimitError,
  type CommunityReportRepository,
  type PublicCommunityReportPage,
  type PublicCommunityReportQuery,
} from "@pulso/domain";
import type {
  CommunityReportDto,
  CreateCommunityReportInput,
  PublicCommunityReportDto,
  ReviewCommunityReportInput,
  UpsertExternalCommunityReportInput,
} from "@pulso/schemas";
import type postgres from "postgres";
import { v7 as uuidv7 } from "uuid";
import { decryptField, encryptField } from "./field-encryption.js";

type DbRow = Record<string, unknown>;

const RATE_LIMIT_MAX_ATTEMPTS = 5;

const reportFromRow = (row: DbRow): CommunityReportDto => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  territoryId: row.territory_id ? String(row.territory_id) : null,
  reportType: row.report_type as CommunityReportDto["reportType"],
  category: (row.category as CommunityReportDto["category"]) ?? null,
  title: String(row.title),
  description: row.description ? String(row.description) : null,
  location: typeof row.location === "string" ? JSON.parse(row.location) : (row.location as never),
  status: row.status as CommunityReportDto["status"],
  contact: null, // lo rellena `listByIncident`, que es la única vista autenticada
  metadata: (row.metadata as CommunityReportDto["metadata"]) ?? null,
  externalSourceId: row.external_source_id ? String(row.external_source_id) : null,
  externalKey: row.external_key ? String(row.external_key) : null,
  reviewedByActorId: row.reviewed_by_actor_id ? String(row.reviewed_by_actor_id) : null,
  reviewedAt: row.reviewed_at ? new Date(String(row.reviewed_at)).toISOString() : null,
  reviewNotes: row.review_notes ? String(row.review_notes) : null,
  peopleReported: typeof row.people_reported === "number" ? row.people_reported : null,
  signsOfLife: (row.signs_of_life as CommunityReportDto["signsOfLife"]) ?? null,
  respondersOnSite: typeof row.responders_on_site === "boolean" ? row.responders_on_site : null,
  routeStatus: (row.route_status as CommunityReportDto["routeStatus"]) ?? null,
  damageSeverity: (row.damage_severity as CommunityReportDto["damageSeverity"]) ?? null,
  locationPrecision:
    (row.public_location_precision as CommunityReportDto["locationPrecision"]) ?? "approximate",
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString(),
});

const toPublic = (report: CommunityReportDto): PublicCommunityReportDto => ({
  id: report.id,
  reportType: report.reportType,
  category: report.category,
  title: report.title,
  description: report.description,
  location: report.location,
  status: report.status,
  externalSourceId: report.externalSourceId,
  metadata: report.metadata,
  peopleReported: report.peopleReported,
  signsOfLife: report.signsOfLife,
  respondersOnSite: report.respondersOnSite,
  routeStatus: report.routeStatus,
  damageSeverity: report.damageSeverity,
  locationPrecision: report.locationPrecision,
  createdAt: report.createdAt,
});

export class PostgresCommunityReportRepository implements CommunityReportRepository {
  /**
   * `contactSecret` es opcional: sin él la ruta pública sigue aceptando reportes y el contacto
   * simplemente no se guarda. En una emergencia, un fallo de configuración no puede hacer que un
   * reporte de personas atrapadas sea rechazado.
   */
  constructor(
    private readonly sql: postgres.Sql,
    private readonly contactSecret?: string,
  ) {}

  /**
   * Descifra el contacto para Operaciones, o devuelve la marca si no se puede.
   *
   * Un dato que no se puede descifrar —secreto rotado, columna corrupta— se muestra como presente
   * pero ilegible en vez de romper la lista entera: quien coordina necesita ver los otros treinta
   * reportes aunque uno tenga el contacto ilegible.
   */
  #readContact(payload: unknown): string | null {
    if (!payload) return null;
    if (!this.contactSecret) return "•••";
    try {
      return decryptField(this.contactSecret, payload as Buffer);
    } catch {
      return "(no se pudo descifrar)";
    }
  }

  async create(
    incidentId: string,
    input: CreateCommunityReportInput,
    context: { sourceIpHash: string | null },
  ): Promise<PublicCommunityReportDto> {
    if (context.sourceIpHash) await this.#consumeRateLimit(context.sourceIpHash);

    // El contacto se guarda cifrado y solo lo lee Operaciones.
    //
    // La persona lo escribió en un campo que dice «solo para seguimiento, no se publica». Pedirlo
    // bajo esa promesa y después tirarlo era lo peor de las dos opciones: la molestia de darlo sin
    // la posibilidad de que sirviera. Es dato de primera mano y consentido — distinto de un
    // teléfono copiado de otra plataforma, que sigue sin entrar.
    const [row] = await this.sql<DbRow[]>`
      INSERT INTO community_reports (
        id, incident_id, report_type, category, title, description, location,
        people_reported, signs_of_life, responders_on_site, route_status, damage_severity,
        contact_encrypted, source_ip_hash, client_mutation_id
      ) VALUES (
        ${uuidv7()}, ${incidentId}, ${input.reportType}, ${input.category}, ${input.title},
        ${input.description},
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(input.location)}), 4326),
        ${input.peopleReported}, ${input.signsOfLife}, ${input.respondersOnSite},
        ${input.routeStatus}, ${input.damageSeverity},
        ${
          input.contact && this.contactSecret
            ? encryptField(this.contactSecret, input.contact)
            : null
        },
        ${context.sourceIpHash}, ${input.clientMutationId}
      )
      ON CONFLICT (incident_id, client_mutation_id) DO UPDATE SET incident_id = EXCLUDED.incident_id
      RETURNING *, ST_AsGeoJSON(location)::json AS location
    `;
    if (!row) throw new Error("PostgreSQL did not return the created community report");
    return toPublic(reportFromRow(row));
  }

  async listPublicByIncident(
    incidentId: string,
    query: PublicCommunityReportQuery = {},
  ): Promise<PublicCommunityReportPage> {
    // El listado va acotado: con decenas de miles de puntos externos y ciudadanos, una lista sin
    // tope ahoga al mapa. Pero acotar por recencia sobre todo el país hace que cada ingesta empuje
    // reportes viejos fuera de la ventana y desaparezcan del mapa sin que el usuario toque nada.
    // Por eso el recorte grande solo aplica a la vista de país; con caja delimitadora —que es como
    // el mapa consulta cuando estás dentro de un departamento— el universo ya viene acotado por
    // geografía y cabe completo.
    const box = query.boundingBox;
    // En vista de mapa se devuelven **todos** los reportes. El recorte por recencia era la causa
    // de que los puntos desaparecieran solos: con 2.288 reportes y un tope de 800 ordenado por
    // fecha, cada ingesta empujaba a los viejos fuera de la ventana y el mapa cambiaba de
    // contenido sin que nadie lo tocara. Cabe entero porque la proyección ligera pesa una
    // fracción: la descripción y la metadata son la mitad del payload y el mapa no las usa.
    const mapView = query.view === "map";
    const scope = box
      ? this.sql`AND ST_Intersects(
          location,
          ST_MakeEnvelope(${box[0]}, ${box[1]}, ${box[2]}, ${box[3]}, 4326)
        )`
      : this.sql``;
    const limit = mapView ? 20_000 : box ? 4_000 : 800;

    // La proyección ligera no pide description ni metadata a Postgres: no es solo ahorro de red,
    // también evita traer 350 KB de jsonb que nadie va a leer.
    const columns = mapView
      ? this.sql`id, incident_id, report_type, category, title, status, created_at, updated_at,
                 people_reported, signs_of_life, responders_on_site, route_status,
                 damage_severity`
      : this.sql`*`;

    const [rows, [totalRow]] = await Promise.all([
      this.sql<DbRow[]>`
        SELECT ${columns}, ST_AsGeoJSON(location)::json AS location
        FROM community_reports
        WHERE incident_id = ${incidentId} AND status <> 'rejected' ${scope}
        ORDER BY
          -- Un rescate va primero, sin excepción y por encima del estado de revisión. Con 2.288
          -- reportes en la tabla, un tope de 800 en la vista de país y orden por validación, un
          -- «hay gente atrapada» recién enviado quedaría fuera de la respuesta: sin revisar es
          -- último en el primer criterio, y nuevo no lo salva. Esperar a que alguien lo valide es
          -- exactamente el tiempo que no hay.
          CASE report_type WHEN 'rescate' THEN 0 ELSE 1 END,
          -- Dentro de los rescates manda el hecho de que se oiga algo: separa un rescate en curso
          -- de una recuperación. Un unknown va por encima de un no: nadie lo ha descartado todavía.
          CASE signs_of_life WHEN 'yes' THEN 0 WHEN 'unknown' THEN 1 WHEN 'no' THEN 2 ELSE 1 END,
          CASE status WHEN 'validated' THEN 0 WHEN 'corroborated' THEN 1 ELSE 2 END,
          created_at DESC
        LIMIT ${limit}
      `,
      this.sql<{ total: string }[]>`
        SELECT count(*)::text AS total
        FROM community_reports
        WHERE incident_id = ${incidentId} AND status <> 'rejected' ${scope}
      `,
    ]);

    return {
      reports: rows.map(reportFromRow).map(toPublic),
      total: Number(totalRow?.total ?? rows.length),
    };
  }

  /**
   * Detalle de un reporte. Existe porque la vista de mapa entrega la proyección ligera: cuando
   * alguien abre un marcador, ahí sí hace falta la descripción y la metadata, y pedirlas de a una
   * cuesta menos que traerlas para los 2.288 puntos por si acaso.
   */
  async findPublicById(
    incidentId: string,
    reportId: string,
  ): Promise<PublicCommunityReportDto | null> {
    const [row] = await this.sql<DbRow[]>`
      SELECT *, ST_AsGeoJSON(location)::json AS location
      FROM community_reports
      WHERE incident_id = ${incidentId} AND id = ${reportId} AND status <> 'rejected'
      LIMIT 1
    `;
    return row ? toPublic(reportFromRow(row)) : null;
  }

  async listByIncident(incidentId: string): Promise<CommunityReportDto[]> {
    const rows = await this.sql<DbRow[]>`
      SELECT *, ST_AsGeoJSON(location)::json AS location
      FROM community_reports
      WHERE incident_id = ${incidentId}
      ORDER BY created_at DESC
    `;
    // El único sitio donde el contacto se descifra. La ruta que llega aquí exige sesión de
    // Operaciones; la pública usa `toPublic`, que ni siquiera incluye el campo.
    return rows.map((row) => ({
      ...reportFromRow(row),
      contact: this.#readContact(row.contact_encrypted),
    }));
  }

  async review(
    reportId: string,
    reviewerActorId: string,
    input: ReviewCommunityReportInput,
  ): Promise<CommunityReportDto> {
    const [row] = await this.sql<DbRow[]>`
      UPDATE community_reports
      SET status = ${input.status},
          reviewed_by_actor_id = ${reviewerActorId},
          reviewed_at = now(),
          review_notes = ${input.notes},
          updated_at = now()
      WHERE id = ${reportId}
      RETURNING *, ST_AsGeoJSON(location)::json AS location
    `;
    if (!row) throw new CommunityReportNotFoundError(reportId);
    return reportFromRow(row);
  }

  async upsertFromExternalSource(
    incidentId: string,
    input: UpsertExternalCommunityReportInput,
  ): Promise<CommunityReportDto> {
    const [row] = await this.sql<DbRow[]>`
      INSERT INTO community_reports (
        id, incident_id, report_type, category, title, description, location,
        status, external_source_id, external_key, client_mutation_id, metadata, route_status,
        damage_severity
      ) VALUES (
        ${uuidv7()}, ${incidentId}, ${input.reportType}, ${input.category}, ${input.title},
        ${input.description},
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(input.location)}), 4326),
        ${input.status}, ${input.externalSourceId}, ${input.externalKey}, ${uuidv7()},
        ${input.metadata ? this.sql.json(input.metadata) : null}, ${input.routeStatus},
        ${input.damageSeverity}
      )
      ON CONFLICT (external_source_id, external_key) WHERE external_source_id IS NOT NULL
      DO UPDATE SET
        report_type = EXCLUDED.report_type,
        category = EXCLUDED.category,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        location = EXCLUDED.location,
        metadata = EXCLUDED.metadata,
        route_status = EXCLUDED.route_status,
        damage_severity = EXCLUDED.damage_severity,
        status = CASE WHEN community_reports.status = 'rejected' THEN community_reports.status
          ELSE EXCLUDED.status END,
        updated_at = now()
      RETURNING *, ST_AsGeoJSON(location)::json AS location
    `;
    if (!row) throw new Error("PostgreSQL did not return the upserted community report");
    return reportFromRow(row);
  }

  async #consumeRateLimit(sourceIpHash: string) {
    const key = createHash("sha256").update(`community-report:${sourceIpHash}`).digest("hex");
    const [row] = await this.sql<DbRow[]>`
      INSERT INTO access_rate_limits (key_hash, attempts, reset_at)
      VALUES (${key}, 1, now() + interval '10 minutes')
      ON CONFLICT (key_hash) DO UPDATE SET
        attempts = CASE WHEN access_rate_limits.reset_at <= now() THEN 1
          ELSE access_rate_limits.attempts + 1 END,
        reset_at = CASE WHEN access_rate_limits.reset_at <= now()
          THEN now() + interval '10 minutes' ELSE access_rate_limits.reset_at END
      RETURNING attempts, reset_at
    `;
    if (Number(row?.attempts) > RATE_LIMIT_MAX_ATTEMPTS) {
      const retryAfter = Math.max(
        1,
        Math.ceil((new Date(String(row?.reset_at)).getTime() - Date.now()) / 1_000),
      );
      throw new CommunityReportRateLimitError(retryAfter);
    }
  }
}
