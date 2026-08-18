"use client";

import { useEffect, useState } from "react";
import { DataTable } from "./charts";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const SKELETON_ROWS = ["a", "b", "c", "d", "e", "f"];

type CoverageState = "silencio" | "sin_censo" | "en_curso" | "con_censo" | "fuera_de_alcance";

type CoverageRow = {
  divipola: string | null;
  municipality: string;
  department: string | null;
  mmiMax: number | null;
  mmiLabel: string | null;
  reportCount: number;
  coverageState: CoverageState;
  reportedPeople: number | null;
  registeredPeople: number | null;
  censusObservedAt: string | null;
};

type CoverageSummary = {
  counts: Record<CoverageState, number>;
  municipalitiesWithShaking: number;
  rows: CoverageRow[];
};

/**
 * Qué significa cada estado, en la frase más corta que lo dice entero.
 *
 * `silencio` es el que importa y por eso lleva el color crítico: no es «no pasó nada», es «nadie ha
 * ido a mirar». Un municipio con sacudida severa y cero reportes no está tranquilo — está callado,
 * que suele ser lo mismo que estar incomunicado.
 */
const STATE_LABEL: Record<CoverageState, { label: string; token: string; help: string }> = {
  silencio: {
    label: "Nadie ha ido",
    token: "critical",
    help: "Sacudió fuerte, no llegó ningún reporte y ninguna autoridad reporta censo.",
  },
  sin_censo: {
    label: "Sin censo",
    token: "severe",
    help: "Hay señal de gente afectada y todavía no hay censo.",
  },
  en_curso: {
    label: "Censo en curso",
    token: "moderate",
    help: "La autoridad reporta censo en curso.",
  },
  con_censo: { label: "Censado", token: "light", help: "La autoridad reporta el censo terminado." },
  fuera_de_alcance: {
    label: "Fuera de alcance",
    token: "unknown",
    help: "Sacudida baja y sin señal: no es que falte censar.",
  },
};

export function CensusCoverageSection() {
  const [data, setData] = useState<CoverageSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/v1/public/incidents/colombia-2026/census-coverage?limit=60`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("census coverage unavailable");
        return response.json() as Promise<CoverageSummary>;
      })
      .then(setData)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setData(null);
      });
    return () => controller.abort();
  }, []);

  if (data === null) {
    return (
      <section className="censusSection" id="censo" aria-labelledby="census-title">
        <div className="sectionHeading">
          <div>
            <p className="psEyebrow">Censo de personas afectadas</p>
            <h2 id="census-title">Dónde no ha llegado nadie a censar</h2>
          </div>
        </div>
        <div className="shakingSkeleton" role="status" aria-live="polite">
          <span className="srOnly">Cargando la cobertura del censo…</span>
          {SKELETON_ROWS.map((row, index) => (
            <i key={row} style={{ animationDelay: `${index * 90}ms` }} />
          ))}
        </div>
      </section>
    );
  }

  const silent = data.counts.silencio;
  const withoutCensus = data.counts.sin_censo;

  // Sin lectura de sacudida no hay nada que cruzar, y una tabla vacía aquí se leería como «ya está
  // todo censado», que es lo contrario de lo que significa.
  if (data.municipalitiesWithShaking === 0) return null;

  return (
    <section className="censusSection" id="censo" aria-labelledby="census-title">
      <div className="sectionHeading">
        <div>
          <p className="psEyebrow">Censo de personas afectadas</p>
          <h2 id="census-title">Dónde no ha llegado nadie a censar</h2>
        </div>
        <span className="sectionNote">
          {data.municipalitiesWithShaking} municipios con lectura de sacudida
        </span>
      </div>

      {/* Lo que esta sección es y lo que no, antes del dato. Sin esta frase alguien puede leer la
          tabla como si fuera un censo, y es exactamente lo contrario: es el mapa de su ausencia. */}
      <p className="shakingCaveat">
        <strong>Esto no es un censo</strong> y Pulso no levanta ninguno: el Registro Único de
        Damnificados lo hacen las autoridades, casa a casa y por personal autorizado. Lo que muestra
        esta tabla es <strong>dónde todavía no ha ido nadie</strong>, cruzando cuánto sacudió (USGS)
        con cuánta señal ciudadana llegó. No contiene el dato de ninguna persona.
      </p>

      <div className="censusTally">
        <div className="censusTallyItem critical">
          <strong>{silent}</strong>
          <span>
            municipios donde <b>nadie ha ido</b>
          </span>
          <small>Sacudida fuerte, cero reportes, cero censo reportado.</small>
        </div>
        <div className="censusTallyItem severe">
          <strong>{withoutCensus}</strong>
          <span>municipios con señal y sin censo</span>
          <small>Llegaron reportes de gente afectada; nadie reporta haber censado.</small>
        </div>
      </div>

      <DataTable
        caption="Municipios ordenados por urgencia de censo"
        columns={[
          { key: "municipality", label: "Municipio" },
          { key: "department", label: "Departamento" },
          { key: "shaking", label: "Sacudida", numeric: true },
          { key: "reports", label: "Reportes", numeric: true },
          { key: "state", label: "Estado" },
        ]}
      >
        {data.rows.map((row) => {
          const state = STATE_LABEL[row.coverageState];
          return (
            <tr key={row.divipola ?? row.municipality}>
              <td>{row.municipality}</td>
              <td>{row.department ?? "—"}</td>
              <td className="num">
                {row.mmiLabel ? `${row.mmiLabel} (${row.mmiMax?.toFixed(1)})` : "sin lectura"}
              </td>
              <td className="num">{row.reportCount.toLocaleString("es-CO")}</td>
              <td>
                <span className={`coverageBadge ${state.token}`} title={state.help}>
                  {state.label}
                </span>
              </td>
            </tr>
          );
        })}
      </DataTable>

      <p className="sectionFootnote">
        La ausencia de reportes no es ausencia de daño. Un municipio sin un solo reporte puede ser
        uno donde no pasó nada o uno donde no hay señal, ni internet, ni nadie con tiempo de abrir
        un mapa — y la sacudida es lo que distingue esos dos casos sin esperar a que alguien
        reporte.
      </p>
    </section>
  );
}
