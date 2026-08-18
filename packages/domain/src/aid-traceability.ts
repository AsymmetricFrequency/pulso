import type { AidTraceability } from "@pulso/schemas";

/**
 * La trazabilidad de la ayuda, en agregados.
 *
 * Existe porque es lo que los entes de control están pidiendo —Contraloría, Procuraduría y
 * Defensoría coinciden en la palabra «trazabilidad»— y porque la respuesta honesta a esa petición
 * incluye los eslabones que están en cero. Un ente de control necesita distinguir «no se entregó
 * ayuda» de «se entregó y no se registró aquí», y solo puede hacerlo si el cero se muestra.
 */
export interface AidTraceabilityRepository {
  summaryByIncident(incidentId: string, incidentCode: string): Promise<AidTraceability>;
}
