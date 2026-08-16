"use client";

import { geoBounds } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommunityReportForm, type PublicCommunityReport } from "./community-report-form";
import { IconCrosshair, IconLocation } from "./icons";
import type { SgcEvent } from "./pulso-map";

// MapLibre toca `window` al importarse, así que solo puede cargarse en el navegador.
const PulsoMap = dynamic(() => import("./pulso-map").then((mod) => mod.PulsoMap), {
  ssr: false,
  loading: () => <div className="pulsoMapCanvas mapLoading">Cargando mapa…</div>,
});

type DepartmentProperties = { dpto_ccdgo: string; dpto_cnmbre: string };
type MunicipalityProperties = {
  mpio_cdpmp: string;
  mpio_cnmbre: string;
  dpto_ccdgo: string;
  dpto_cnmbre: string;
};

export type PublicMapLayer = "coverage" | "damage" | "supplies" | "donations" | "teams";

type MapStatus = { label: string; token: string };
type LayerDefinition = {
  title: string;
  defaultStatus: MapStatus;
  statuses: Record<string, MapStatus>;
  legend: MapStatus[];
};

const status = (token: string, label: string): MapStatus => ({ token, label });

/** Color de relleno por token de estado, tomado de los tokens del sistema de diseño. */
const STATUS_FILL: Record<string, string> = {
  unknown: "#d94b38",
  assigned: "#c8811d",
  partial: "#35708f",
  visited: "#257350",
  inaccessible: "#6b4d83",
  "no-data": "#c8c3b7",
  minor: "#257350",
  covered: "#257350",
  delivered: "#257350",
  completed: "#257350",
  moderate: "#35708f",
  "in-transit": "#35708f",
  reconciled: "#35708f",
  deployed: "#35708f",
  severe: "#c8811d",
  gap: "#c8811d",
  allocated: "#c8811d",
  active: "#c8811d",
  critical: "#c2371f",
  registered: "#d94b38",
  scheduled: "#c8811d",
};

const layerDefinitions: Record<PublicMapLayer, LayerDefinition> = {
  coverage: {
    title: "Cobertura territorial",
    defaultStatus: status("unknown", "Sin verificar"),
    statuses: {
      "17": status("partial", "Visita parcial"),
      "19": status("inaccessible", "Acceso restringido"),
      "27": status("assigned", "Brigada asignada"),
      "63": status("visited", "Visitada"),
      "66": status("visited", "Visitada"),
      "76": status("partial", "Visita parcial"),
    },
    legend: [
      status("unknown", "Sin verificar"),
      status("assigned", "Asignada"),
      status("partial", "Parcial"),
      status("visited", "Visitada"),
      status("inaccessible", "Acceso restringido"),
    ],
  },
  damage: {
    title: "Daños reportados",
    defaultStatus: status("no-data", "Sin datos publicados"),
    statuses: {
      "17": status("moderate", "Daño moderado"),
      "19": status("severe", "Daño severo"),
      "27": status("critical", "Daño crítico"),
      "63": status("minor", "Daño menor"),
      "66": status("moderate", "Daño moderado"),
      "76": status("severe", "Daño severo"),
    },
    legend: [
      status("no-data", "Sin datos"),
      status("minor", "Menor"),
      status("moderate", "Moderado"),
      status("severe", "Severo"),
      status("critical", "Crítico"),
    ],
  },
  supplies: {
    title: "Brechas de insumos",
    defaultStatus: status("no-data", "Sin datos publicados"),
    statuses: {
      "17": status("in-transit", "En tránsito"),
      "19": status("critical", "Brecha crítica"),
      "27": status("gap", "Brecha abierta"),
      "63": status("covered", "Necesidad cubierta"),
      "66": status("in-transit", "En tránsito"),
      "76": status("gap", "Brecha abierta"),
    },
    legend: [
      status("no-data", "Sin datos"),
      status("covered", "Cubierto"),
      status("in-transit", "En tránsito"),
      status("gap", "Brecha abierta"),
      status("critical", "Crítica"),
    ],
  },
  donations: {
    title: "Estado de donaciones",
    defaultStatus: status("no-data", "Sin datos publicados"),
    statuses: {
      "17": status("allocated", "Ayuda asignada"),
      "19": status("registered", "Donación registrada"),
      "27": status("reconciled", "Donación conciliada"),
      "63": status("delivered", "Entrega verificada"),
      "66": status("allocated", "Ayuda asignada"),
      "76": status("delivered", "Entrega verificada"),
    },
    legend: [
      status("no-data", "Sin datos"),
      status("registered", "Registrada"),
      status("reconciled", "Conciliada"),
      status("allocated", "Asignada"),
      status("delivered", "Entregada"),
    ],
  },
  teams: {
    title: "Equipos de respuesta",
    defaultStatus: status("no-data", "Sin despliegue publicado"),
    statuses: {
      "17": status("deployed", "Equipo desplegado"),
      "19": status("scheduled", "Despliegue programado"),
      "27": status("active", "Equipo activo"),
      "63": status("completed", "Misión completada"),
      "66": status("active", "Equipo activo"),
      "76": status("deployed", "Equipo desplegado"),
    },
    legend: [
      status("no-data", "Sin datos"),
      status("scheduled", "Programado"),
      status("deployed", "Desplegado"),
      status("active", "Activo"),
      status("completed", "Completado"),
    ],
  },
};

