"use client";

import { useEffect, useState } from "react";
import { BarChart, type BarDatum, ChartLegend, DataTable, DonutChart } from "../components/charts";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INCIDENT = "colombia-2026";

type FundsSummary = {
  incidentCode: string;
  currency: string;
  stages: Array<{ stage: string; amount: number; contracts: number }>;
  reviewed: { confirmed: number; probable: number; unrelated: number; unreviewed: number };
  territories: Array<{
    code: string | null;
    name: string | null;
    contracts: number;
    contractedAmount: number;
    paidAmount: number;
  }>;
  sources: Array<{
    sourceId: string;
    sourceSystem: string;
    records: number;
    lastRetrievedAt: string | null;
  }>;
};

type Contract = {
  id: string;
  externalId: string;
  entityName: string;
  entityNit: string;
  supplierName: string;
  object: string | null;
  modality: string | null;
  emergencyRelevance: "confirmed" | "probable" | "unrelated" | "unreviewed";
  signedAt: string | null;
  currency: string;
  totalValue: number;
  paidValue: number;
  territoryName: string | null;
  sourceUrl: string | null;
  provenance: { sourceSystem: string; sourceReference: string; retrievedAt: string };
};

/** Nombre de cada etapa del recorrido del dinero, en español y en orden. */
const STAGE_LABEL: Record<string, string> = {
  announced: "Anunciado",
  appropriated: "Apropiado",
  available: "Disponible",
  committed: "Comprometido",
  in_procurement: "En proceso",
  contracted: "Contratado",
  obligated: "Obligado",
  paid: "Pagado",
  delivered: "Entregado",
  verified_in_territory: "Verificado en territorio",
};

const RELEVANCE_LABEL: Record<Contract["emergencyRelevance"], string> = {
  confirmed: "De la emergencia",
  probable: "Candidato",
  unrelated: "No relacionado",
  unreviewed: "Sin revisar",
};

const RELEVANCE_STATUS: Record<Contract["emergencyRelevance"], string> = {
  confirmed: "light",
  probable: "strong",
  unrelated: "none",
  unreviewed: "none",
};

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

const shortDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(new Date(value)) : "—";

