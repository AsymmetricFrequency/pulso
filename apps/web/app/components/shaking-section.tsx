"use client";

import { useEffect, useState } from "react";
import { BarChart, type BarDatum, DataTable } from "./charts";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Barras del esqueleto. Con identidad propia porque no tienen ninguna: el índice del array
 *  no identifica nada y React lo desaconseja como clave. */
const SKELETON_ROWS = ["a", "b", "c", "d", "e", "f"];

type TerritoryShaking = {
  territoryCode: string | null;
  territoryName: string;
  mmiMax: number;
  mmiMean: number | null;
  mmiLabel: string;
  gridCells: number;
  computedAt: string;
};

/**
 * Color por grado de Mercalli.
 *
 * Los cortes son **exactamente** los mismos que usa `mmiLabel` en el worker para
 * nombrar la percepción. Cuando no coincidían, dos departamentos con la misma
 * etiqueta "Fuerte" salían con colores distintos —uno ámbar y otro azul— porque
 * el color cambiaba en 6.0 y el nombre en 6.5. Un color que contradice a su
 * propia etiqueta no es un detalle estético: rompe la lectura de la tabla.
 */
const mmiStatus = (value: number): { token: string; color: string } => {
  if (value >= 8.5) return { token: "critical", color: "var(--status-critical)" };
  if (value >= 7.5) return { token: "severe", color: "var(--status-severe)" };
  if (value >= 6.5) return { token: "strong", color: "var(--status-strong)" };
  if (value >= 5.5) return { token: "moderate", color: "var(--status-moderate)" };
  return { token: "light", color: "var(--status-light)" };
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Bogota",
  }).format(new Date(value));

export function ShakingSection() {
  const [rows, setRows] = useState<TerritoryShaking[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/v1/public/incidents/colombia-2026/shaking`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("shaking unavailable");
        return response.json() as Promise<TerritoryShaking[]>;
      })
      .then(setRows)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setRows([]);
      });
    return () => controller.abort();
  }, []);

  // Mientras carga se dibuja el esqueleto, no `null`.
  //
  // No es solo estética: si la sección no existe en el primer pintado, el ancla
  // `#intensidad` no encuentra a dónde saltar y un enlace compartido a esta
  // sección deja al visitante arriba de la página sin explicación.
  if (rows === null) {
    return (
      <section className="shakingSection" id="intensidad" aria-labelledby="shaking-title">
        <div className="sectionHeading">
          <div>
            <p className="psEyebrow">Intensidad sísmica</p>
            <h2 id="shaking-title">Dónde sacudió más fuerte</h2>
          </div>
        </div>
        <div className="shakingSkeleton" role="status" aria-live="polite">
          <span className="srOnly">Cargando la intensidad por territorio…</span>
          {SKELETON_ROWS.map((row, index) => (
            <i key={row} style={{ animationDelay: `${index * 90}ms` }} />
          ))}
        </div>
      </section>
    );
  }

  // Con la lista vacía sí se omite: una gráfica sin barras sugiere que no hubo
  // sacudida, que es exactamente lo contrario de lo que significa.
  if (rows.length === 0) return null;

  const chartData: BarDatum[] = rows.slice(0, 10).map((row) => ({
    label: row.territoryName,
    value: row.mmiMax,
    hint: row.mmiLabel,
    color: mmiStatus(row.mmiMax).color,
  }));

  const updated = rows[0]?.computedAt;

  return (
    <section className="shakingSection" id="intensidad" aria-labelledby="shaking-title">
      <div className="sectionHeading">
        <div>
          <p className="psEyebrow">Intensidad sísmica</p>
          <h2 id="shaking-title">Dónde sacudió más fuerte</h2>
        </div>
        <span className="sectionNote">
          {rows.length} departamentos · USGS ShakeMap
          {updated ? ` · ${formatDateTime(updated)}` : ""}
        </span>
      </div>

      {/* La advertencia va antes del dato, no en una nota al pie: quien lee la
          gráfica tiene que saber qué está mirando antes de sacar conclusiones. */}
      <p className="shakingCaveat">
        La intensidad es la <strong>sacudida</strong> que modeló el USGS a partir de estaciones
        sismológicas, no el daño observado. Un municipio con grado severo recibió un movimiento muy
        fuerte; cuántas edificaciones cedieron depende de cómo estén construidas y eso solo lo dice
        una evaluación en terreno.
      </p>

      <div className="shakingGrid">
        <div className="psCard shakingChartCard">
          <BarChart
            data={chartData}
            title="Intensidad máxima por departamento, escala de Mercalli"
            description="Los diez departamentos con mayor intensidad sísmica modelada."
            max={10}
            formatValue={(value) => value.toFixed(1)}
          />
        </div>

        <DataTable
          caption="Intensidad sísmica por departamento"
          columns={[
            { key: "territorio", label: "Departamento" },
            { key: "mmi", label: "MMI máx", numeric: true },
            { key: "percepcion", label: "Percepción" },
            { key: "celdas", label: "Celdas", numeric: true },
          ]}
        >
          {rows.map((row) => {
            const status = mmiStatus(row.mmiMax);
            return (
              <tr key={row.territoryCode ?? row.territoryName}>
                <td className="strongCell">{row.territoryName}</td>
                <td className="num">{row.mmiMax.toFixed(1)}</td>
                <td>
                  <span className="psBadge" data-status={status.token}>
                    {row.mmiLabel}
                  </span>
                </td>
                {/* La cobertura de la malla es honestidad, no relleno: un
                    departamento con tres celdas dentro no está medido igual
                    que uno con dos mil. */}
                <td className="num">{row.gridCells.toLocaleString("es-CO")}</td>
              </tr>
            );
          })}
        </DataTable>
      </div>
    </section>
  );
}
