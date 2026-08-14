"use client";

import { type FormEvent, useEffect, useState } from "react";
import { cacheMissionPackage, queueFieldVisit } from "../lib/offline-visit-queue";
import styles from "./field.module.css";

type FlowStep = "access" | "mission" | "ready" | "active";

const mission = {
  zoneReference: "Zona SJDP-01",
  teamName: "Brigada Norte",
  objective: "Confirmar acceso y realizar evaluación rápida de habitabilidad.",
  location: "San José del Palmar · Sector norte",
  window: "Hoy · 11:00–17:00",
};

const fieldTasks = [
  "Confirmar acceso a la zona",
  "Registrar viviendas observadas",
  "Guardar evidencia esencial",
];

export function FieldFlow() {
  const [step, setStep] = useState<FlowStep>("access");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  const openMission = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (code.length < 6) {
      setError("Revisa el código. Debe tener al menos 6 caracteres.");
      return;
    }
    setError("");
    setStep("mission");
  };

  const saveMission = async () => {
    setBusy(true);
    try {
      await cacheMissionPackage({ code, ...mission });
      setStep("ready");
    } catch {
      setError("Este dispositivo no pudo guardar la misión. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const startVisit = async () => {
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
          <li className={step === "ready" ? styles.current : ""}>3</li>
        </ol>
      )}

      {step === "access" && (
        <section className={styles.card} aria-labelledby="access-title">
          <p className={styles.eyebrow}>Entrada rápida</p>
          <h1 id="access-title">Abre tu misión</h1>
          <p className={styles.lead}>
            Escribe el código que recibiste de coordinación. No necesitas crear una contraseña.
          </p>
          <form onSubmit={openMission} className={styles.form}>
            <label htmlFor="mission-code">Código de misión</label>
            <input
              id="mission-code"
              name="mission-code"
              value={code}
              onChange={(event) =>
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 8),
                )
              }
              placeholder="Ej. SJDP01"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              enterKeyHint="go"
              aria-describedby={error ? "code-error" : "code-help"}
            />
            <span id="code-help" className={styles.help}>
              También podrás abrirla desde un enlace o código QR.
            </span>
            {error && (
              <p className={styles.error} id="code-error" role="alert">
                {error}
              </p>
            )}
            <button className={styles.primaryButton} type="submit">
              Ver mi misión
            </button>
          </form>
        </section>
      )}

      {step === "mission" && (
        <section className={styles.card} aria-labelledby="mission-title">
          <p className={styles.eyebrow}>Confirma antes de guardar</p>
          <h1 id="mission-title">Esta es tu misión</h1>
          <div className={styles.missionIdentity}>
            <span>{mission.teamName}</span>
            <strong>{mission.zoneReference}</strong>
            <p>{mission.location}</p>
          </div>
          <dl className={styles.details}>
            <div>
              <dt>Objetivo</dt>
              <dd>{mission.objective}</dd>
            </div>
            <div>
              <dt>Horario</dt>
              <dd>{mission.window}</dd>
            </div>
          </dl>
          {error && <p className={styles.error}>{error}</p>}
          <button
            className={styles.primaryButton}
            type="button"
            onClick={saveMission}
            disabled={busy}
          >
            {busy ? "Guardando…" : "Guardar para usar sin conexión"}
          </button>
          <button className={styles.textButton} type="button" onClick={() => setStep("access")}>
            Usar otro código
          </button>
        </section>
      )}

      {step === "ready" && (
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
            {busy ? "Iniciando…" : "Comenzar visita"}
          </button>
          <p className={styles.safetyNote}>
            Confirma que estás en un lugar seguro antes de comenzar.
          </p>
        </section>
      )}

      {step === "active" && (
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
        <span>Entorno de demostración</span>
        <a href="/">Centro operacional</a>
      </footer>
    </main>
  );
}