type AtlasMapProps = {
  layer?: PublicMapLayer;
  selectedCode?: string;
  onSelectCode?: (code: string, name: string) => void;
  onActiveReportChange?: (report: PublicCommunityReport | null) => void;
  focusMunicipalityCode?: string;
};

/**
 * Contención punto-en-polígono en el plano, por lanzamiento de rayo.
 *
 * No se usa `geoContains` de d3-geo: ese resuelve en la esfera, donde el sentido de giro del
 * anillo decide qué lado es "adentro", y los polígonos del MGN del DANE no traen un sentido
 * consistente. Un municipio invertido se comportaba como todo el globo menos el municipio, y el
 * mapa decía que estabas parado en Alto Baudó con la vista sobre Acandí.
 */
function ringContains(ring: number[][], point: [number, number]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];
    if (!current || !previous) continue;
    const [xi, yi] = current as [number, number];
    const [xj, yj] = previous as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonContains(rings: number[][][], point: [number, number]): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !ringContains(outer, point)) return false;
  return !holes.some((hole) => ringContains(hole, point));
}

function geometryContains(geometry: Geometry, point: [number, number]): boolean {
  if (geometry.type === "Polygon") return polygonContains(geometry.coordinates, point);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((rings) => polygonContains(rings, point));
  }
  return false;
}

const COLOMBIA_BOUNDS: [number, number, number, number] = [-79.5, -4.3, -66.8, 13.5];

