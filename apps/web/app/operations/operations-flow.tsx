"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ContractReview } from "./contract-review";
import { DuplicateTray } from "./duplicate-tray";
import styles from "./operations.module.css";
import { RecordDelivery } from "./record-delivery";
import { RegistryQueue } from "./registry-queue";

type OperationsSession = {
  sessionToken: string;
  sessionExpiresAt: string;
  actor: {
    id: string;
    incidentId: string;
    displayName: string;
    role: "coordinator" | "auditor" | "incident_admin";
  };
  incident: { id: string; code: string; name: string };
};

type AssessmentSummary = {
  totalAssessments: number;
  affectedHouseholds: number;
  affectedPeople: number;
  urgency: { urgent: number; immediate: number };
  severity: { critical: number };
  damages: Array<{ type: string; count: number }>;
  needs: Array<{ type: string; count: number }>;
  zones: Array<{
    zoneId: string;
    zoneName: string;
    assessments: number;
    critical: number;
    urgent: number;
    affectedPeople: number;
  }>;
  calculatedAt: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const damageLabels: Record<string, string> = {
  housing: "Viviendas",
  infrastructure: "Infraestructura",
  access: "Vías o acceso",
  utilities: "Servicios",
  health: "Salud",
  livelihoods: "Medios de vida",
  animals: "Animales",
};
const needLabels: Record<string, string> = {
  shelter: "Alojamiento",
  water: "Agua",
  food: "Alimentos",
  medical: "Atención médica",
  sanitation: "Saneamiento",
  construction_materials: "Materiales",
  animal_care: "Atención animal",
  communications: "Comunicación",
  transport: "Transporte",
};

const getDeviceId = () => {
  const existing = localStorage.getItem("pulso-operations-device-id");
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem("pulso-operations-device-id", created);
  return created;
};

export function OperationsFlow() {
  const [code, setCode] = useState("");
  const [session, setSession] = useState<OperationsSession | null>(null);
  const [summary, setSummary] = useState<AssessmentSummary | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);

  const loadSummary = useCallback(async (activeSession: OperationsSession) => {
    const response = await fetch(
      `${apiUrl}/v1/operations/incidents/${activeSession.incident.id}/assessment-summary`,
      { headers: { Authorization: `Bearer ${activeSession.sessionToken}` } },
    );
    if (!response.ok) throw new Error("No fue posible actualizar el resumen.");
    setSummary((await response.json()) as AssessmentSummary);
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.search);
    const invitationCode = params.get("code") ?? "";
    setCode(invitationCode);
    if (invitationCode) window.history.replaceState({}, "", "/operations");
    const stored = sessionStorage.getItem("pulso-operations-session");
    if (!stored) return;
    let parsed: OperationsSession;
    try {
      parsed = JSON.parse(stored) as OperationsSession;
    } catch {
      sessionStorage.removeItem("pulso-operations-session");
      return;
    }
    if (parsed.sessionExpiresAt <= new Date().toISOString()) {
      sessionStorage.removeItem("pulso-operations-session");
      return;
    }
    setSession(parsed);
    void loadSummary(parsed).catch(() => setMessage("Vuelve a ingresar para actualizar."));
  }, [loadSummary]);

  const enter = async () => {
    if (code.trim().length < 6) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/v1/operations-access/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, deviceId: getDeviceId() }),
      });
      if (!response.ok) throw new Error("El acceso venció o ya fue utilizado.");
      const opened = (await response.json()) as OperationsSession;
      sessionStorage.setItem("pulso-operations-session", JSON.stringify(opened));
      window.history.replaceState({}, "", "/operations");
      setSession(opened);
      await loadSummary(opened);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible ingresar.");
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    sessionStorage.removeItem("pulso-operations-session");
    setSession(null);
    setSummary(null);
    setCode("");
  };

  if (!session) {
    return (
      <main className={styles.shell}>
        <header className={styles.topbar}>
          <a href="/" className={styles.brand}>
            PULSO
          </a>
          <span>Acceso protegido</span>
        </header>
        <section className={styles.login} aria-labelledby="operations-login-title">
          <p className={styles.eyebrow}>Centro operacional</p>
          <h1 id="operations-login-title">Entra con tu código seguro</h1>
          <p>Un solo paso. El código identifica tu rol y la emergencia autorizada.</p>
          <label>
            Código de acceso
            <input
              autoComplete="one-time-code"
              inputMode="text"
              maxLength={16}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => event.key === "Enter" && void enter()}
              placeholder="Ej. 7KDM4PX9QH"
            />
          </label>
          <button type="button" onClick={() => void enter()} disabled={busy || code.length < 6}>
            {busy ? "Validando…" : "Abrir centro operacional"}
          </button>
          {message && (
            <p className={styles.error} role="alert">
              {message}
            </p>
          )}
          <small>El código se usa una sola vez y no contiene datos personales.</small>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <a href="/" className={styles.brand}>
          PULSO
        </a>
        <button type="button" className={styles.leave} onClick={leave}>
          Salir
        </button>
      </header>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Centro operacional · datos protegidos</p>
          <h1>{session.incident.name}</h1>
          <p>Hola, {session.actor.displayName}. Resumen consolidado de todas las misiones.</p>
        </div>
        <button type="button" className={styles.refresh} onClick={() => void loadSummary(session)}>
          Actualizar
        </button>
      </section>

      {summary ? (
        <>
          <section className={styles.metrics} aria-label="Indicadores principales">
            <article>
              <strong>{summary.totalAssessments}</strong>
              <span>Reportes</span>
            </article>
            <article>
              <strong>{summary.affectedHouseholds}</strong>
              <span>Hogares</span>
            </article>
            <article>
              <strong>{summary.affectedPeople}</strong>
              <span>Personas</span>
            </article>
            <article>
              <strong>{summary.urgency.urgent + summary.urgency.immediate}</strong>
              <span>Urgentes</span>
            </article>
            <article>
              <strong>{summary.severity.critical}</strong>
              <span>Críticos</span>
            </article>
          </section>

          <section className={styles.grid}>
            <article className={styles.panel}>
              <p className={styles.eyebrow}>Presión territorial</p>
              <h2>Zonas que requieren acción</h2>
              {summary.zones.length ? (
                <ol className={styles.zones}>
                  {summary.zones.slice(0, 8).map((zone) => (
                    <li key={zone.zoneId}>
                      <div>
                        <strong>{zone.zoneName}</strong>
                        <span>
                          {zone.assessments} {zone.assessments === 1 ? "reporte" : "reportes"} ·{" "}
                          {zone.affectedPeople} personas
                        </span>
                      </div>
                      <b>
                        {zone.urgent} {zone.urgent === 1 ? "urgente" : "urgentes"}
                      </b>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.empty}>Todavía no hay reportes sincronizados.</p>
              )}
            </article>
            <aside className={styles.panel}>
              <p className={styles.eyebrow}>Lectura rápida</p>
              <h2>Daños y necesidades</h2>
              <h3>Daños principales</h3>
              <ul className={styles.ranking}>
                {summary.damages.slice(0, 5).map((item) => (
                  <li key={item.type}>
                    <span>{damageLabels[item.type] ?? item.type}</span>
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
              <h3>Necesidades principales</h3>
              <ul className={styles.ranking}>
                {summary.needs.slice(0, 5).map((item) => (
                  <li key={item.type}>
                    <span>{needLabels[item.type] ?? item.type}</span>
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            </aside>
          </section>
          <p className={styles.updated}>
            Actualizado {new Date(summary.calculatedAt).toLocaleString("es-CO")} · No incluye
            nombres, notas ni fotografías.
          </p>

          {/* La cola del censo va antes de la revisión de contratos: decidir sobre una familia que
              dice no haber sido censada es más urgente que revisar un contrato. */}
          <RecordDelivery incidentId={session.incident.id} sessionToken={session.sessionToken} />

          <RegistryQueue incidentId={session.incident.id} sessionToken={session.sessionToken} />

          {/* Va justo después de la cola porque es la misma pregunta un paso más allá: la cola
              decide sobre un registro, la bandeja decide si dos registros son uno. */}
          <DuplicateTray
            incidentId={session.incident.id}
            sessionToken={session.sessionToken}
            role={session.actor.role}
          />

          <ContractReview incidentId={session.incident.id} sessionToken={session.sessionToken} />
        </>
      ) : (
        <p className={styles.loading}>Preparando el resumen de la emergencia…</p>
      )}
    </main>
  );
}
