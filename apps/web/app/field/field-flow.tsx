"use client";

import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { prepareFieldEvidence } from "../lib/field-evidence";
import {
  cacheMissionPackage,
  getLatestCachedMission,
  queueFieldEvidence,
  queueFieldVisit,
  queueRapidAssessment,
  syncQueuedAssessments,
  syncQueuedEvidence,
} from "../lib/offline-visit-queue";
import styles from "./field.module.css";

type FlowStep = "access" | "mission" | "unlock" | "ready" | "active";

type Mission = {
  assignmentId: string;
  incidentId: string;
  actorId: string;
  actorName: string;
  teamId: string;
  teamName: string;
  zoneId: string;
  zoneReference: string;
  location: string;
  objective: string;
  startsAt: string;
  dueAt: string | null;
};

type FieldSession = {
  sessionToken: string;
  sessionExpiresAt: string;
  passkeyRegistered: boolean;
  mission: Mission;
};

type TrustProfile = {
  actorId: string;
  assuranceLevel: "A0" | "A1" | "A2" | "A3" | "A4";
  badges: string[];
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const fieldTasks = [
  "Confirmar acceso a la zona",
  "Registrar viviendas observadas",
  "Guardar evidencia esencial",
];

const trustLabels: Record<TrustProfile["assuranceLevel"], string> = {
  A0: "Registro de misión",
  A1: "Contacto verificado",
  A2: "Brigada respaldada",
  A3: "Profesional verificado",
  A4: "Auditoría reforzada",
};

const damageOptions = [
  ["housing", "Viviendas"],
  ["infrastructure", "Infraestructura"],
  ["access", "Vías o acceso"],
  ["utilities", "Servicios"],
  ["health", "Salud"],
  ["livelihoods", "Medios de vida"],
  ["animals", "Animales"],
] as const;

const needOptions = [
  ["shelter", "Alojamiento"],
  ["water", "Agua"],
  ["food", "Alimentos"],
  ["healthcare", "Atención médica"],
  ["sanitation", "Saneamiento"],
  ["construction_materials", "Materiales"],
  ["animal_care", "Atención animal"],
  ["communications", "Comunicación"],
  ["transport", "Transporte"],
] as const;

const getDeviceId = () => {
  const existing = localStorage.getItem("pulso-device-id");
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem("pulso-device-id", created);
  return created;
};

const normalizeCode = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);

const explainApiError = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return body?.message ?? "No pudimos abrir la misión. Verifica el código e intenta nuevamente.";
};

