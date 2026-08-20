"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./operations.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Side = {
  registrationId: string;
  publicCode: string;
  neighborhood: string | null;
  territoryName: string | null;
  peopleCount: number;
  dwellingStatus: string;
  shelteringAt: string;
  officiallyCensused: string;
  hasContact: boolean;
  createdAt: string;
};

type Candidate = {
  id: string;
  signals: string[];
  strength: "fuerte" | "media";
  status: string;
  createdAt: string;
  a: Side;
  b: Side;
};

type Tray = {
  summary: {
    open: number;
    openStrong: number;
    confirmed: number;
    dismissed: number;
    registrations: number;
    lastMatchedAt: string | null;
  };
  candidates: Candidate[];
};

/**
 * Qué prueba cada señal y qué **no** prueba.
 *
 * La segunda mitad es la que importa. Un chip que dice «Mismo barrio» invita a confirmar; el mismo
 * chip diciendo que en un barrio hay muchas familias del mismo tamaño hace que quien decide mire
 * las dos columnas antes de firmar. Es la diferencia entre una bandeja que ayuda y una que fabrica
 * duplicados por comodidad.
 */
const SIGNAL: Record<string, { label: string; caveat: string }> = {
  documento: {
    label: "Mismo documento",
    caveat:
      "Es un identificador, pero no siempre del mismo hogar: alguien puede haber registrado a un familiar sin documento con su propia cédula.",
  },
  telefono: {
    label: "Mismo teléfono",
    caveat: "Dos vecinos pueden compartir un número cuando en la cuadra solo hay uno.",
  },
  barrio_y_tamano: {
    label: "Mismo barrio y mismo tamaño",
    caveat: "En un barrio hay muchas familias de cuatro personas. Por sí solo no dice casi nada.",
  },
  ubicacion: {
    label: "Mismo punto",
    caveat: "Misma dirección no significa mismo hogar: un edificio tiene varias familias.",
  },
  conexion: {
    label: "Misma conexión",
    caveat: "Un albergue entero comparte el wifi, y una persona puede registrar a su vecina.",
  },
};

const DWELLING_LABEL: Record<string, string> = {
  destruida: "Destruida",
  inhabitable: "Inhabitable",
  con_danos: "Con daños",
  sin_danos: "Sin daños",
  no_sabe: "No sabe",
};