export function AtlasMap({
  layer = "coverage",
  selectedCode: controlledCode,
  onSelectCode,
  onActiveReportChange,
  focusMunicipalityCode,
}: AtlasMapProps) {
  const [data, setData] = useState<FeatureCollection<Geometry, DepartmentProperties> | null>(null);
  const [sgcEvents, setSgcEvents] = useState<SgcEvent[]>([]);
  const [internalCode, setInternalCode] = useState("76");
  const [error, setError] = useState(false);
  const selectedCode = controlledCode ?? internalCode;
  const definition = layerDefinitions[layer];
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const incidentCode = "colombia-2026";

  const [zoomedCode, setZoomedCode] = useState<string | null>(null);
  const [municipalitiesByDept, setMunicipalitiesByDept] = useState<
    Record<string, FeatureCollection<Geometry, MunicipalityProperties>>
  >({});

  const [reports, setReports] = useState<PublicCommunityReport[]>([]);
  const [reportsTotal, setReportsTotal] = useState(0);
  const [reportMode, setReportMode] = useState(false);
  const [pendingPoint, setPendingPoint] = useState<[number, number] | null>(null);
  const [optimisticReports, setOptimisticReports] = useState<PublicCommunityReport[]>([]);
  const [activeReport, setActiveReport] = useState<PublicCommunityReport | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    onActiveReportChange?.(activeReport);
  }, [activeReport, onActiveReportChange]);

  /**
   * Completa el reporte abierto cuando viene de la vista ligera del mapa, que no trae descripción
   * ni metadata — esa es la razón de que quepan los 2.288 puntos.
   */
  useEffect(() => {
    if (!activeReport || activeReport.metadata !== undefined) return;
    const controller = new AbortController();
    fetch(`${apiUrl}/v1/public/incidents/${incidentCode}/community-reports/${activeReport.id}`, {
      signal: controller.signal,
    })
      .then((response) =>
        response.ok ? (response.json() as Promise<PublicCommunityReport>) : null,
      )
      .then((full) => {
        if (full) setActiveReport((current) => (current?.id === full.id ? full : current));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [activeReport, apiUrl]);

  /**
   * Elegir un municipio mueve el mapa hasta él. El primer render se excluye: el selector arranca
   * con el primero de la lista y eso no es la elección de nadie.
   */
  const municipalityFocusReady = useRef(false);
  useEffect(() => {
    if (!focusMunicipalityCode) return;
    if (!municipalityFocusReady.current) {
      municipalityFocusReady.current = true;
      return;
    }
    setZoomedCode((current) => (current === selectedCode ? current : selectedCode));
  }, [focusMunicipalityCode, selectedCode]);

  useEffect(() => {
    const controller = new AbortController();
    const loadTerritories = async () => {
      try {
        const response = await fetch(
          `${apiUrl}/v1/public/incidents/${incidentCode}/territories?level=department`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("La capa DANE todavía no está importada");
        const collection = (await response.json()) as FeatureCollection<
          Geometry,
          DepartmentProperties
        >;
        if (collection.features.length !== 33) throw new Error("La capa DANE está incompleta");
        setData(collection);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        try {
          const fallback = await fetch("/data/colombia-departamentos.geojson", {
            signal: controller.signal,
          });
          if (!fallback.ok) throw new Error("No fue posible cargar la capa territorial");
          setData((await fallback.json()) as FeatureCollection<Geometry, DepartmentProperties>);
        } catch (fallbackReason) {
          if (!(fallbackReason instanceof DOMException && fallbackReason.name === "AbortError")) {
            setError(true);
          }
        }
      }
    };
    const loadSgcEvents = async () => {
      try {
        const response = await fetch(
          `${apiUrl}/v1/public/sources/sgc-realtime-earthquakes/snapshot`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const snapshot = (await response.json()) as { events?: SgcEvent[] };
        setSgcEvents(
          (snapshot.events ?? [])
            .filter(
              (event) =>
                event.magnitude >= 2 &&
                event.latitude >= 2.5 &&
                event.latitude <= 7.5 &&
                event.longitude >= -79.5 &&
                event.longitude <= -73.5,
            )
            .slice(0, 150),
        );
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setSgcEvents([]);
      }
    };
    void Promise.all([loadTerritories(), loadSgcEvents()]);
    return () => controller.abort();
  }, [apiUrl]);

  /** Caja del departamento en foco, para acotar la consulta de reportes por geografía. */
  const zoomedBoundingBox = useMemo(() => {
    if (!zoomedCode || !data) return null;
    const feature = data.features.find((item) => item.properties.dpto_ccdgo === zoomedCode);
    if (!feature) return null;
    const [[west, south], [east, north]] = geoBounds(feature);
    if (![west, south, east, north].every(Number.isFinite)) return null;
    return [west, south, east, north] as [number, number, number, number];
  }, [zoomedCode, data]);

  useEffect(() => {
    const controller = new AbortController();
    // Sin caja se pide la vista de mapa: todos los reportes del país en su forma ligera.
    const query = zoomedBoundingBox ? `?bbox=${zoomedBoundingBox.join(",")}` : "?view=map";
    fetch(`${apiUrl}/v1/public/incidents/${incidentCode}/community-reports${query}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("No fue posible cargar los reportes ciudadanos");
        return response.json() as Promise<{ reports: PublicCommunityReport[]; total: number }>;
      })
      .then((page) => {
        setReports(page.reports);
        setReportsTotal(page.total);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setReports([]);
          setReportsTotal(0);
        }
      });
    return () => controller.abort();
  }, [apiUrl, zoomedBoundingBox]);

  useEffect(() => {
    if (!zoomedCode || municipalitiesByDept[zoomedCode]) return;
    const controller = new AbortController();
    fetch(
      `${apiUrl}/v1/public/incidents/${incidentCode}/territories?level=municipality&departmentCode=${zoomedCode}`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!response.ok) throw new Error("No fue posible cargar los municipios");
        return response.json() as Promise<FeatureCollection<Geometry, MunicipalityProperties>>;
      })
      .then((collection) => {
        setMunicipalitiesByDept((current) => ({ ...current, [zoomedCode]: collection }));
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setMunicipalitiesByDept((current) => ({
            ...current,
            [zoomedCode]: { type: "FeatureCollection", features: [] },
          }));
        }
      });
    return () => controller.abort();
  }, [zoomedCode, municipalitiesByDept, apiUrl]);

  const allReports = useMemo(
    () => [
      ...optimisticReports,
      ...reports.filter((r) => !optimisticReports.some((o) => o.id === r.id)),
    ],
    [reports, optimisticReports],
  );

  const departments = useMemo(
    () =>
      [...(data?.features ?? [])].sort((a, b) =>
        a.properties.dpto_cnmbre.localeCompare(b.properties.dpto_cnmbre, "es"),
      ),
    [data],
  );

  /** Color de relleno por departamento según la capa activa. */
  const departmentColors = useMemo(() => {
    const colors: Record<string, string> = {};
    for (const feature of departments) {
      const code = feature.properties.dpto_ccdgo;
      const token = (definition.statuses[code] ?? definition.defaultStatus).token;
      colors[code] = STATUS_FILL[token] ?? "#c8c3b7";
    }
    return colors;
  }, [departments, definition]);

  const selected = departments.find((feature) => feature.properties.dpto_ccdgo === selectedCode);
  const selectedStatus = definition.statuses[selectedCode] ?? definition.defaultStatus;
  const zoomedDepartmentName = departments.find((item) => item.properties.dpto_ccdgo === zoomedCode)
    ?.properties.dpto_cnmbre;

  /** El municipio bajo el centro de la vista: "¿dónde estoy parado?". */
  const centerMunicipalityName = useMemo(() => {
    if (!zoomedCode || !mapCenter) return null;
    const collection = municipalitiesByDept[zoomedCode];
    if (!collection) return null;
    const match = collection.features.find((feature) =>
      geometryContains(feature.geometry, mapCenter),
    );
    return match?.properties.mpio_cnmbre ?? null;
  }, [zoomedCode, mapCenter, municipalitiesByDept]);

  const formatLatLng = ([lng, lat]: [number, number]) =>
    // Longitud negativa es oeste; Colombia está entera al oeste de Greenwich.
    `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? "E" : "O"}`;

  const selectDepartment = (code: string, name?: string) => {
    const department = departments.find((item) => item.properties.dpto_ccdgo === code);
    setInternalCode(code);
    onSelectCode?.(code, name ?? department?.properties.dpto_cnmbre ?? "Departamento");
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Este navegador no permite compartir la ubicación.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: [number, number] = [position.coords.longitude, position.coords.latitude];
        setLocating(false);
        setReportMode(true);
        setMapCenter(point);
        const containing = departments.find((feature) => geometryContains(feature.geometry, point));
        if (containing) {
          const code = containing.properties.dpto_ccdgo;
          selectDepartment(code);
          setZoomedCode(code);
        }
        setPendingPoint(point);
      },
      () => {
        setLocating(false);
        setLocationError("No pudimos obtener tu ubicación. Puedes tocar el mapa en su lugar.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  /** Caja a la que volar. Sin departamento en foco, el país entero. */
  const flyToBounds = useMemo<[number, number, number, number] | null>(
    () => (zoomedCode ? zoomedBoundingBox : COLOMBIA_BOUNDS),
    [zoomedCode, zoomedBoundingBox],
  );

  return (
    <div className="atlasMap">
      {/* Dónde estoy parado. Arriba y siempre visible: es la primera pregunta de cualquiera que
          abre un mapa. */}
      <div className="mapWhereAmI" aria-live="polite">
        <div className="mapWhereTrail">
          <button
            type="button"
            className="mapCrumb"
            onClick={() => setZoomedCode(null)}
            disabled={!zoomedCode}
          >
            Colombia
          </button>
          {zoomedDepartmentName ? (
            <>
              <i aria-hidden="true">›</i>
              <span className="mapCrumb current">{zoomedDepartmentName}</span>
            </>
          ) : null}
          {centerMunicipalityName ? (
            <>
              <i aria-hidden="true">›</i>
              <span className="mapCrumb current">{centerMunicipalityName}</span>
            </>
          ) : null}
        </div>
        <p className="mapWhereDetail">
          {mapCenter
            ? `Centro de la vista: ${formatLatLng(mapCenter)}`
            : "Toca un departamento para acercarte y ver sus reportes uno por uno"}
        </p>
      </div>

      <div className="mapToolbar">
        <div className="mapToolbarLayer">
          <span className="mapKicker">Capa visible</span>
          <strong>{definition.title}</strong>
        </div>
        <div className="mapToolbarActions">
          {zoomedCode && (
            <button type="button" className="mapZoomReset" onClick={() => setZoomedCode(null)}>
              ← Volver a Colombia
            </button>
          )}
          <label>
            <span>Ir a un departamento</span>
            <select
              value={selectedCode}
              onChange={(event) => {
                selectDepartment(event.target.value);
                setZoomedCode(event.target.value);
              }}
            >
              {departments.map((department) => (
                <option
                  value={department.properties.dpto_ccdgo}
                  key={department.properties.dpto_ccdgo}
                >
                  {department.properties.dpto_cnmbre}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Reportar es la acción principal de esta pantalla, así que vive en su propia barra con
          dos caminos: tocar el mapa o dejar que el dispositivo diga dónde estás. */}
      <div className={`mapReportBar${reportMode ? " active" : ""}`}>
        <button
          type="button"
          className={`mapReportToggle${reportMode ? " active" : ""}`}
          onClick={() => {
            setReportMode((current) => !current);
            setPendingPoint(null);
            setLocationError(null);
          }}
        >
          {reportMode ? (
            "✕ Cancelar"
          ) : (
            <>
              <IconLocation />
              Reportar un PMU o una necesidad
            </>
          )}
        </button>
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
        {reportMode ? (
          <p className="mapReportHint" role="status">
            Toca el punto exacto en el mapa. Puedes acercarte primero para afinar.
          </p>
        ) : (
          <p className="mapReportHint muted">
            Cualquier persona puede reportar, sin cuenta. Se publica al instante como
            <strong> sin verificar</strong>.
          </p>
        )}
        {locationError ? (
          <p className="mapReportHint error" role="alert">
            {locationError}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="mapLoading" role="alert">
          No fue posible cargar la capa territorial.
        </div>
      ) : (
        <PulsoMap
          departments={data}
          municipalities={zoomedCode ? (municipalitiesByDept[zoomedCode] ?? null) : null}
          reports={allReports}
          sgcEvents={sgcEvents}
          departmentColors={departmentColors}
          selectedCode={selectedCode}
          reportMode={reportMode}
          pendingPoint={pendingPoint}
          flyToBounds={flyToBounds}
          onSelectDepartment={(code, name) => {
            selectDepartment(code, name);
            setZoomedCode(code);
          }}
          onSelectReport={setActiveReport}
          onMapClickForReport={setPendingPoint}
          onCenterChange={setMapCenter}
        />
      )}

      {pendingPoint && (
        <CommunityReportForm
          point={pendingPoint}
          apiUrl={apiUrl}
          incidentCode={incidentCode}
          onClose={() => setPendingPoint(null)}
          onSubmitted={(report) => {
            setOptimisticReports((current) => [...current, report]);
            setPendingPoint(null);
            setReportMode(false);
          }}
        />
      )}

      <div className="mapSelection" aria-live="polite">
        <span>Territorio seleccionado</span>
        <strong>{selected?.properties.dpto_cnmbre ?? "Cargando…"}</strong>
        <span className={`coverageBadge ${selectedStatus.token}`}>{selectedStatus.label}</span>
      </div>

      <ul className="mapLegend embedded" aria-label={`Leyenda: ${definition.title}`}>
        {definition.legend.map((item) => (
          <li key={`${layer}-${item.token}`}>
            <i className={`statusDot ${item.token}`} /> {item.label}
          </li>
        ))}
        {sgcEvents.length > 0 ? (
          <li>
            <i className="statusDot seismic" /> {sgcEvents.length} eventos SGC ≥ M 2 en la región
          </li>
        ) : null}
        {allReports.length > 0 ? (
          <li>
            <i className="statusDot pmu" />{" "}
            {reportsTotal > allReports.length
              ? `${allReports.length} de ${reportsTotal.toLocaleString("es-CO")} reportes ciudadanos`
              : `${allReports.length.toLocaleString("es-CO")} reportes ciudadanos (PMU / necesidades)`}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
