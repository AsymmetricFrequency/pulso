"use client";

import { externalSourceLabels, type PublicCommunityReport } from "./community-report-form";

export const REPORT_TYPE_ICON: Record<PublicCommunityReport["reportType"], string> = {
  pmu: "🏳️",
  necesidad: "🆘",
};

export const REPORT_TYPE_LABEL: Record<PublicCommunityReport["reportType"], string> = {
  pmu: "Puesto de mando",
  necesidad: "Necesidad",
};

export const reportStatusToken = (status: PublicCommunityReport["status"]) => {
  if (status === "corroborated" || status === "validated") return "verified";
  if (status === "reported") return "unverified";
  return "muted";
};

const STATUS_LABEL: Record<PublicCommunityReport["status"], string> = {
  reported: "Sin verificar",
  corroborated: "Corroborado",
  validated: "Validado",
  rejected: "Rechazado",
  superseded: "Reemplazado",
};

const urgencyToken = (urgency: string) => {
  const value = urgency.toLowerCase();
  if (value.includes("urgente") || value.includes("alta")) return "high";
  if (value.includes("media")) return "medium";
  return "low";
};

const relativeTime = (iso: string): string | null => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
};

type CommunityReportDetailCardProps = {
  report: PublicCommunityReport;
  onClose: () => void;
};

const formatCoordinates = ([lng, lat]: [number, number]) =>
  `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? "O" : "E"}`;

export function CommunityReportDetailCard({ report, onClose }: CommunityReportDetailCardProps) {
  const metadata = report.metadata;
  const source = report.externalSourceId ? externalSourceLabels[report.externalSourceId] : null;

  const place = [
    ...new Set(
      [metadata?.address, metadata?.neighborhood, metadata?.city, metadata?.department]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part)),
    ),
  ].join(", ");

  // report.location is always present — even when the source gave us no address/city text,
  // we can still tell the person exactly where the point sits and let them open it in a map.
  const [lng, lat] = report.location.coordinates;
  const mapsUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

  const needsLabel = report.reportType === "pmu" ? "📦 Ofrece / categorías" : "🧾 Se necesita";

  const volunteers = [
    metadata?.personsNeeded ? `Faltan ${metadata.personsNeeded}` : null,
    metadata?.personsPresent ? `hay ${metadata.personsPresent}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  const updated = metadata?.reportUpdatedAt
    ? relativeTime(metadata.reportUpdatedAt)
    : metadata?.reportedAt
      ? relativeTime(metadata.reportedAt)
      : null;

  return (
    <div className="reportDetailCard">
      <button type="button" className="reportDetailBack" onClick={onClose}>
        ← Volver al resumen
      </button>

      <p className="eyebrow">
        {REPORT_TYPE_ICON[report.reportType]} {REPORT_TYPE_LABEL[report.reportType]}
      </p>
      <h3>{report.title}</h3>

      <div className="reportDetailBadges">
        <span className={`communityReportStatusBadge ${reportStatusToken(report.status)}`}>
          {STATUS_LABEL[report.status]}
        </span>
        {metadata?.urgency && (
          <span className={`urgencyBadge ${urgencyToken(metadata.urgency)}`}>
            {metadata.urgency}
          </span>
        )}
      </div>

      {report.description && <p className="reportDetailDescription">{report.description}</p>}

      {metadata?.needs && metadata.needs.length > 0 && (
        <div className="reportDetailNeeds">
          <span>{needsLabel}</span>
          <ul>
            {[...new Set(metadata.needs)].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <dl className="reportDetailMeta">
        <div>
          <dt>📍 Ubicación</dt>
          <dd>
            {place || formatCoordinates(report.location.coordinates)}{" "}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="reportDetailMapLink"
            >
              Ver en el mapa ↗
            </a>
          </dd>
        </div>
        {metadata?.organization && (
          <div>
            <dt>🏢 Organización</dt>
            <dd>{metadata.organization}</dd>
          </div>
        )}
        {metadata?.capacity && (
          <div>
            <dt>📦 Capacidad</dt>
            <dd>{metadata.capacity}</dd>
          </div>
        )}
        {metadata?.schedule && (
          <div>
            <dt>🕐 Horario</dt>
            <dd>{metadata.schedule}</dd>
          </div>
        )}
        {volunteers && (
          <div>
            <dt>🙋 Voluntarios</dt>
            <dd>{volunteers}</dd>
          </div>
        )}
        {typeof metadata?.corroborationCount === "number" && metadata.corroborationCount > 1 && (
          <div>
            <dt>✅ Confirmaciones</dt>
            <dd>{metadata.corroborationCount} reportes</dd>
          </div>
        )}
        {updated && (
          <div>
            <dt>🗓️ Actualizado</dt>
            <dd>{updated}</dd>
          </div>
        )}
      </dl>

      {source && (
        <p className="reportDetailSource">
          Fuente:{" "}
          <a href={source.url} target="_blank" rel="noreferrer noopener">
            {source.name}
          </a>
          {metadata?.subSource ? ` · ${metadata.subSource}` : ""}
        </p>
      )}
    </div>
  );
}