const SHELTER_LABEL: Record<string, string> = {
  vivienda: "En su vivienda",
  albergue: "En albergue",
  familiares: "Donde familiares",
  calle_o_carpa: "En la calle o carpa",
  otro: "Otro",
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

/**
 * Las filas de la comparación, en el mismo orden en las dos columnas.
 *
 * `differs` es lo único que se resalta. Cuando la señal dice «mismo teléfono» pero un lado declara
 * cuatro personas y el otro siete, esa discrepancia es justo lo que hay que ver antes de firmar —
 * y buscarla a ojo entre ocho campos idénticos es como se cometen los errores.
 */
function rows(a: Side, b: Side) {
  return [
    { label: "Barrio", a: a.neighborhood ?? "—", b: b.neighborhood ?? "—" },
    { label: "Municipio", a: a.territoryName ?? "—", b: b.territoryName ?? "—" },
    { label: "Personas", a: String(a.peopleCount), b: String(b.peopleCount) },
    {
      label: "Vivienda",
      a: DWELLING_LABEL[a.dwellingStatus] ?? a.dwellingStatus,
      b: DWELLING_LABEL[b.dwellingStatus] ?? b.dwellingStatus,
    },
    {
      label: "Durmiendo",
      a: SHELTER_LABEL[a.shelteringAt] ?? a.shelteringAt,
      b: SHELTER_LABEL[b.shelteringAt] ?? b.shelteringAt,
    },
    {
      label: "¿Censados?",
      a: a.officiallyCensused === "no" ? "Dicen que no" : a.officiallyCensused,
      b: b.officiallyCensused === "no" ? "Dicen que no" : b.officiallyCensused,
    },
    {
      label: "Teléfono",
      a: a.hasContact ? "Sí hay" : "No dejó",
      b: b.hasContact ? "Sí hay" : "No dejó",
    },
    { label: "Se registró", a: fecha(a.createdAt), b: fecha(b.createdAt) },
  ].map((row) => ({ ...row, differs: row.a !== row.b }));
}

export function DuplicateTray({
  incidentId,
  sessionToken,
  role,
}: {
  incidentId: string;
  sessionToken: string;
  role: "coordinator" | "auditor" | "incident_admin";
}) {
  const [tray, setTray] = useState<Tray | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `auditor` mira y deja constancia; no resuelve ni dispara el emparejador. Marcar un hogar como
  // duplicado cambia a qué puerta va una brigada, y eso es una decisión de operación.
  const canDecide = role !== "auditor";

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `${apiUrl}/v1/operations/incidents/${incidentId}/duplicate-tray?limit=50`,
        { headers: { Authorization: `Bearer ${sessionToken}` } },
      );
      if (!response.ok) throw new Error("tray unavailable");
      setTray((await response.json()) as Tray);
    } catch {
      setTray(null);
    }
  }, [incidentId, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const rematch = async () => {
    setMatching(true);
    setError(null);
    try {
      await fetch(`${apiUrl}/v1/operations/incidents/${incidentId}/duplicate-tray/match`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      await load();
    } finally {
      setMatching(false);
    }
  };

  const resolve = async (candidate: Candidate, event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const decision = String(form.get("decision") ?? "");
    const keep = form.get("keep");
    if (decision === "confirmado" && !keep) {
      setError("Elige cuál de los dos registros se queda.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/v1/operations/incidents/${incidentId}/duplicate-tray/${candidate.id}/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            decision,
            ...(decision === "confirmado" ? { keepRegistrationId: String(keep) } : {}),
            rationale: String(form.get("rationale") ?? "").trim(),
          }),
        },
      );
      if (response.status === 409) {
        setError("Alguien más resolvió este par mientras lo mirabas. Se recargó la bandeja.");
        setOpen(null);
        await load();
        return;
      }
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

  if (tray === null) {
    return <p className={styles.loading}>Cargando la bandeja de posibles duplicados…</p>;
  }

  return (
    <section className={styles.queueSection} aria-labelledby="tray-title">
      <div className={styles.queueHeading}>
        <h2 id="tray-title">Posibles duplicados</h2>
        {/* El denominador va al lado del numerador. «14 pares abiertos» no dice si el censo está
            limpio o roto; «14 de 3.204 registros» sí. */}
        <span>
          {tray.summary.open} sin resolver · {tray.summary.registrations} registros vivos
        </span>
      </div>

      <p className={styles.queueNote}>
        La plataforma <strong>propone</strong> pares y dice con qué señal los emparejó. Nada se
        fusiona ni se borra solo: al confirmar, el registro que no se conserva queda marcado como
        duplicado y sigue ahí con sus conteos.{" "}
        {tray.summary.confirmed > 0 || tray.summary.dismissed > 0 ? (
          <>
            Ya resueltos: {tray.summary.confirmed} confirmados, {tray.summary.dismissed}{" "}
            descartados.
          </>
        ) : null}
      </p>

      {canDecide ? (
        <button
          type="button"
          className={styles.queueOpen}
          onClick={() => void rematch()}
          disabled={matching}
        >
          {matching ? "Recorriendo el censo…" : "Volver a emparejar"}
        </button>
      ) : null}

      {tray.candidates.length === 0 ? (
        <p className={styles.queueEmpty}>
          No hay pares esperando decisión.{" "}
          {tray.summary.lastMatchedAt
            ? `El último recorrido fue el ${new Date(tray.summary.lastMatchedAt).toLocaleString("es-CO")}.`
            : "El censo todavía no se ha recorrido buscando pares."}
        </p>
      ) : (
        <ul className={styles.queueList}>
          {tray.candidates.map((candidate) => (
            <li key={candidate.id} className={styles.queueItem}>
              <div className={styles.queueItemHead}>
                <div>
                  <strong>
                    {candidate.a.publicCode} · {candidate.b.publicCode}
                  </strong>
                  <small>Emparejados el {fecha(candidate.createdAt)}</small>
                </div>
                <div className={styles.queueBadges}>
                  <span
                    className={`coverageBadge ${candidate.strength === "fuerte" ? "severe" : "unknown"}`}
                  >
                    {candidate.strength === "fuerte" ? "Señal fuerte" : "Señal media"}
                  </span>
                  {candidate.signals.map((signal) => (
                    <span key={signal} className={styles.queueLevel}>
                      {SIGNAL[signal]?.label ?? signal}
                    </span>
                  ))}
                </div>
              </div>

              {/* Cada señal con lo que no prueba. Es lo que evita que la bandeja se convierta en
                  una fábrica de confirmaciones. */}
              <ul className={styles.trayCaveats}>
                {candidate.signals.map((signal) => (
                  <li key={signal}>{SIGNAL[signal]?.caveat ?? signal}</li>
                ))}
              </ul>

              {/* Una tabla y no dos tarjetas: lo que hay que hacer aquí es comparar campo contra
                  campo, y una tabla los deja alineados sin que el ojo tenga que buscarlos. */}
              <div className={styles.trayCompare}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className={styles.trayHidden}>Campo</span>
                      </th>
                      <th scope="col">{candidate.a.publicCode}</th>
                      <th scope="col">{candidate.b.publicCode}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows(candidate.a, candidate.b).map((row) => (
                      <tr key={row.label} className={row.differs ? styles.trayDiffers : undefined}>
                        <th scope="row">{row.label}</th>
                        <td>{row.a}</td>
                        <td>{row.b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canDecide ? (
                open === candidate.id ? (
                  <form
                    className={styles.queueForm}
                    onSubmit={(event) => resolve(candidate, event)}
                  >
                    <fieldset className={styles.trayDecision}>
                      <legend>¿Son el mismo hogar?</legend>
                      <label>
                        <input type="radio" name="decision" value="confirmado" defaultChecked />
                        <span>Sí, es el mismo</span>
                      </label>
                      <label>
                        <input type="radio" name="decision" value="descartado" />
                        <span>No, son distintos</span>
                      </label>
                    </fieldset>

                    <fieldset className={styles.trayDecision}>
                      {/* Lo elige la persona y no la fecha: el registro más nuevo puede traer la
                          foto del daño y el teléfono que sí contesta. */}
                      <legend>Si es el mismo, ¿cuál se queda?</legend>
                      <label>
                        <input type="radio" name="keep" value={candidate.a.registrationId} />
                        <span>{candidate.a.publicCode}</span>
                      </label>
                      <label>
                        <input type="radio" name="keep" value={candidate.b.registrationId} />
                        <span>{candidate.b.publicCode}</span>
                      </label>
                    </fieldset>

                    <label className={styles.queueRationale}>
                      <span>Por qué</span>
                      <textarea
                        name="rationale"
                        required
                        minLength={10}
                        maxLength={1000}
                        rows={3}
                        placeholder="En qué te apoyaste. Queda firmado con tu nombre."
                      />
                    </label>
                    {error ? <p className={styles.queueError}>{error}</p> : null}
                    <div className={styles.queueActions}>
                      <button type="submit" disabled={saving}>
                        {saving ? "Guardando…" : "Firmar la decisión"}
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
                    onClick={() => {
                      setError(null);
                      setOpen(candidate.id);
                    }}
                  >
                    Resolver este par
                  </button>
                )
              ) : (
                <p className={styles.queueSignalHelp}>
                  Tu rol puede ver la bandeja y no resolverla: marcar un hogar como duplicado cambia
                  a qué puerta va una brigada.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