export function FieldFlow() {
  const [step, setStep] = useState<FlowStep>("access");
  const [code, setCode] = useState("");
  const [session, setSession] = useState<FieldSession | null>(null);
  const [trustProfile, setTrustProfile] = useState<TrustProfile | null>(null);
  const [error, setError] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyProtected, setPasskeyProtected] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [damageTypes, setDamageTypes] = useState<string[]>([]);
  const [needTypes, setNeedTypes] = useState<string[]>([]);
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [urgency, setUrgency] = useState<"routine" | "priority" | "urgent" | "immediate">(
    "priority",
  );
  const [affectedHouseholds, setAffectedHouseholds] = useState(0);
  const [affectedPeople, setAffectedPeople] = useState(0);
  const [assessmentNotes, setAssessmentNotes] = useState("");
  const [assessmentMessage, setAssessmentMessage] = useState("");
  const [lastAssessmentMutationId, setLastAssessmentMutationId] = useState<string | null>(null);
  const [evidenceMessage, setEvidenceMessage] = useState("");
  const invitationOpened = useRef(false);
  const mission = session?.mission ?? null;

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    if (browserSupportsWebAuthn()) {
      void platformAuthenticatorIsAvailable()
        .then(setPasskeyAvailable)
        .catch(() => undefined);
    }
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  const redeemMission = useCallback(async (missionCode: string) => {
    if (!navigator.onLine) {
      setError("Necesitas conexión solo para abrir la misión por primera vez.");
      return;
    }
    setBusy(true);
    setError("");
    setTrustProfile(null);
    try {
      const response = await fetch(`${apiUrl}/v1/field-access/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: missionCode, deviceId: getDeviceId() }),
      });
      if (!response.ok) throw new Error(await explainApiError(response));
      const opened = (await response.json()) as FieldSession;
      setSession(opened);
      setPasskeyProtected(opened.passkeyRegistered);
      setStep("mission");
      try {
        await cacheMissionPackage({
          code: missionCode,
          ...opened.mission,
          sessionToken: opened.sessionToken,
          sessionExpiresAt: opened.sessionExpiresAt,
          passkeyRegistered: opened.passkeyRegistered,
        });
      } catch {
        setError("La misión está abierta, pero aún no se guardó para trabajar sin señal.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos abrir la misión.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!session || !isOnline) return;
    const controller = new AbortController();
    void fetch(`${apiUrl}/v1/actors/${session.mission.actorId}/trust-profile`, {
      headers: { Authorization: `Bearer ${session.sessionToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as TrustProfile;
      })
      .then((profile) => {
        if (profile) setTrustProfile(profile);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [isOnline, session]);

  useEffect(() => {
    if (!session || !isOnline) return;
    void syncQueuedAssessments(apiUrl, session.sessionToken)
      .then(async (result) => {
        if (result.synced > 0) {
          setAssessmentMessage(
            `${result.synced} reporte${result.synced === 1 ? " fue enviado" : "s fueron enviados"}.`,
          );
        }
        await syncQueuedEvidence(apiUrl, session.sessionToken);
      })
      .catch(() => undefined);
  }, [isOnline, session]);

  useEffect(() => {
    if (invitationOpened.current) return;
    const invitedCode = normalizeCode(
      new URLSearchParams(window.location.search).get("code") ?? "",
    );
    if (!invitedCode) return;
    invitationOpened.current = true;
    setCode(invitedCode);
    void redeemMission(invitedCode);
  }, [redeemMission]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("code")) return;
    void getLatestCachedMission()
      .then((cached) => {
        if (!cached) return;
        const {
          code: cachedCode,
          sessionToken,
          sessionExpiresAt,
          passkeyRegistered,
          downloadedAt: _downloadedAt,
          ...cachedMission
        } = cached;
        setCode(cachedCode);
        setSession({
          sessionToken,
          sessionExpiresAt,
          passkeyRegistered,
          mission: cachedMission,
        });
        setPasskeyProtected(passkeyRegistered);
        if (sessionExpiresAt > new Date().toISOString()) {
          setStep("ready");
        } else if (passkeyRegistered && navigator.onLine) {
          setStep("unlock");
        } else {
          setError("Puedes continuar sin señal. Validaremos tu acceso al recuperar conexión.");
          setStep("ready");
        }
      })
      .catch(() => undefined);
  }, []);

  const openMission = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (code.length !== 10) {
      setError("Revisa el código. Debe tener 10 caracteres.");
      return;
    }
    void redeemMission(code);
  };

  const saveMission = async () => {
    if (!session || !mission) return;
    setBusy(true);
    try {
      await cacheMissionPackage({
        code,
        ...mission,
        sessionToken: session.sessionToken,
        sessionExpiresAt: session.sessionExpiresAt,
        passkeyRegistered: passkeyProtected,
      });
      setStep("ready");
    } catch {
      setError("Este dispositivo no pudo guardar la misión. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const protectDevice = async () => {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const optionsResponse = await fetch(
        `${apiUrl}/v1/field-access/passkeys/registration/options`,
        { method: "POST", headers: { Authorization: `Bearer ${session.sessionToken}` } },
      );
      if (!optionsResponse.ok) throw new Error(await explainApiError(optionsResponse));
      const optionsJSON = (await optionsResponse.json()) as PublicKeyCredentialCreationOptionsJSON;
      const registration = await startRegistration({ optionsJSON });
      const verification = await fetch(`${apiUrl}/v1/field-access/passkeys/registration/verify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(registration),
      });
      if (!verification.ok) throw new Error(await explainApiError(verification));
      if (mission) {
        await cacheMissionPackage({
          code,
          ...mission,
          sessionToken: session.sessionToken,
          sessionExpiresAt: session.sessionExpiresAt,
          passkeyRegistered: true,
        });
      }
      setPasskeyProtected(true);
    } catch (caught) {
      if (caught instanceof Error && caught.name === "NotAllowedError") return;
      setError("No activamos la protección. Puedes continuar y hacerlo después.");
    } finally {
      setBusy(false);
    }
  };

  const unlockWithPasskey = async () => {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const optionsResponse = await fetch(
        `${apiUrl}/v1/field-access/passkeys/authentication/options`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actorId: session.mission.actorId,
            assignmentId: session.mission.assignmentId,
            deviceId: getDeviceId(),
          }),
        },
      );
      if (!optionsResponse.ok) throw new Error(await explainApiError(optionsResponse));
      const ceremony = (await optionsResponse.json()) as {
        attemptId: string;
        options: PublicKeyCredentialRequestOptionsJSON;
      };
      const authentication = await startAuthentication({ optionsJSON: ceremony.options });
      const verification = await fetch(`${apiUrl}/v1/field-access/passkeys/authentication/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: ceremony.attemptId, response: authentication }),
      });
      if (!verification.ok) throw new Error(await explainApiError(verification));
      const refreshed = (await verification.json()) as FieldSession;
      await cacheMissionPackage({
        code,
        ...refreshed.mission,
        sessionToken: refreshed.sessionToken,
        sessionExpiresAt: refreshed.sessionExpiresAt,
        passkeyRegistered: true,
      });
      setSession(refreshed);
      setPasskeyProtected(true);
      setStep("ready");
    } catch (caught) {
      if (caught instanceof Error && caught.name === "NotAllowedError") return;
      setError("No pudimos validar el acceso. Puedes intentarlo nuevamente.");
    } finally {
      setBusy(false);
    }
  };

  const startVisit = async () => {
    if (!mission) return;
    setBusy(true);
    try {
      await queueFieldVisit(mission.zoneReference);
      setStep("active");
    } catch {
      setError("No pudimos iniciar la visita en este dispositivo.");
    } finally {
      setBusy(false);
    }
  };

  const toggleTask = (task: string) => {
    setCompletedTasks((current) =>
      current.includes(task) ? current.filter((item) => item !== task) : [...current, task],
    );
  };

  const toggleOption = (value: string, current: string[], update: (next: string[]) => void) => {
    update(
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  };

  const saveAssessment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || damageTypes.length + needTypes.length === 0) {
      setAssessmentMessage("Selecciona al menos un daño o una necesidad.");
      return;
    }
    setBusy(true);
    setAssessmentMessage("");
    try {
      const assessmentClientMutationId = crypto.randomUUID();
      await queueRapidAssessment({
        clientMutationId: assessmentClientMutationId,
        deviceId: getDeviceId(),
        observedAt: new Date().toISOString(),
        damageTypes,
        severity,
        needTypes,
        urgency,
        affectedHouseholds,
        affectedPeople,
        notes: assessmentNotes.trim() || null,
      });
      const result = isOnline
        ? await syncQueuedAssessments(apiUrl, session.sessionToken)
        : { synced: 0, pending: 1 };
      setAssessmentMessage(
        result.pending === 0
          ? "Reporte enviado. Puedes registrar otro hallazgo."
          : "Reporte guardado en este dispositivo. Se enviará al recuperar señal.",
      );
      setLastAssessmentMutationId(assessmentClientMutationId);
      setAssessmentOpen(false);
      setDamageTypes([]);
      setNeedTypes([]);
      setAffectedHouseholds(0);
      setAffectedPeople(0);
      setAssessmentNotes("");
    } catch {
      setAssessmentMessage("No pudimos guardar el reporte en este dispositivo.");
    } finally {
      setBusy(false);
    }
  };

  const addEvidence = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !session || !lastAssessmentMutationId) return;
    setBusy(true);
    setEvidenceMessage("Preparando imagen…");
    try {
      const prepared = await prepareFieldEvidence(file, lastAssessmentMutationId);
      await queueFieldEvidence(prepared);
      const result = isOnline
        ? await syncQueuedEvidence(apiUrl, session.sessionToken)
        : { synced: 0, pending: 1 };
      setEvidenceMessage(
        result.pending === 0
          ? "Foto verificada y enviada."
          : "Foto guardada aquí. Se enviará al recuperar señal.",
      );
    } catch {
      setEvidenceMessage("No pudimos preparar esta foto. Intenta con otra imagen.");
    } finally {
      setBusy(false);
    }
  };

  const missionWindow = mission
    ? `${new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(mission.startsAt))}${mission.dueAt ? ` – ${new Intl.DateTimeFormat("es-CO", { timeStyle: "short" }).format(new Date(mission.dueAt))}` : ""}`
    : "";

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="Volver a PULSO ATLAS">
          <span className={styles.brandMark} aria-hidden="true" />
          <span>PULSO</span>
        </a>
        <span className={`${styles.connection} ${isOnline ? styles.online : styles.offline}`}>
          <i aria-hidden="true" />
          {isOnline ? "Con conexión" : "Sin conexión"}
        </span>
      </header>

      {step !== "active" && (
        <ol className={styles.progress} aria-label="Progreso para comenzar">
          <li className={step === "access" ? styles.current : styles.done}>1</li>
          <li
            className={step === "mission" ? styles.current : step === "access" ? "" : styles.done}
          >
            2
          </li>
          <li className={step === "ready" || step === "unlock" ? styles.current : ""}>3</li>
        </ol>
      )}

      {step === "access" && (
        <section className={styles.card} aria-labelledby="access-title">
          <p className={styles.eyebrow}>Entrada rápida</p>
          <h1 id="access-title">Abre tu misión</h1>
          <p className={styles.lead}>
            Abre el enlace que recibiste o escribe el código. Sin cuenta ni contraseña.
          </p>
          <form onSubmit={openMission} className={styles.form}>
            <label htmlFor="mission-code">Código de misión</label>
            <input
              id="mission-code"
              name="mission-code"
              value={code}
              onChange={(event) => setCode(normalizeCode(event.target.value))}
              placeholder="Ej. 7K4M9P2R8T"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              enterKeyHint="go"
              aria-describedby={error ? "code-error" : "code-help"}
            />
            <span id="code-help" className={styles.help}>
              El enlace o QR completa este código automáticamente.
            </span>
            {error && (
              <p className={styles.error} id="code-error" role="alert">
                {error}
              </p>
            )}
            <button className={styles.primaryButton} type="submit" disabled={busy}>
              {busy ? "Abriendo…" : "Ver mi misión"}
            </button>
          </form>
        </section>
      )}

      {step === "mission" && mission && (
        <section className={styles.card} aria-labelledby="mission-title">
          <p className={styles.eyebrow}>Hola, {mission.actorName}</p>
          <h1 id="mission-title">Esta es tu misión</h1>
          <div className={styles.missionIdentity}>
            <span>{mission.teamName}</span>
            <strong>{mission.zoneReference}</strong>
            <p>{mission.location}</p>
          </div>
          {trustProfile && (
            <section className={styles.trustCard} aria-label="Confianza para esta misión">
              <span className={styles.trustMark} aria-hidden="true">
                ✓
              </span>
              <div>
                <span>Validación para esta misión</span>
                <strong>{trustLabels[trustProfile.assuranceLevel]}</strong>
                <p>
                  {trustProfile.badges.length > 0
                    ? trustProfile.badges.slice(0, 2).join(" · ")
                    : "Puedes reportar y trabajar en las tareas asignadas."}
                </p>
              </div>
              <small>{trustProfile.assuranceLevel}</small>
            </section>
          )}
          <dl className={styles.details}>
            <div>
              <dt>Objetivo</dt>
              <dd>{mission.objective}</dd>
            </div>
            <div>
              <dt>Horario</dt>
              <dd>{missionWindow}</dd>
            </div>
          </dl>
          {error && <p className={styles.error}>{error}</p>}
          <button
            className={styles.primaryButton}
            type="button"
            onClick={saveMission}
            disabled={busy}
          >
            {busy ? "Guardando…" : "Continuar y usar sin conexión"}
          </button>
          <button className={styles.textButton} type="button" onClick={() => setStep("access")}>
            Usar otro código
          </button>
        </section>
      )}

      {step === "ready" && mission && (
        <section className={`${styles.card} ${styles.centered}`} aria-labelledby="ready-title">
          <span className={styles.successMark} aria-hidden="true">
            ✓
          </span>
          <p className={styles.eyebrow}>Todo listo</p>
          <h1 id="ready-title">La misión está en este dispositivo</h1>
          <p className={styles.lead}>
            Puedes continuar aunque pierdas la señal. Tus avances se guardarán aquí.
          </p>
          {error && <p className={styles.error}>{error}</p>}
          <button
            className={styles.primaryButton}
            type="button"
            onClick={startVisit}
            disabled={busy}
          >
            {busy ? "Preparando…" : "Comenzar visita"}
          </button>
          {passkeyAvailable && (
            <div className={styles.optionalProtection}>
              <span>Opcional</span>
              <strong>
                {passkeyProtected
                  ? "Acceso biométrico configurado"
                  : "Prepara el acceso con tu teléfono"}
              </strong>
              <p>
                {passkeyProtected
                  ? "La huella, rostro o PIN quedó listo para futuras validaciones."
                  : "Se configura una sola vez. No crea una contraseña ni bloquea esta visita."}
              </p>
              {!passkeyProtected && (
                <button type="button" onClick={protectDevice} disabled={busy}>
                  Usar huella, rostro o PIN
                </button>
              )}
            </div>
          )}
          <p className={styles.safetyNote}>
            Confirma que estás en un lugar seguro antes de comenzar.
          </p>
        </section>
      )}

      {step === "unlock" && mission && (
        <section className={`${styles.card} ${styles.centered}`} aria-labelledby="unlock-title">
          <span className={styles.deviceMark} aria-hidden="true">
            ◎
          </span>
          <p className={styles.eyebrow}>Misión reconocida</p>
          <h1 id="unlock-title">Confirma que eres tú</h1>
          <p className={styles.lead}>
            Usa la huella, el rostro o el PIN del teléfono. No necesitas recordar una contraseña.
          </p>
          {error && <p className={styles.error}>{error}</p>}
          <button
            className={styles.primaryButton}
            type="button"
            onClick={unlockWithPasskey}
            disabled={busy}
          >
            {busy ? "Validando…" : "Continuar con este teléfono"}
          </button>
          <button className={styles.textButton} type="button" onClick={() => setStep("access")}>
            Usar una invitación nueva
          </button>
        </section>
      )}

      {step === "active" && mission && (
        <section className={styles.activeVisit} aria-labelledby="active-title">
          <div className={styles.activeHeader}>
            <div>
              <p className={styles.eyebrow}>Visita en curso</p>
              <h1 id="active-title">{mission.zoneReference}</h1>
              <p>{mission.location}</p>
            </div>
            <span className={styles.localBadge}>Guardado aquí</span>
          </div>
          <div className={styles.taskCard}>
            <h2>Qué debes completar</h2>
            <p>Marca cada punto a medida que avanzas.</p>
            <ul>
              {fieldTasks.map((task) => {
                const checked = completedTasks.includes(task);
                return (
                  <li key={task}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      className={checked ? styles.taskDone : ""}
                      onClick={() => toggleTask(task)}
                    >
                      <span aria-hidden="true">{checked ? "✓" : ""}</span>
                      {task}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <section className={styles.assessmentPanel} aria-labelledby="assessment-title">
            <div>
              <p className={styles.eyebrow}>Hallazgos</p>
              <h2 id="assessment-title">Daños y necesidades</h2>
              <p>Registra lo esencial. No pidas documentos ni datos personales.</p>
            </div>
            {!assessmentOpen ? (
              <button
                type="button"
                className={styles.reportButton}
                onClick={() => {
                  setAssessmentMessage("");
                  setAssessmentOpen(true);
                }}
              >
                + Registrar hallazgo
              </button>
            ) : (
              <form className={styles.assessmentForm} onSubmit={saveAssessment}>
                <fieldset>
                  <legend>¿Qué daños observaste?</legend>
                  <div className={styles.optionGrid}>
                    {damageOptions.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={damageTypes.includes(value)}
                        onClick={() => toggleOption(value, damageTypes, setDamageTypes)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className={styles.twoColumns}>
                  <label>
                    Gravedad
                    <select
                      value={severity}
                      onChange={(event) => setSeverity(event.target.value as typeof severity)}
                    >
                      <option value="low">Baja</option>
                      <option value="medium">Media</option>
                      <option value="high">Alta</option>
                      <option value="critical">Crítica</option>
                    </select>
                  </label>
                  <label>
                    Urgencia
                    <select
                      value={urgency}
                      onChange={(event) => setUrgency(event.target.value as typeof urgency)}
                    >
                      <option value="routine">Puede esperar</option>
                      <option value="priority">Prioritaria</option>
                      <option value="urgent">Urgente</option>
                      <option value="immediate">Inmediata</option>
                    </select>
                  </label>
                </div>
                <fieldset>
                  <legend>¿Qué necesitan?</legend>
                  <div className={styles.optionGrid}>
                    {needOptions.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={needTypes.includes(value)}
                        onClick={() => toggleOption(value, needTypes, setNeedTypes)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className={styles.twoColumns}>
                  <label>
                    Hogares afectados
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={affectedHouseholds}
                      onChange={(event) => setAffectedHouseholds(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    Personas aproximadas
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={affectedPeople}
                      onChange={(event) => setAffectedPeople(Number(event.target.value))}
                    />
                  </label>
                </div>
                <label>
                  Nota breve <span>(opcional)</span>
                  <textarea
                    value={assessmentNotes}
                    onChange={(event) => setAssessmentNotes(event.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Ej. cuatro cubiertas colapsadas"
                  />
                </label>
                {assessmentMessage && <p className={styles.error}>{assessmentMessage}</p>}
                <div className={styles.formActions}>
                  <button type="button" onClick={() => setAssessmentOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={busy}>
                    {busy ? "Guardando…" : "Guardar reporte"}
                  </button>
                </div>
              </form>
            )}
            {!assessmentOpen && assessmentMessage && (
              <div className={styles.savedBlock}>
                <p className={styles.savedMessage} role="status">
                  ✓ {assessmentMessage}
                </p>
                {lastAssessmentMutationId && (
                  <label className={styles.photoButton}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      onChange={addEvidence}
                      disabled={busy}
                    />
                    {busy ? "Preparando foto…" : "Añadir foto del hallazgo"}
                  </label>
                )}
                {evidenceMessage && <p className={styles.evidenceMessage}>{evidenceMessage}</p>}
              </div>
            )}
          </section>
          <div className={styles.activeFooter}>
            <span>
              {completedTasks.length} de {fieldTasks.length} puntos marcados
            </span>
            <a href="/" className={styles.secondaryButton}>
              Guardar y salir
            </a>
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <span>PULSO Field</span>
        <a href="/">Centro operacional</a>
      </footer>
    </main>
  );
}
