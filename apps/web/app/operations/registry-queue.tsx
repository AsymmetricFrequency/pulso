"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./operations.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type QueueItem = {
  registrationId: string;
  publicCode: string;
  neighborhood: string | null;
  territoryName: string | null;
  peopleCount: number;
  dwellingStatus: string;
  shelteringAt: string;
  officiallyCensused: string;
  signal: "coherente" | "sin_contraste" | "revisar" | null;
  checks: Record<string, unknown> | null;
  evidenceLevel: "declarada" | "contrastada" | "con_foto" | "reforzada" | "auditado";
  evidenceCount: number;
  hasContact: boolean;
  reviewedOutcome: string | null;
  createdAt: string;
};

/**
 * Qué dice cada señal, escrito para quien va a decidir.
 *
 * `sin_contraste` lleva su propia explicación porque es el que más fácil se malinterpreta: no es
 * sospecha, es que no hay con qué comparar — el caso normal en un municipio del que no hay dato,
 * que es justamente donde más falta hace que alguien se registre.
 */
const SIGNAL: Record<string, { label: string; tone: string; help: string }> = {
  coherente: {
    label: "Coherente",
    tone: "light",
    help: "Encaja con la sacudida del USGS y con daños que otras fuentes ya reportaban.",
  },
  sin_contraste: {
    label: "Sin contraste",
    tone: "unknown",
    help: "No hay con qué comparar. No es sospecha: es lo normal donde no hay dato.",
  },
  revisar: {
    label: "Revisar",
    tone: "severe",
    help: "Algo no cuadra con la evidencia independiente. Mira antes de decidir.",
  },
};

const LEVEL_LABEL: Record<string, string> = {
  declarada: "Declarada",
  contrastada: "Contrastada",
  con_foto: "Con foto",
  reforzada: "Reforzada",
  auditado: "Auditado",
};

const DWELLING_LABEL: Record<string, string> = {
  destruida: "Destruida",
  inhabitable: "Inhabitable",
  con_danos: "Con daños",
  sin_danos: "Sin daños",
  no_sabe: "No sabe",
};

const OUTCOMES = [
  { value: "respaldado", label: "Respaldado" },
  { value: "sin_evidencia", label: "Sin evidencia" },
  { value: "duplicado", label: "Duplicado" },
  { value: "inconsistente", label: "Inconsistente" },
] as const;

const EVIDENCE_KINDS = [
  { value: "visita_en_terreno", label: "Visita en terreno" },
  { value: "llamada", label: "Llamada" },
  { value: "lista_oficial", label: "Lista oficial" },
  { value: "senales_automaticas", label: "Señales automáticas" },
  { value: "otro", label: "Otro" },
] as const;

export function RegistryQueue({
  incidentId,
  sessionToken,
}: {
  incidentId: string;
  sessionToken: string;
}) {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `${apiUrl}/v1/operations/incidents/${incidentId}/registry-queue?limit=100`,
        { headers: { Authorization: `Bearer ${sessionToken}` } },
      );
      if (!response.ok) throw new Error("queue unavailable");
      setItems((await response.json()) as QueueItem[]);
    } catch {
      setItems([]);
    }
  }, [incidentId, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (item: QueueItem, event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/v1/operations/incidents/${incidentId}/registry-queue/${item.registrationId}/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            outcome: form.get("outcome"),
            rationale: String(form.get("rationale") ?? "").trim(),
            evidenceKind: form.get("evidenceKind"),
          }),
        },
      );
      if (!response.ok) {
        setError("No se pudo guardar. El motivo necesita al menos 10 caracteres.");
        return;
      }
      setOpen(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (items === null) {
    return <p className={styles.loading}>Cargando la cola del censo comunitario…</p>;
  }

  if (items.length === 0) {
    // Cero pendientes no es cero trabajo hecho: dicho así, evita que se lea como que algo falla.
    return (
      <section className={styles.queueSection} aria-labelledby="queue-title">
        <h2 id="queue-title">Cola del censo comunitario</h2>
        <p className={styles.queueEmpty}>
          No hay registros pendientes. Aparecerán aquí en cuanto una familia se registre, ordenados
          por lo que más urge mirar — no por orden de llegada.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.queueSection} aria-labelledby="queue-title">
      <div className={styles.queueHeading}>
        <h2 id="queue-title">Cola del censo comunitario</h2>
        <span>{items.length} registros</span>
      </div>

      {/* El orden es la política de la cola, y decirlo evita que alguien lo lea como desorden. */}
      <p className={styles.queueNote}>
        Ordenados por lo que más urge mirar: primero lo que el cruce automático marcó para revisar,
        y dentro de eso los hogares con más personas.{" "}
        <strong>Ninguna señal descarta a nadie</strong> — la decisión la firmas tú.
      </p>

      <ul className={styles.queueList}>
        {items.map((item) => {
          const signal = item.signal ? SIGNAL[item.signal] : null;
          return (
            <li key={item.registrationId} className={styles.queueItem}>
              <div className={styles.queueItemHead}>
                <div>
                  <strong>
                    {item.neighborhood ?? "Sin barrio"}
                    {item.territoryName ? ` · ${item.territoryName}` : ""}
                  </strong>
                  <small>
                    {item.peopleCount} {item.peopleCount === 1 ? "persona" : "personas"} ·{" "}
                    {DWELLING_LABEL[item.dwellingStatus] ?? item.dwellingStatus} ·{" "}
                    {item.officiallyCensused === "no"
                      ? "dice que no los han censado"
                      : "ya censados"}
                  </small>
                </div>
                <div className={styles.queueBadges}>
                  {signal ? (
                    <span className={`coverageBadge ${signal.tone}`} title={signal.help}>
                      {signal.label}
                    </span>
                  ) : null}
                  <span className={styles.queueLevel}>
                    {LEVEL_LABEL[item.evidenceLevel] ?? item.evidenceLevel}
                  </span>
                  {item.evidenceCount > 0 ? (
                    <span className={styles.queueLevel}>
                      {item.evidenceCount} {item.evidenceCount === 1 ? "foto" : "fotos"}
                    </span>
                  ) : null}
                </div>
              </div>

              {signal ? <p className={styles.queueSignalHelp}>{signal.help}</p> : null}

              {item.reviewedOutcome ? (
                <p className={styles.queueReviewed}>
                  Ya revisado: <strong>{item.reviewedOutcome}</strong>
                </p>
              ) : null}

              {open === item.registrationId ? (
                <form className={styles.queueForm} onSubmit={(event) => review(item, event)}>
                  <label>
                    <span>Conclusión</span>
                    <select name="outcome" defaultValue="respaldado">
                      {OUTCOMES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>En qué te apoyaste</span>
                    <select name="evidenceKind" defaultValue="senales_automaticas">
                      {EVIDENCE_KINDS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.queueRationale}>
                    <span>Por qué</span>
                    {/* Obligatorio: una auditoría que dice quién y no dice con qué se apoyó no se
                        puede revisar después, que es para lo que existe. */}
                    <textarea
                      name="rationale"
                      required
                      minLength={10}
                      maxLength={1000}
                      rows={3}
                      placeholder="Qué te llevó a esta conclusión. Queda firmado con tu nombre."
                    />
                  </label>
                  {error ? <p className={styles.queueError}>{error}</p> : null}
                  <div className={styles.queueActions}>
                    <button type="submit" disabled={saving}>
                      {saving ? "Guardando…" : "Firmar la revisión"}
                    </button>
                    <button type="button" onClick={() => setOpen(null)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className={styles.queueOpen}
                  onClick={() => setOpen(item.registrationId)}
                >
                  Revisar este registro
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
