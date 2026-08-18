"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  IconBox,
  IconBuilding,
  IconCrosshair,
  IconDot,
  IconFlag,
  IconFood,
  IconHealth,
  IconHygiene,
  IconLocation,
  IconPaw,
  IconRubble,
  IconShelter,
  IconSos,
  IconTools,
  IconTruck,
  IconVolunteer,
  IconWater,
} from "./icons";

// Leaflet toca `window` al cargar — igual que el mapa de departamento, solo puede vivir
// en el navegador.
const LocationPickerMap = dynamic(
  () => import("./location-picker-map").then((mod) => mod.LocationPickerMap),
  { ssr: false, loading: () => <div className="locationPickerMap mapLoading">Cargando mapa…</div> },
);

/** Cualquiera del set de `icons.tsx`: comparten firma, así que se pasan como dato. */
type IconComponent = typeof IconDot;

export type CommunityReportType = "pmu" | "necesidad";
export type CommunityReportUrgency = "baja" | "media" | "alta" | "critica";
export type CommunityReportCategory =
  | "agua"
  | "alimentos"
  | "salud"
  | "albergues"
  | "higiene"
  | "herramienta"
  | "escombros"
  | "voluntariado"
  | "animales"
  | "logistica"
  | "catastros"
  | "puntos_ayuda"
  | "centros_acopio"
  | "otro";

export type CommunityReportMetadata = {
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  department?: string | null;
  urgency?: string | null;
  sourceStatus?: string | null;
  needs?: string[] | null;
  personsNeeded?: number | null;
  personsPresent?: number | null;
  capacity?: string | null;
  schedule?: string | null;
  organization?: string | null;
  reportedAt?: string | null;
  reportUpdatedAt?: string | null;
  confidence?: string | null;
  corroborationCount?: number | null;
  needsOpen?: number | null;
  needsCovered?: number | null;
  departmentPriority?: string | null;
  subSource?: string | null;
  hasContact?: boolean | null;
};

export type PublicCommunityReport = {
  id: string;
  reportType: CommunityReportType;
  category: CommunityReportCategory | null;
  title: string;
  description: string | null;
  location: { type: "Point"; coordinates: [number, number] };
  status: "reported" | "corroborated" | "validated" | "rejected" | "superseded";
  externalSourceId: string | null;
  metadata: CommunityReportMetadata | null;
  createdAt: string;
};

export const externalSourceLabels: Record<string, { name: string; url: string }> = {
  "contemos-mapa-situacion": {
    name: "contemos.org",
    url: "https://mapa.contemos.org/",
  },
  "gravitas-mapa-ciudadano": {
    name: "GRAVITAS",
    url: "https://www.mapa.gravitasworld.com/",
  },
};

export const categoryOptions: Array<{
  id: CommunityReportCategory;
  label: string;
  Icon: IconComponent;
}> = [
  { id: "agua", label: "Agua", Icon: IconWater },
  { id: "alimentos", label: "Alimentos", Icon: IconFood },
  { id: "salud", label: "Salud", Icon: IconHealth },
  { id: "albergues", label: "Albergues", Icon: IconShelter },
  { id: "higiene", label: "Higiene", Icon: IconHygiene },
  { id: "herramienta", label: "Herramientas", Icon: IconTools },
  { id: "escombros", label: "Escombros", Icon: IconRubble },
  { id: "voluntariado", label: "Voluntariado", Icon: IconVolunteer },
  { id: "animales", label: "Animales", Icon: IconPaw },
  { id: "logistica", label: "Logística", Icon: IconTruck },
  { id: "catastros", label: "Catastros", Icon: IconBuilding },
  { id: "puntos_ayuda", label: "Puntos de ayuda", Icon: IconLocation },
  { id: "centros_acopio", label: "Centros de acopio", Icon: IconBox },
  { id: "otro", label: "Otro", Icon: IconDot },
];

export const urgencyOptions: Array<{ id: CommunityReportUrgency; label: string }> = [
  { id: "baja", label: "Baja" },
  { id: "media", label: "Media" },
  { id: "alta", label: "Alta" },
  { id: "critica", label: "Crítica" },
];

type CommunityReportFormProps = {
  point: [number, number] | null;
  onPointChange: (point: [number, number]) => void;
  /** [lat, lng] — centro inicial del mini mapa mientras no hay punto elegido (p. ej. el centro
      del departamento que ya estabas viendo), en vez de arrancar siempre en toda Colombia. */
  initialCenter?: [number, number];
  apiUrl: string;
  incidentCode: string;
  onClose: () => void;
  onSubmitted: (report: PublicCommunityReport) => void;
};

