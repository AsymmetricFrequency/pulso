import type { CSSProperties, ReactNode } from "react";

/**
 * Gráficos en SVG, sin librería.
 *
 * La decisión no es de purismo: Chart.js pesa ~200 KB y aquí hacen falta tres
 * formas simples. Más importante, una librería genérica dibuja lo que le pidas
 * y no sabe que un valor ausente no es un cero — esa distinción es central en
 * este proyecto y se maneja explícitamente en cada componente.
 *
 * Accesibilidad: todo gráfico lleva `role="img"` con título y descripción, y
 * los datos siempre existen también como texto en la tabla que lo acompaña. Un
 * gráfico nunca es la única forma de leer una cifra.
 */

export type BarDatum = {
  label: string;
  value: number;
  /** Segundo renglón bajo la etiqueta: contexto, no decoración. */
  hint?: string;
  /** Color del token de estado, no un hex suelto. */
  color?: string;
};

const BAR_HEIGHT = 26;
const BAR_GAP = 10;
const LABEL_WIDTH = 132;
const VALUE_WIDTH = 62;

export function BarChart({
  data,
  title,
  description,
  max,
  formatValue = (value) => value.toLocaleString("es-CO"),
  animated = true,
}: {
  data: BarDatum[];
  title: string;
  description?: string;
  max?: number;
  formatValue?: (value: number) => string;
  animated?: boolean;
}) {
  if (data.length === 0) return null;
  const upper = max ?? Math.max(...data.map((d) => d.value), 1);
  const width = 640;
  const trackStart = LABEL_WIDTH;
  const trackWidth = width - LABEL_WIDTH - VALUE_WIDTH;
  const height = data.length * (BAR_HEIGHT + BAR_GAP);

  return (
    <svg
      className="psChart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
      preserveAspectRatio="xMinYMin meet"
    >
      <title>{title}</title>
      {description ? <desc>{description}</desc> : null}
      {data.map((datum, index) => {
        const y = index * (BAR_HEIGHT + BAR_GAP);
        // Una barra de ancho cero es invisible y se confunde con "no hay fila";
        // el mínimo de 2px deja ver que la fila existe y su valor es muy bajo.
        const barWidth = Math.max((datum.value / upper) * trackWidth, 2);
        return (
          <g key={datum.label}>
            <text className="barLabel" x={0} y={y + BAR_HEIGHT / 2 + 4}>
              {datum.label.length > 20 ? `${datum.label.slice(0, 19)}…` : datum.label}
            </text>
            <rect
              className="track"
              x={trackStart}
              y={y + 3}
              width={trackWidth}
              height={BAR_HEIGHT - 6}
              rx={6}
            />
            <rect
              className={`bar${animated ? " animated" : ""}`}
              x={trackStart}
              y={y + 3}
              width={barWidth}
              height={BAR_HEIGHT - 6}
              rx={6}
              fill={datum.color ?? "var(--primary)"}
              style={{ animationDelay: `${index * 40}ms` } as CSSProperties}
            >
              <title>{`${datum.label}: ${formatValue(datum.value)}${datum.hint ? ` · ${datum.hint}` : ""}`}</title>
            </rect>
            <text className="barValue" x={width - VALUE_WIDTH + 8} y={y + BAR_HEIGHT / 2 + 4}>
              {formatValue(datum.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export type DonutSlice = { label: string; value: number; color: string };

/**
 * Anillo de proporciones.
 *
 * Solo se usa cuando las partes suman un todo con sentido —el estado de
 * revisión de los contratos, por ejemplo—. Para comparar magnitudes entre sí
 * la barra siempre gana: el ojo compara longitudes bien y ángulos mal.
 */
export function DonutChart({
  slices,
  title,
  centerValue,
  centerLabel,
}: {
  slices: DonutSlice[];
  title: string;
  centerValue?: string;
  centerLabel?: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return null;

  const size = 180;
  const radius = 70;
  const stroke = 22;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg
      className="psChart"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={title}
      style={{ maxWidth: `${size}px` }}
    >
      <title>{title}</title>
      <g transform={`translate(${size / 2}, ${size / 2}) rotate(-90)`}>
        {slices.map((slice) => {
          const length = (slice.value / total) * circumference;
          const dash = `${length} ${circumference - length}`;
          const element = (
            <circle
              key={slice.label}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
            >
              <title>{`${slice.label}: ${slice.value.toLocaleString("es-CO")}`}</title>
            </circle>
          );
          offset += length;
          return element;
        })}
      </g>
      {centerValue ? (
        <text
          x={size / 2}
          y={size / 2 - 2}
          textAnchor="middle"
          style={{
            fill: "var(--text-primary)",
            fontFamily: "var(--font-display)",
            fontSize: "26px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {centerValue}
        </text>
      ) : null}
      {centerLabel ? (
        <text
          x={size / 2}
          y={size / 2 + 16}
          textAnchor="middle"
          style={{ fill: "var(--text-secondary)", fontSize: "11px" }}
        >
          {centerLabel}
        </text>
      ) : null}
    </svg>
  );
}

export function ChartLegend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="psLegend">
      {items.map((item) => (
        <li key={item.label}>
          <i style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Tabla de datos: encabezado fijo, cifras tabulares y desplazamiento propio. */
export function DataTable({
  columns,
  children,
  caption,
}: {
  columns: Array<{ key: string; label: string; numeric?: boolean }>;
  children: ReactNode;
  caption?: string;
}) {
  return (
    <div className="psTableWrap">
      <table className="psTable">
        {caption ? <caption className="srOnly">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.numeric ? "num" : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
