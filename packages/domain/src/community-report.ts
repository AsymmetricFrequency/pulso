import type {
  CommunityReportDto,
  CreateCommunityReportInput,
  PublicCommunityReportDto,
  ReviewCommunityReportInput,
  UpsertExternalCommunityReportInput,
} from "@pulso/schemas";

/** Caja delimitadora geográfica: [oesteLng, surLat, esteLng, norteLat]. */
export type CommunityReportBoundingBox = [number, number, number, number];

export type PublicCommunityReportQuery = {
  boundingBox?: CommunityReportBoundingBox;
  /**
   * `map` devuelve la proyección ligera —sin descripción ni metadata— para poder entregar
   * **todos** los reportes sin recortar. El recorte por recencia era lo que hacía que los puntos
   * desaparecieran solos del mapa cada vez que entraba una ingesta.
   */
  view?: "full" | "map";
};

/**
 * El listado público va acotado porque el mapa no puede dibujar decenas de miles de puntos. Ese
 * recorte tiene que viajar con el resultado: sin `total` la interfaz no puede distinguir "esto es
 * todo lo que hay" de "esto es lo que cabía", y termina afirmando un número que no está mostrando.
 */
export type PublicCommunityReportPage = {
  reports: PublicCommunityReportDto[];
  /** Cuántos reportes existen dentro del mismo criterio, sin el recorte. */
  total: number;
};

export interface CommunityReportRepository {
  create(
    incidentId: string,
    input: CreateCommunityReportInput,
    context: { sourceIpHash: string | null },
  ): Promise<PublicCommunityReportDto>;
  listPublicByIncident(
    incidentId: string,
    query?: PublicCommunityReportQuery,
  ): Promise<PublicCommunityReportPage>;
  findPublicById(incidentId: string, reportId: string): Promise<PublicCommunityReportDto | null>;
  listByIncident(incidentId: string): Promise<CommunityReportDto[]>;
  review(
    reportId: string,
    reviewerActorId: string,
    input: ReviewCommunityReportInput,
  ): Promise<CommunityReportDto>;
  /** Upserts a point ingested from a third-party public feed, keyed by (externalSourceId, externalKey). */
  upsertFromExternalSource(
    incidentId: string,
    input: UpsertExternalCommunityReportInput,
  ): Promise<CommunityReportDto>;
}

export class CommunityReportNotFoundError extends Error {
  constructor(id: string) {
    super(`Community report not found: ${id}`);
    this.name = "CommunityReportNotFoundError";
  }
}

export class CommunityReportRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many community reports from this source.");
    this.name = "CommunityReportRateLimitError";
  }
}
