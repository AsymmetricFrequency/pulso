import type { CensusCoverageRow, CensusCoverageSummary } from "@pulso/schemas";

/**
 * Dónde falta censar.
 *
 * No es un puerto sobre el censo: es un puerto sobre **la ausencia** de censo, que es lo único que
 * se puede responder sin tener el expediente de nadie. Devuelve agregados por municipio y no puede
 * devolver otra cosa — la vista que hay detrás no toca ninguna tabla con datos personales.
 */
export interface CensusCoverageRepository {
  /** Un municipio por nombre o DIVIPOLA. La respuesta a «qué hago» depende de en cuál estés. */
  findMunicipality(incidentId: string, search: string): Promise<CensusCoverageRow | null>;
  /** El municipio donde cae un punto. Un toque en vez de escribir un nombre con tildes. */
  findByPoint(
    incidentId: string,
    latitude: number,
    longitude: number,
  ): Promise<CensusCoverageRow | null>;
  summaryByIncident(
    incidentId: string,
    incidentCode: string,
    query?: { limit?: number },
  ): Promise<CensusCoverageSummary>;
}
