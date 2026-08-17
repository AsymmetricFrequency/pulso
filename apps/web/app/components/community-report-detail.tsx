"use client";

import {
  externalSourceLabels,
  type PublicCommunityReport,
  peopleReportedLabel,
} from "./community-report-form";
import {
  IconAlert,
  IconBox,
  IconBuilding,
  IconCalendar,
  IconCheck,
  IconClock,
  IconCollapse,
  IconDamage,
  IconFlag,
  IconLocation,
  IconRescue,
  IconRouteBlocked,
  IconUsers,
} from "./icons";

export const REPORT_TYPE_LABEL: Record<PublicCommunityReport["reportType"], string> = {
  rescate: "Personas atrapadas",
  pmu: "Puesto de mando",
  necesidad: "Necesidad",
  via: "Estado de la vía",
  dano: "Daño estructural",
};

const DAMAGE_SEVERITY_LABEL: Record<
  NonNullable<PublicCommunityReport["damageSeverity"]>,
  string
> = {
  colapso: "Colapso",
  grave: "Daño grave",
  moderado: "Daño moderado",
  leve: "Daño leve",
  // No es un hueco: hay daño reportado y nadie con criterio técnico ha ido a calificarlo. Decirlo
  // así es lo que convierte la ficha en una cola de trabajo para las brigadas de evaluación.
  sin_evaluar: "Sin evaluar todavía",
};

const ROUTE_STATUS_LABEL: Record<NonNullable<PublicCommunityReport["routeStatus"]>, string> = {
  bloqueada: "Sin paso",
  habilitada: "Habilitada",
};

const SIGNS_OF_LIFE_LABEL: Record<NonNullable<PublicCommunityReport["signsOfLife"]>, string> = {
  yes: "Se reportan señales de vida",
  unknown: "Sin confirmar todavía",
  no: "No se percibieron señales",
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
  // Longitud negativa es oeste; invertirlo imprimía "E" en todo el territorio colombiano.
  `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? "E" : "O"}`;

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

  const needsLabel = report.reportType === "pmu" ? "Ofrece / categorías" : "Se necesita";

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

      <p className="eyebrow reportDetailKind">
        {report.reportType === "rescate" ? (
          <IconRescue />
        ) : report.reportType === "pmu" ? (
          <IconFlag />
        ) : report.reportType === "via" ? (
          <IconRouteBlocked />
        ) : report.reportType === "dano" ? (
          report.damageSeverity === "colapso" ? (
            <IconCollapse />
          ) : (
            <IconDamage />
          )
        ) : (
          <IconAlert />
        )}
        {REPORT_TYPE_LABEL[report.reportType]}
      </p>
      <h3>{report.title}</h3>

      <div className="reportDetailBadges">
        {/* En una vía, lo primero es si se puede pasar. El estado de revisión viene después:
            saber que Operaciones todavía no la miró no le sirve a quien está decidiendo la ruta. */}
        {report.damageSeverity && (
          <span
            className={`communityReportStatusBadge ${
              report.damageSeverity === "colapso" ? "unverified" : "muted"
            }`}
          >
            {DAMAGE_SEVERITY_LABEL[report.damageSeverity]}
          </span>
        )}
        {report.routeStatus && (
          <span
            className={`communityReportStatusBadge ${
              report.routeStatus === "habilitada" ? "verified" : "muted"
            }`}
          >
            {ROUTE_STATUS_LABEL[report.routeStatus]}
          </span>
        )}
        <span className={`communityReportStatusBadge ${reportStatusToken(report.status)}`}>
          {STATUS_LABEL[report.status]}
        </span>
        {metadata?.urgency && (
          <span className={`urgencyBadge ${urgencyToken(metadata.urgency)}`}>
            {metadata.urgency}
          </span>
        )}
      </div>

      {/* El aviso va antes de la descripción, no en una nota al pie: alguien puede estar leyendo
          esto para decidir si coge el carro. */}
      {report.locationPrecision === "geocoded" && (
        <p className="reportDetailGeocoded">
          <IconLocation />
          Punto aproximado: la ubicación se dedujo de la dirección escrita, no la puso nadie desde
          el sitio. Guíate por la dirección y confirma antes de desplazarte.
        </p>
      )}

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

      {/* Los tres datos del rescate van arriba de todo lo demás y sin plegar: son lo que un equipo
          mira para decidir a qué punto va primero. */}
      {report.reportType === "rescate" && (
        <dl className="reportDetailMeta reportDetailRescue">
          <div>
            <dt>
              <IconUsers />
              Personas
            </dt>
            <dd>{peopleReportedLabel(report.peopleReported) ?? "Sin dato"}</dd>
          </div>
          <div>
            <dt>
              <IconAlert />
              Señales de vida
            </dt>
            <dd>{report.signsOfLife ? SIGNS_OF_LIFE_LABEL[report.signsOfLife] : "Sin dato"}</dd>
          </div>
          <div>
            <dt>
              <IconFlag />
              Rescatistas
            </dt>
            <dd>
              {report.respondersOnSite === null
                ? "Sin dato"
                : report.respondersOnSite
                  ? "Ya hay equipo en el sitio"
                  : "Nadie en el sitio al reportar"}
            </dd>
          </div>
        </dl>
      )}

      <dl className="reportDetailMeta">
        <div>
          <dt>
            <IconLocation />
            Ubicación
          </dt>
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
            <dt>
              <IconBuilding />
              Organización
            </dt>
            <dd>{metadata.organization}</dd>
          </div>
        )}
        {metadata?.capacity && (
          <div>
            <dt>
              <IconBox />
              Capacidad
            </dt>
            <dd>{metadata.capacity}</dd>
          </div>
        )}
        {metadata?.schedule && (
          <div>
            <dt>
              <IconClock />
              Horario
            </dt>
            <dd>{metadata.schedule}</dd>
          </div>
        )}
        {volunteers && (
          <div>
            <dt>
              <IconUsers />
              Voluntarios
            </dt>
            <dd>{volunteers}</dd>
          </div>
        )}
        {typeof metadata?.corroborationCount === "number" && metadata.corroborationCount > 1 && (
          <div>
            <dt>
              <IconCheck />
              Confirmaciones
            </dt>
            <dd>{metadata.corroborationCount} reportes</dd>
          </div>
        )}
        {updated && (
          <div>
            <dt>
              <IconCalendar />
              Actualizado
            </dt>
            <dd>{updated}</dd>
          </div>
        )}
      </dl>

      {/* Enlace a la fuente en vez de copiar el contacto.
          264 fichas importadas declaran tener un teléfono en su origen. Ese número se lo dieron a
          esa plataforma, no a Pulso, así que no se republica aquí — pero callar que existe deja a
          quien quiere ayudar sin forma de llegar. El enlace resuelve las dos cosas: la conexión
          ocurre y el dato personal se queda donde su dueño lo puso. */}
      {source && metadata?.hasContact && (
        <p className="reportDetailContact">
          Esta ficha tiene datos de contacto <strong>en su fuente original</strong>. Pulso no los
          copia.{" "}
          <a href={source.url} target="_blank" rel="noreferrer noopener">
            Abrir en {source.name} ↗
          </a>
        </p>
      )}

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