export function CommunityReportForm({
  point,
  onPointChange,
  initialCenter,
  apiUrl,
  incidentCode,
  onClose,
  onSubmitted,
}: CommunityReportFormProps) {
  const [reportType, setReportType] = useState<CommunityReportType>("pmu");
  const [category, setCategory] = useState<CommunityReportCategory>("agua");
  const [urgency, setUrgency] = useState<CommunityReportUrgency | "">("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Colocar el punto con la ubicación del dispositivo: en campo, con una mano y sin saber
  // leer un mapa, es la vía más corta para reportar donde uno está.
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Este navegador no permite compartir la ubicación.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onPointChange([position.coords.longitude, position.coords.latitude]);
      },
      () => {
        setLocating(false);
        setLocationError("No pudimos obtener tu ubicación. Puedes tocar el mini mapa en su lugar.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  // Escape cierra el modal aunque el foco esté en un campo del formulario, no solo cuando el
  // fondo mismo tiene el foco — un div clicable no lo recibe por teclado.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const submit = async () => {
    if (!point) {
      setError("Marca un punto en el mini mapa antes de publicar.");
      return;
    }
    if (title.trim().length < 3) {
      setError("Escribe un título de al menos 3 caracteres.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/v1/public/incidents/${incidentCode}/community-reports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientMutationId: crypto.randomUUID(),
            reportType,
            category: reportType === "necesidad" ? category : null,
            urgency: urgency || null,
            title: title.trim(),
            description: description.trim() || null,
            location: { type: "Point", coordinates: point },
            contact: contact.trim() || null,
          }),
        },
      );
      if (!response.ok) {
        if (response.status === 429) {
          setError("Ya enviaste varios reportes seguidos. Espera unos minutos e intenta de nuevo.");
        } else {
          setError("No pudimos publicar el reporte. Intenta de nuevo.");
        }
        return;
      }
      const created = (await response.json()) as PublicCommunityReport;
      onSubmitted(created);
    } catch {
      setError("Sin conexión. El reporte no se pudo enviar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // El fondo cubre toda la pantalla e intercepta el clic para que no le llegue al mapa de
    // abajo; solo cierra el modal si el clic cae en el fondo mismo, no en el panel. El cierre
    // por teclado ya está cubierto por el listener de Escape de arriba y por el botón "Cerrar".
    // biome-ignore lint/a11y/noStaticElementInteractions: fondo de modal, decorativo salvo por el clic para cerrar.
    // biome-ignore lint/a11y/useKeyWithClickEvents: cierre por teclado cubierto por el listener de Escape.
    <div className="reportModalBackdrop" onClick={onClose}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: solo detiene la propagación del clic hacia el fondo, no es una acción con equivalente de teclado. */}
      <div
        className="communityReportForm"
        role="dialog"
        aria-modal="true"
        aria-label="Reportar en este punto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="communityReportFormHeader">
          <strong>Reportar aquí</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="locationPickerSection">
          <LocationPickerMap
            point={point}
            onChange={onPointChange}
            {...(initialCenter ? { initialCenter } : {})}
          />
          <div className="locationPickerActions">
            <button
              type="button"
              className="mapLocateButton"
              onClick={useMyLocation}
              disabled={locating}
            >
              {locating ? (
                "Ubicando…"
              ) : (
                <>
                  <IconCrosshair />
                  Usar mi ubicación
                </>
              )}
            </button>
            <span className="communityReportFormLabel">
              {point
                ? "Arrastra el pin o toca el mapa para ajustar el punto."
                : "Toca el mapa para marcar dónde, o usa tu ubicación."}
            </span>
          </div>
          {locationError && (
            <p className="communityReportFormError" role="alert">
              {locationError}
            </p>
          )}
        </div>

        <div className="communityReportTypeToggle" role="radiogroup" aria-label="Tipo de reporte">
          <button
            type="button"
            className={reportType === "pmu" ? "active" : ""}
            onClick={() => setReportType("pmu")}
          >
            <IconFlag />
            Puesto de mando (PMU)
          </button>
          <button
            type="button"
            className={reportType === "necesidad" ? "active" : ""}
            onClick={() => setReportType("necesidad")}
          >
            <IconSos />
            Necesidad
          </button>
        </div>

        {reportType === "necesidad" && (
          <div className="communityReportCategoryGrid">
            {categoryOptions.map((option) => (
              <button
                type="button"
                key={option.id}
                className={category === option.id ? "active" : ""}
                onClick={() => setCategory(option.id)}
              >
                <option.Icon />
                {option.label}
              </button>
            ))}
          </div>
        )}

        <label>
          <span>Nivel de urgencia (opcional)</span>
          <select
            value={urgency}
            onChange={(event) => setUrgency(event.target.value as CommunityReportUrgency | "")}
          >
            <option value="">Sin especificar</option>
            {urgencyOptions.map((option) => (
              <option value={option.id} key={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Título</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={reportType === "pmu" ? "Ej. PMU Comuna 3" : "Ej. Falta agua potable"}
            maxLength={140}
          />
        </label>

        <label>
          <span>Descripción (opcional)</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={2000}
          />
        </label>

        <label>
          <span>Contacto (opcional, solo para seguimiento — no se publica)</span>
          <input
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="Teléfono o WhatsApp"
            maxLength={160}
          />
        </label>

        {error && (
          <p className="communityReportFormError" role="alert">
            {error}
          </p>
        )}

        <div className="communityReportFormActions">
          <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Publicando…" : "Publicar reporte"}
          </button>
        </div>
      </div>
    </div>
  );
}
