import type { CensusCoverageSummary } from "@pulso/schemas";

/**
 * Dónde falta censar.
 *
 * No es un puerto sobre el censo: es un puerto sobre **la ausencia** de censo, que es lo único que
 * se puede responder sin tener el expediente de nadie. Devuelve agregados por municipio y no puede
 * devolver otra cosa — la vista que hay detrás no toca ninguna tabla con datos personales.
 */
export interface CensusCoverageRepository {
  summaryByIncident(
    incidentId: string,
    incidentCode: string,
    query?: { limit?: number },
  ): Promise<CensusCoverageSummary>;
}
