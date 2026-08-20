"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  IconBuilding,
  IconCrosshair,
  IconDot,
  IconFlag,
  IconFood,
  IconHealth,
  IconHygiene,
  IconLocation,
  IconPaw,
  IconRescue,
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

export type CommunityReportType =
  | "rescate"
  | "pmu"
  | "necesidad"
  | "via"
  | "dano"
  | "acopio"
  | "albergue";
export type CommunityReportUrgency = "baja" | "media" | "alta" | "critica";
export type RescueSignsOfLife = "yes" | "no" | "unknown";
export type RouteStatus = "bloqueada" | "habilitada";
export type DamageSeverity = "colapso" | "grave" | "moderado" | "leve" | "sin_evaluar";
export type LocationPrecision = "hidden" | "zone" | "neighborhood" | "approximate" | "geocoded";
export type CommunityReportCategory =
  | "agua"
  | "alimentos"
  | "salud"
  | "refugio"
  | "higiene"
  | "herramienta"
  | "escombros"
  | "voluntariado"
  | "animales"
  | "logistica"
  | "catastros"
  | "puntos_ayuda"
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
  peopleReported: number | null;
  signsOfLife: RescueSignsOfLife | null;
  respondersOnSite: boolean | null;
  routeStatus: RouteStatus | null;
  damageSeverity: DamageSeverity | null;
  shelterCapacity: number | null;
  shelterOccupancy: number | null;
  locationPrecision: LocationPrecision;
  createdAt: string;
};

/** Cuántas personas se cree que hay. El último tramo es abierto: «6» significa «seis o más». */
export const PEOPLE_CHOICES: Array<{ value: number | null; label: string }> = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6 o más" },
  { value: null, label: "No sé" },
];

export const peopleReportedLabel = (value: number | null) =>
  value === null
    ? null
    : value >= 6
      ? "6 o más personas"
      : `${value} persona${value > 1 ? "s" : ""}`;

export const SIGNS_OF_LIFE_CHOICES: Array<{ value: RescueSignsOfLife; label: string }> = [
  { value: "yes", label: "Sí, se oye o se ve" },
  { value: "unknown", label: "No sé todavía" },
  { value: "no", label: "No se percibe nada" },
];

/**
 * Arma el título del rescate con lo que la persona ya respondió.
 *
 * Un rescate no debería exigir que alguien redacte un titular de pie al lado de un derrumbe. Los
 * botones ya dicen todo lo que el título necesita decir, así que el título se deduce y el campo de
 * texto desaparece del formulario.
 */
export const rescueTitle = (people: number | null, signs: RescueSignsOfLife | null) => {
  const who = peopleReportedLabel(people) ?? "Personas";
  const how =
    signs === "yes"
      ? "se oyen señales de vida"
      : signs === "no"
        ? "sin señales percibidas"
        : "señales sin confirmar";
  return `${who} bajo escombros — ${how}`;
};

/**
 * De dónde salió cada punto importado.
 *
 * Estaban solo dos de las seis fuentes, así que cuatro de cada diez puntos del mapa se mostraban
 * sin decir de dónde venían. La procedencia es la mitad de lo que hace confiable a Pulso: un dato
 * sin origen visible vale lo mismo que un rumor.
 */
