"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./operations.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type OperationsContract = {
  id: string;
  externalId: string;
  entityName: string;
  entityNit: string;
  supplierName: string;
  supplierDocument: string | null;
  object: string | null;
  contractType: string | null;
  modality: string | null;
  emergencyRelevance: "confirmed" | "probable" | "unrelated" | "unreviewed";
  signedAt: string | null;
  currency: string;
  totalValue: number;
  paidValue: number;
  territoryName: string | null;
  sourceUrl: string | null;
  relevanceSignals: {
    emergencyTerms: string[];
    supportingTerms: string[];
    declaredUrgency: boolean;
    strength: "strong" | "weak" | "none";
  } | null;
  triage: {
    verdict: "likely" | "unlikely" | "unclear";
    confidence: number;
    rationale: string;
    model: string;
    at: string;
  } | null;
  provenance: { sourceSystem: string; sourceReference: string; retrievedAt: string };
};

/** Cómo se rotula la lectura previa. En condicional: es una opinión, no una decisión. */
const TRIAGE_LABEL: Record<NonNullable<OperationsContract["triage"]>["verdict"], string> = {
  likely: "Parece de la emergencia",
  unlikely: "Parece operación ordinaria",
  unclear: "No alcanza para decidir",
};

type Decision = "confirmed" | "unrelated" | "probable";

const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(new Date(value)) : "—";

export function ContractReview({
  incidentId,
  sessionToken,
}: {
  incidentId: string;
  sessionToken: string;
}) {
  const [queue, setQueue] = useState<OperationsContract[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [decided, setDecided] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `${apiUrl}/v1/operations/incidents/${incidentId}/contracts?limit=25`,
        { headers: { Authorization: `Bearer ${sessionToken}` } },
      );
      if (!response.ok) throw new Error("No fue posible cargar la cola de revisión.");
      setQueue((await response.json()) as OperationsContract[]);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible cargar la cola.");
      setQueue([]);
    }
  }, [incidentId, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (contract: OperationsContract, relevance: Decision) => {
    setBusyId(contract.id);
    setError("");
    try {
      const response = await fetch(
        `${apiUrl}/v1/operations/incidents/${incidentId}/contracts/${contract.id}/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ relevance, notes: notes[contract.id]?.trim() || null }),
        },
      );
      if (!response.ok) throw new Error("No fue posible guardar la decisión.");
      // Sale de la cola en el acto: quien revisa 357 contratos no puede perder el lugar cada vez.
      setQueue((current) => (current ?? []).filter((item) => item.id !== contract.id));
      setDecided((count) => count + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible guardar la decisión.");
    } finally {
      setBusyId(null);
    }
  };

  if (queue === null) {
    return <p className={styles.loading}>Cargando contratos por revisar…</p>;
  }

  return (
    <section className={styles.reviewSection} aria-labelledby="contract-review-title">
      <div className={styles.reviewHeading}>
        <div>
          <p className={styles.eyebrow}>Recursos públicos</p>
          <h2 id="contract-review-title">Contratos por revisar</h2>
          <p className={styles.reviewLead}>
            El clasificador automático propone candidatos, nunca confirma. Un contrato solo entra en
            las cifras públicas de la emergencia cuando una persona lo confirma aquí.
          </p>
        </div>
        <div className={styles.reviewCounter}>
          <strong>{queue.length}</strong>
          <span>en cola</span>
          {decided > 0 ? <small>{decided} revisados en esta sesión</small> : null}
        </div>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {queue.length === 0 ? (
        <p className={styles.empty}>
          No queda nada por revisar. Cuando entre una nueva ingesta de SECOP, los contratos
          aparecerán aquí.
        </p>
      ) : (
        <ol className={styles.reviewList}>
          {queue.map((contract) => (
            <li key={contract.id} className={styles.reviewCard}>
              <div className={styles.reviewCardTop}>
                <div>
                  <strong className={styles.reviewAmount}>
                    {formatMoney(contract.totalValue, contract.currency)}
                  </strong>
                  <span className={styles.reviewMeta}>
                    {contract.entityName} · NIT {contract.entityNit} · firmado{" "}
                    {formatDate(contract.signedAt)}
                  </span>
                </div>
                {contract.emergencyRelevance === "probable" ? (
                  <span
                    className={`${styles.reviewBadge} ${
                      contract.relevanceSignals?.strength === "strong" ? styles.strong : ""
                    }`}
                  >
                    Candidato
                  </span>
                ) : (
                  <span className={styles.reviewBadge}>Sin señales</span>
                )}
              </div>

              {/* El objeto completo, sin recortar: es lo único que permite distinguir un albergue
                  de damnificados de un albergue de animales. */}
              <p className={styles.reviewObject}>{contract.object ?? "Sin objeto publicado"}</p>

              <div className={styles.reviewFacts}>
                <span>Proveedor: {contract.supplierName}</span>
                <span>{contract.modality ?? "Modalidad no publicada"}</span>
                {contract.territoryName ? <span>{contract.territoryName}</span> : null}
                {contract.sourceUrl ? (
                  <a href={contract.sourceUrl} target="_blank" rel="noreferrer noopener">
                    Ver en SECOP ↗
                  </a>
                ) : null}
              </div>

              {/* La lectura previa va debajo del objeto, no encima: quien revisa lee primero el
                  contrato y después lo que opinó la máquina. Al revés se ancla en la sugerencia y
                  el sesgo es justo lo que este flujo existe para evitar. */}
              {contract.triage ? (
                <div className={styles.reviewTriage} data-verdict={contract.triage.verdict}>
                  <p className={styles.reviewTriageTop}>
                    <strong>{TRIAGE_LABEL[contract.triage.verdict]}</strong>
                    <span>
                      lectura automática · {Math.round(contract.triage.confidence * 100)}% ·{" "}
                      {contract.triage.model}
                    </span>
                  </p>
                  <p className={styles.reviewTriageWhy}>{contract.triage.rationale}</p>
                </div>
              ) : null}

              {contract.relevanceSignals &&
              (contract.relevanceSignals.emergencyTerms.length > 0 ||
                contract.relevanceSignals.declaredUrgency) ? (
                <div className={styles.reviewSignals}>
                  {contract.relevanceSignals.emergencyTerms.map((term) => (
                    <span key={term}>{term}</span>
                  ))}
                  {contract.relevanceSignals.declaredUrgency ? (
                    <span className={styles.strong}>urgencia manifiesta</span>
                  ) : null}
                </div>
              ) : null}

              <label className={styles.reviewNote}>
                <span>Nota de la decisión (opcional, queda en el registro)</span>
                <input
                  type="text"
                  value={notes[contract.id] ?? ""}
                  maxLength={2000}
                  placeholder="Ej. objeto verificado contra el decreto de urgencia"
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [contract.id]: event.target.value }))
                  }
                />
              </label>

              <div className={styles.reviewActions}>
                <button
                  type="button"
                  className={styles.confirm}
                  disabled={busyId === contract.id}
                  onClick={() => void decide(contract, "confirmed")}
                >
                  Es de la emergencia
                </button>
                <button
                  type="button"
                  className={styles.discard}
                  disabled={busyId === contract.id}
                  onClick={() => void decide(contract, "unrelated")}
                >
                  No está relacionado
                </button>
                <button
                  type="button"
                  className={styles.defer}
                  disabled={busyId === contract.id}
                  onClick={() => void decide(contract, "probable")}
                >
                  No me alcanza para decidir
                </button>
              </div>
              <small className={styles.reviewProvenance}>
                {contract.provenance.sourceSystem} · {contract.provenance.sourceReference}
              </small>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