export function PublicFundsPage() {
  const [summary, setSummary] = useState<FundsSummary | null>(null);
  const [contracts, setContracts] = useState<Contract[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(`${apiUrl}/v1/public/incidents/${INCIDENT}/funds`, { signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<FundsSummary>) : null))
        .then(setSummary)
        .catch(() => setSummary(null)),
      fetch(`${apiUrl}/v1/public/incidents/${INCIDENT}/contracts?limit=60`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? (r.json() as Promise<Contract[]>) : []))
        .then(setContracts)
        .catch(() => setContracts([])),
    ]);
    return () => controller.abort();
  }, []);

  const reviewed = summary?.reviewed;
  const totalContracts = reviewed
    ? reviewed.confirmed + reviewed.probable + reviewed.unrelated + reviewed.unreviewed
    : 0;

  const stageData: BarDatum[] = (summary?.stages ?? []).map((stage) => ({
    label: STAGE_LABEL[stage.stage] ?? stage.stage,
    value: stage.amount,
    hint: `${stage.contracts} contratos`,
    color: "var(--primary)",
  }));

  return (
    <>
      <section className="hero publicHero">
        <div>
          <p className="psEyebrow">Auditoría de recursos públicos</p>
          <h1>Con qué dinero se está atendiendo la emergencia.</h1>
          <p className="subtitle">
            Cada contrato que aparece aquí viene de SECOP II con su referencia original, su enlace a
            la fuente y la fecha en que se capturó. Nada se afirma sin poder volver al dato.
          </p>
        </div>
      </section>

      {/* La advertencia va antes de la cifra, no después: sin ella el lector asume que todo lo
          ingerido es gasto de emergencia, y no lo es. */}
      <p className="fundsCaveat">
        Un contrato firmado después del sismo <strong>no es</strong> un contrato de la emergencia:
        la mayoría de lo que un municipio contrata esos días es su operación ordinaria. Por eso las
        cifras de arriba solo suman lo que una persona revisó y confirmó, y se dice cuánto queda
        pendiente.
      </p>

      {reviewed ? (
        <section className="fundsGrid" aria-label="Estado de la revisión">
          <div className="psCard fundsReviewCard">
            <p className="psEyebrow">Estado de la revisión</p>
            <div className="fundsDonutRow">
              <DonutChart
                title="Contratos por estado de revisión"
                centerValue={totalContracts.toLocaleString("es-CO")}
                centerLabel="contratos"
                slices={[
                  {
                    label: "Confirmados",
                    value: reviewed.confirmed,
                    color: "var(--status-light)",
                  },
                  { label: "Candidatos", value: reviewed.probable, color: "var(--status-strong)" },
                  {
                    label: "No relacionados",
                    value: reviewed.unrelated,
                    color: "var(--status-none)",
                  },
                  {
                    label: "Sin revisar",
                    value: reviewed.unreviewed,
                    color: "var(--surface-sunken)",
                  },
                ]}
              />
              <ChartLegend
                items={[
                  { label: `Confirmados: ${reviewed.confirmed}`, color: "var(--status-light)" },
                  { label: `Candidatos: ${reviewed.probable}`, color: "var(--status-strong)" },
                  {
                    label: `No relacionados: ${reviewed.unrelated}`,
                    color: "var(--status-none)",
                  },
                  { label: `Sin revisar: ${reviewed.unreviewed}`, color: "var(--surface-sunken)" },
                ]}
              />
            </div>
          </div>

          <div className="psCard fundsStagesCard">
            <p className="psEyebrow">Recorrido del dinero confirmado</p>
            {stageData.length > 0 ? (
              <BarChart
                data={stageData}
                title="Monto por etapa del recorrido del recurso"
                formatValue={(value) => money(value, summary?.currency ?? "COP")}
              />
            ) : (
              // Cero confirmado no es cero gasto: es que nadie ha revisado todavía. Decirlo así
              // evita que la ausencia de barras se lea como ausencia de dinero.
              <p className="fundsEmpty">
                Todavía no hay ningún contrato confirmado como parte de la emergencia, así que no
                hay monto que publicar. No significa que no se haya gastado: significa que la
                revisión no ha empezado. Hay <strong>{reviewed.unreviewed}</strong> contratos
                esperando en la cola de Operaciones.
              </p>
            )}
          </div>
        </section>
      ) : null}

      <section className="fundsContracts" aria-labelledby="contracts-title">
        <div className="sectionHeading">
          <div>
            <p className="psEyebrow">Contratación</p>
            <h2 id="contracts-title">Contratos ingeridos</h2>
          </div>
          <span className="sectionNote">
            {summary?.sources
              .map((s) => `${s.sourceSystem} · ${s.records} registros`)
              .join(" | ") ?? "Cargando fuentes…"}
          </span>
        </div>

        {contracts === null ? (
          <p className="fundsEmpty">Cargando contratos…</p>
        ) : contracts.length === 0 ? (
          <p className="fundsEmpty">Todavía no hay contratos ingeridos para esta emergencia.</p>
        ) : (
          <DataTable
            caption="Contratos de contratación pública ingeridos para la emergencia"
            columns={[
              { key: "valor", label: "Valor", numeric: true },
              { key: "entidad", label: "Entidad" },
              { key: "objeto", label: "Objeto" },
              { key: "estado", label: "Revisión" },
              { key: "fuente", label: "Fuente" },
            ]}
          >
            {contracts.map((contract) => (
              <tr key={contract.id}>
                <td className="num strongCell">{money(contract.totalValue, contract.currency)}</td>
                <td>
                  {contract.entityName}
                  <small className="fundsSub">
                    NIT {contract.entityNit} · {shortDate(contract.signedAt)}
                  </small>
                </td>
                <td className="fundsObject">
                  {contract.object ?? "Sin objeto publicado"}
                  <small className="fundsSub">Proveedor: {contract.supplierName}</small>
                </td>
                <td>
                  <span
                    className="psBadge"
                    data-status={RELEVANCE_STATUS[contract.emergencyRelevance]}
                  >
                    {RELEVANCE_LABEL[contract.emergencyRelevance]}
                  </span>
                </td>
                <td>
                  {contract.sourceUrl ? (
                    <a href={contract.sourceUrl} target="_blank" rel="noreferrer noopener">
                      Ver en SECOP ↗
                    </a>
                  ) : (
                    "—"
                  )}
                  <small className="fundsSub">{contract.provenance.sourceReference}</small>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </>
  );
}