export const externalSourceLabels: Record<string, { name: string; url: string }> = {
  "mapadelterremoto-registro": {
    name: "Mapa del terremoto",
    url: "https://www.mapadelterremoto.com/",
  },
  "contemos-mapa-situacion": {
    name: "contemos.org",
    url: "https://mapa.contemos.org/",
  },
  "gravitas-mapa-ciudadano": {
    name: "GRAVITAS",
    url: "https://www.mapa.gravitasworld.com/",
  },
  "redcaliayuda-necesidades": {
    name: "Red Cali Ayuda",
    url: "https://redcaliayuda.vercel.app/necesidades",
  },
  "redcaliayuda-acopio": {
    name: "Red Cali Ayuda · acopio",
    url: "https://redcaliayuda.vercel.app/acopio",
  },
  "ayudaspereira-centros": {
    name: "Ayudas Pereira",
    url: "https://ayudaspereira.com/",
  },
  "terremotocolombia-co": {
    name: "terremotocolombia.co",
    url: "https://terremotocolombia.co/",
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
  { id: "refugio", label: "Dónde dormir", Icon: IconShelter },
  { id: "higiene", label: "Higiene", Icon: IconHygiene },
  { id: "herramienta", label: "Herramientas", Icon: IconTools },
  { id: "escombros", label: "Escombros", Icon: IconRubble },
  { id: "voluntariado", label: "Voluntariado", Icon: IconVolunteer },
  { id: "animales", label: "Animales", Icon: IconPaw },
  { id: "logistica", label: "Logística", Icon: IconTruck },
  { id: "catastros", label: "Catastros", Icon: IconBuilding },
  { id: "puntos_ayuda", label: "Puntos de ayuda", Icon: IconLocation },
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
  const [reportType, setReportType] = useState<CommunityReportType>("rescate");
  /*
   * Arranca sin elegir, no en «agua».
   *
   * Con una categoría preseleccionada, un reporte enviado sin tocar esa fila afirma algo que la
   * persona no dijo — y `agua` ya tiene 395 filas, así que el sesgo se acumula justo donde se lee
   * qué hace falta. El esquema la admite nula: «alguien reportó una necesidad y no dijo de qué» es
   * un dato honesto, y «agua» dicho por el formulario no lo es.
   */
  const [category, setCategory] = useState<CommunityReportCategory | null>(null);
  const [urgency, setUrgency] = useState<CommunityReportUrgency | "">("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [peopleReported, setPeopleReported] = useState<number | null>(null);
  const [signsOfLife, setSignsOfLife] = useState<RescueSignsOfLife | null>(null);
  const [respondersOnSite, setRespondersOnSite] = useState<boolean | null>(null);
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

  const isRescue = reportType === "rescate";
  // En un rescate el título se deduce de los botones; en el resto lo escribe la persona.
  const effectiveTitle = isRescue ? rescueTitle(peopleReported, signsOfLife) : title.trim();

  const submit = async () => {
    if (!point) {
      setError("Marca un punto en el mini mapa antes de publicar.");
      return;
    }
    if (effectiveTitle.length < 3) {
      setError("Escribe un título de al menos 3 caracteres.");
      return;
    }
    // La categoría no viene preelegida, así que hay que pedirla aquí. El servidor rechaza una
    // necesidad sin categoría, y dejar que el envío llegue hasta allá devolvería un error de
    // validación en inglés a alguien que está de pie en la calle.
    if (reportType === "necesidad" && category === null) {
      setError("Elige de qué es la necesidad.");
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
            title: effectiveTitle,
            description: description.trim() || null,
            location: { type: "Point", coordinates: point },
            contact: contact.trim() || null,
            peopleReported: isRescue ? peopleReported : null,
            signsOfLife: isRescue ? signsOfLife : null,
            respondersOnSite: isRescue ? respondersOnSite : null,
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
          {/* El rescate va primero y ocupa toda la fila. No es jerarquía visual por gusto: es el
              único reporte donde el tiempo entre enviarlo y atenderlo se mide en vidas, y quien lo
              envía casi siempre está en el sitio, con una mano, y sin tiempo de leer opciones. */}
          <button
            type="button"
            className={`communityReportRescueOption ${isRescue ? "active" : ""}`}
            onClick={() => setReportType("rescate")}
          >
            <IconRescue />
            Hay personas atrapadas
          </button>
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

        {isRescue && (
          <div className="communityReportRescue">
            {/* Ninguna de las tres es obligatoria. La ubicación ya es la mitad del valor del reporte,
                y un formulario que exige respuestas es un formulario que se abandona. */}
            <fieldset>
              <legend>¿Cuántas personas crees que hay?</legend>
              <div className="communityReportChips">
                {PEOPLE_CHOICES.map((choice) => (
                  <button
                    type="button"
                    key={choice.label}
                    className={peopleReported === choice.value ? "active" : ""}
                    onClick={() => setPeopleReported(choice.value)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>¿Se oye o se ve alguna señal?</legend>
              <div className="communityReportChips">
                {SIGNS_OF_LIFE_CHOICES.map((choice) => (
                  <button
                    type="button"
                    key={choice.value}
                    className={signsOfLife === choice.value ? "active" : ""}
                    onClick={() => setSignsOfLife(choice.value)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>¿Ya hay rescatistas en el sitio?</legend>
              <div className="communityReportChips">
                <button
                  type="button"
                  className={respondersOnSite === true ? "active" : ""}
                  onClick={() => setRespondersOnSite(true)}
                >
                  Sí, ya están
                </button>
                <button
                  type="button"
                  className={respondersOnSite === false ? "active" : ""}
                  onClick={() => setRespondersOnSite(false)}
                >
                  No hay nadie
                </button>
              </div>
            </fieldset>

            <p className="communityReportRescueTitle">
              Se publicará como: <strong>{effectiveTitle}</strong>
            </p>
            <p className="communityReportRescueWarn">
              Esto no reemplaza al 123. Si no has llamado, llama primero.
            </p>
          </div>
        )}

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

        {!isRescue && (
          <label>
            <span>Título</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={reportType === "pmu" ? "Ej. PMU Comuna 3" : "Ej. Falta agua potable"}
              maxLength={140}
            />
          </label>
        )}

        <label>
          <span>
            {isRescue
              ? "¿Dónde exactamente? (opcional: piso, apartamento, punto de referencia)"
              : "Descripción (opcional)"}
          </span>
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
          <button
            type="button"
            className={isRescue ? "communityReportRescueSubmit" : ""}
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? "Publicando…" : isRescue ? "Enviar ahora" : "Publicar reporte"}
          </button>
        </div>
      </div>
    </div>
  );
}
