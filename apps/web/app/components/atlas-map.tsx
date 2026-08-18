"use client";

import { geoBounds, geoIdentity, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { reportStatusToken } from "./community-report-detail";
import { CommunityReportForm, type PublicCommunityReport } from "./community-report-form";
import { IconCrosshair, IconLocation, REPORT_MARKER_PATH } from "./icons";

// Leaflet touches `window` at module scope, which breaks Next.js's server render pass
// even inside a "use client" component — it must only ever be loaded in the browser.
const LeafletMap = dynamic(() => import("./leaflet-map").then((mod) => mod.LeafletMap), {
  ssr: false,
  loading: () => <div className="leafletMapContainer mapLoading">Cargando mapa…</div>,
});

type DepartmentProperties = {
  dpto_ccdgo: string;
  dpto_cnmbre: string;
};

type MunicipalityProperties = {
  mpio_cdpmp: string;
  mpio_cnmbre: string;
  dpto_ccdgo: string;
  dpto_cnmbre: string;
};

type SgcEvent = {
  id: string;
  magnitude: number;
  depthKm: number;
  latitude: number;
  longitude: number;
  localTime: string;
  place: string;
  status: "manual" | "automatic" | "unknown";
};

export type PublicMapLayer = "coverage" | "damage" | "supplies" | "donations" | "teams";

type MapStatus = {
  label: string;
  token: string;
};

type LayerDefinition = {
  title: string;
  defaultStatus: MapStatus;
  statuses: Record<string, MapStatus>;
  legend: MapStatus[];
};

const status = (token: string, label: string): MapStatus => ({ token, label });

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
  // Niveles territoriales adicionales (municipio/localidad del perfil de demostración) que el
  // llamador quiera anexar al mismo breadcrumb del recuadro verde, en vez de duplicar
  // "Colombia › departamento" en una barra aparte.
  trailExtra?: ReactNode;
};

const MAX_SPREAD_RING = 8;

// Contención punto-en-polígono en el plano, por lanzamiento de rayo.
//
// No se usa `geoContains` de d3-geo a propósito: ese resuelve en la esfera y ahí el sentido de
// giro del anillo decide qué lado es "adentro". Los polígonos del MGN del DANE no vienen con un
// sentido consistente, así que un municipio con el giro invertido se comporta como todo el globo
// menos el municipio, y el mapa terminaba diciendo que estabas parado en Alto Baudó cuando la
// vista estaba sobre Acandí. A escala municipal la diferencia entre plano y esfera es
// despreciable; la del sentido de giro no lo es.
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

type DeclusteredPoint<T> =
  | { kind: "point"; x: number; y: number; item: T }
  | { kind: "cluster"; x: number; y: number; items: T[] };

// Groups points that land within `screenCellPx` of each other on screen. Small groups (up to
// MAX_SPREAD_RING) spread into a single tight ring so each stays individually clickable; larger
// groups (e.g. hundreds of reports concentrated in downtown Cali at country zoom) collapse into
// one cluster marker with a count instead — spreading them individually would either overlap
// again or, with unbounded ring growth, shoot points far outside the cluster. Distances are
// computed in raw projected space, scaled by the current zoom factor so the resulting on-screen
// spacing/threshold stays consistent as the user zooms in.
function declusterPoints<T>(
  points: Array<{ x: number; y: number; item: T }>,
  scale: number,
  screenCellPx: number,
  screenSpreadPx: number,
): DeclusteredPoint<T>[] {
  const cell = screenCellPx / scale;
  const spread = screenSpreadPx / scale;
  const buckets = new Map<string, Array<{ x: number; y: number; item: T }>>();
  for (const point of points) {
    const key = `${Math.round(point.x / cell)}:${Math.round(point.y / cell)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(point);
    else buckets.set(key, [point]);
  }
  const result: DeclusteredPoint<T>[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length === 1) {
      const [only] = bucket;
      if (only) result.push({ kind: "point", x: only.x, y: only.y, item: only.item });
      continue;
    }
    const cx = bucket.reduce((sum, p) => sum + p.x, 0) / bucket.length;
    const cy = bucket.reduce((sum, p) => sum + p.y, 0) / bucket.length;
    if (bucket.length > MAX_SPREAD_RING) {
      result.push({ kind: "cluster", x: cx, y: cy, items: bucket.map((p) => p.item) });
      continue;
    }
    bucket.forEach((point, index) => {
      const angle = (index / bucket.length) * Math.PI * 2;
      result.push({
        kind: "point",
        x: cx + Math.cos(angle) * spread,
        y: cy + Math.sin(angle) * spread,
        item: point.item,
      });
    });
  }
  return result;
}

export function AtlasMap({
  layer = "coverage",
  selectedCode: controlledCode,
  onSelectCode,
  onActiveReportChange,
  focusMunicipalityCode,
  trailExtra,
}: AtlasMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [data, setData] = useState<FeatureCollection<Geometry, DepartmentProperties> | null>(null);
  const [sgcEvents, setSgcEvents] = useState<SgcEvent[]>([]);
  const [internalCode, setInternalCode] = useState("27");
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
  // Centro actual de la vista Leaflet: es lo que permite decir en qué municipio está parado
  // quien mira el mapa, en vez de solo repetir el departamento que eligió.
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    onActiveReportChange?.(activeReport);
  }, [activeReport, onActiveReportChange]);

  /**
   * Completa el reporte abierto cuando viene de la vista ligera.
   *
   * En vista de país los marcadores no traen descripción ni metadata —esa es la razón de que
   * quepan todos—, así que al abrir uno se pide su detalle. Se hace aquí y no en la tarjeta para
   * que el estado siga viviendo en un solo lugar.
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset-on-change — fires whenever zoomedCode changes, body doesn't need to read it.
  useEffect(() => {
    setActiveReport(null);
  }, [zoomedCode]);

  /**
   * Elegir un municipio mueve el mapa hasta él.
   *
   * El primer render se excluye a propósito. Antes no: el selector arranca con el primer municipio
   * del departamento por omisión, así que el mapa abría metido en la vista de detalle de Acandí,
   * Chocó — el extremo norte del país, sin relación con el sismo— en vez de mostrar Colombia. Nadie
   * había pedido ir ahí; era el valor inicial de un desplegable comportándose como una decisión del
   * usuario.
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

  // Caja del departamento en el que estás parado. El listado público va acotado, y acotarlo por
  // recencia sobre todo el país hacía que cada ingesta empujara reportes viejos fuera de la
  // ventana: desaparecían del mapa solos. Pidiendo por caja, el departamento cabe entero y lo que
  // ves se queda donde está.
  const zoomedBoundingBox = useMemo(() => {
    if (!zoomedCode || !data) return null;
    const feature = data.features.find((item) => item.properties.dpto_ccdgo === zoomedCode);
    if (!feature) return null;
    const [[west, south], [east, north]] = geoBounds(feature);
    if (![west, south, east, north].every(Number.isFinite)) return null;
    return [west, south, east, north] as const;
  }, [zoomedCode, data]);

  useEffect(() => {
    const controller = new AbortController();
    // Sin caja se pide la vista de mapa: trae todos los reportes del país en su forma ligera, en
    // vez de los 800 más recientes. Ese recorte era lo que hacía que los puntos desaparecieran
    // solos cada vez que entraba una ingesta.
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

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const height = Math.max(430, Math.min(620, width * 0.78));
  const projection = useMemo(() => {
    if (!data) return null;
    return geoIdentity()
      .reflectY(true)
      .fitExtent(
        [
          [24, 22],
          [width - 24, height - 22],
        ],
        data,
      );
  }, [data, height, width]);

  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);

  const departmentPaths = useMemo(() => {
    if (!data || !path) return [];
    return data.features.map((feature) => ({ feature, d: path(feature) ?? "" }));
  }, [data, path]);

  const municipalityPaths = useMemo(() => {
    if (!zoomedCode || !path) return [];
    const collection = municipalitiesByDept[zoomedCode];
    if (!collection) return [];
    return collection.features.map((feature) => ({ feature, d: path(feature) ?? "" }));
  }, [zoomedCode, municipalitiesByDept, path]);

  const allReports = useMemo(
    () => [
      ...optimisticReports,
      ...reports.filter((r) => !optimisticReports.some((o) => o.id === r.id)),
    ],
    [reports, optimisticReports],
  );

  const projectedEvents = useMemo(() => {
    if (!projection) return [];
    return sgcEvents.flatMap((event) => {
      const point = projection([event.longitude, event.latitude]);
      return point ? [{ event, x: point[0], y: point[1] }] : [];
    });
  }, [projection, sgcEvents]);

  const projectedReports = useMemo(() => {
    if (!projection) return [];
    return allReports.flatMap((report) => {
      const point = projection(report.location.coordinates);
      return point ? [{ report, x: point[0], y: point[1] }] : [];
    });
  }, [projection, allReports]);

  const zoomTransform = useMemo(() => {
    const identity = { scale: 1, x: 0, y: 0 };
    if (!zoomedCode || !path) return identity;
    const feature = data?.features.find((item) => item.properties.dpto_ccdgo === zoomedCode);
    if (!feature) return identity;
    const bounds = path.bounds(feature);
    const [[x0, y0], [x1, y1]] = bounds;
    const boundsWidth = x1 - x0;
    const boundsHeight = y1 - y0;
    if (boundsWidth <= 0 || boundsHeight <= 0) return identity;
    const scale = Math.max(
      1,
      Math.min(9, 0.82 / Math.max(boundsWidth / width, boundsHeight / height)),
    );
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return { scale, x: width / 2 - scale * cx, y: height / 2 - scale * cy };
  }, [zoomedCode, path, data, width, height]);

  const declusteredEvents = useMemo(
    () =>
      declusterPoints(
        projectedEvents.map((entry) => ({ x: entry.x, y: entry.y, item: entry.event })),
        zoomTransform.scale,
        9,
        7,
      ),
    [projectedEvents, zoomTransform.scale],
  );

  const declusteredReports = useMemo(
    () =>
      declusterPoints(
        projectedReports.map((entry) => ({ x: entry.x, y: entry.y, item: entry.report })),
        zoomTransform.scale,
        16,
        11,
      ),
    [projectedReports, zoomTransform.scale],
  );

  const departments = useMemo(
    () =>
      [...(data?.features ?? [])].sort((a, b) =>
        a.properties.dpto_cnmbre.localeCompare(b.properties.dpto_cnmbre, "es"),
      ),
    [data],
  );
  const selectedStatus = definition.statuses[selectedCode] ?? definition.defaultStatus;

  // "¿Dónde estoy parado?" — el municipio que hay debajo del centro de la vista. Se resuelve
  // contra los polígonos DANE ya cargados, sin pedirle nada a un geocodificador externo.
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
    // Longitud negativa es oeste. Colombia está entera al oeste de Greenwich, así que invertir
    // esto imprimía "E" en todo el país.
    `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? "E" : "O"}`;

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

  const selectDepartment = (code: string) => {
    const department = departments.find((item) => item.properties.dpto_ccdgo === code);
    setInternalCode(code);
    onSelectCode?.(code, department?.properties.dpto_cnmbre ?? "Departamento");
  };

  const handleDepartmentClick = (code: string) => {
    if (reportMode) return;
    selectDepartment(code);
    setZoomedCode(code);
  };

  const svgRef = useRef<SVGSVGElement>(null);
  const handleSvgClick = (clientX: number, clientY: number) => {
    if (!reportMode || !projection || !svgRef.current) return;
    const point = svgRef.current.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const local = point.matrixTransform(ctm.inverse());
    // `local` is in root SVG user space; undo the zoom <g>'s transform to recover
    // the raw projected coordinate the projection expects.
    const rawX = (local.x - zoomTransform.x) / zoomTransform.scale;
    const rawY = (local.y - zoomTransform.y) / zoomTransform.scale;
    const lonLat = projection.invert?.([rawX, rawY]);
    if (!lonLat) return;
    setPendingPoint([lonLat[0], lonLat[1]]);
  };

  return (
    <div className="atlasMap" ref={containerRef}>
      {/* Dónde estoy parado. Va arriba y siempre visible: es la primera pregunta que se hace
          cualquiera que abre un mapa, y antes solo aparecía debajo, después del mapa. */}
      <div className="mapWhereAmI" aria-live="polite">
        <p className="mapWhereDetail">
          {zoomedCode
            ? mapCenter
              ? `Centro de la vista: ${formatLatLng(mapCenter)}`
              : "Moviendo el mapa verás en qué municipio estás"
            : "Toca un departamento para entrar y ver sus reportes uno por uno"}
        </p>
        <div className="mapWhereTrail">
          <button
            type="button"
            className="mapCrumb"
            onClick={() => setZoomedCode(null)}
            disabled={!zoomedCode}
          >
            Colombia
          </button>
          <i aria-hidden="true">›</i>
          <label className="mapCrumbSelect">
            <span className="srOnly">Ir a un departamento</span>
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
          {trailExtra}
          {centerMunicipalityName ? (
            <>
              <i aria-hidden="true">›</i>
              <span className="mapCrumb current">{centerMunicipalityName}</span>
            </>
          ) : null}
          <span className={`coverageBadge ${selectedStatus.token}`}>{selectedStatus.label}</span>
        </div>
      </div>

      {/* Capa activa y reportar comparten una sola barra: son las dos acciones inmediatas antes
          de tocar el mapa, y antes vivían en dos franjas separadas mostrando información afín. */}
      <div className={`mapToolbar${reportMode ? " active" : ""}`}>
        <div className="mapToolbarLayer">
          <span className="mapKicker">Capa visible</span>
          <strong>{definition.title}</strong>
        </div>
       <div className="flex">
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
       </div>
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

      {zoomedCode && data ? (
        (() => {
          const departmentFeature = data.features.find(
            (feature) => feature.properties.dpto_ccdgo === zoomedCode,
          );
          if (!departmentFeature) return null;
          return (
            <LeafletMap
              departmentFeature={departmentFeature}
              municipalities={municipalitiesByDept[zoomedCode] ?? null}
              sgcEvents={sgcEvents}
              reports={allReports}
              reportMode={reportMode}
              pendingPoint={pendingPoint}
              onMapClickForReport={setPendingPoint}
              onSelectReport={setActiveReport}
              onCenterChange={setMapCenter}
              {...(selectedCode === zoomedCode && focusMunicipalityCode
                ? { focusMunicipalityCode }
                : {})}
            />
          );
        })()
      ) : error ? (
        <div className="mapLoading" role="alert">
          No fue posible cargar la capa territorial.
        </div>
      ) : data ? (
        // biome-ignore lint/a11y/useKeyWithClickEvents: placing a report at an arbitrary map coordinate has no discrete keyboard equivalent; the department/municipality shapes underneath remain independently keyboard-operable.
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby="map-title map-desc"
          ref={svgRef}
          className={`countryMap ${reportMode ? "reportMode" : ""}`}
          onClick={(event) => handleSvgClick(event.clientX, event.clientY)}
        >
          <title id="map-title">{definition.title} por departamento</title>
          <desc id="map-desc">
            Límites departamentales oficiales de Colombia, eventos sísmicos publicados por el
            Servicio Geológico Colombiano y reportes ciudadanos de puestos de mando y necesidades.
          </desc>
          <g
            style={{
              transform: `translate(${zoomTransform.x}px, ${zoomTransform.y}px) scale(${zoomTransform.scale})`,
              transition: "transform 550ms ease",
            }}
          >
            {departmentPaths.map(({ feature, d }) => {
              const code = feature.properties.dpto_ccdgo;
              const departmentStatus = definition.statuses[code] ?? definition.defaultStatus;
              const isZoomed = code === zoomedCode;
              return (
                // biome-ignore lint/a11y/useSemanticElements: SVG geography cannot be represented by an HTML button.
                <path
                  className={`department status-${departmentStatus.token}${code === selectedCode ? " selected" : ""}${isZoomed ? " zoomed" : ""}`}
                  d={d}
                  key={code}
                  vectorEffect="non-scaling-stroke"
                  onClick={(event) => {
                    if (reportMode) return;
                    event.stopPropagation();
                    handleDepartmentClick(code);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") handleDepartmentClick(code);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <title>{`${feature.properties.dpto_cnmbre}: ${departmentStatus.label}`}</title>
                </path>
              );
            })}

            {municipalityPaths.map(({ feature, d }) => (
              <path
                className="municipality"
                d={d}
                key={feature.properties.mpio_cdpmp}
                vectorEffect="non-scaling-stroke"
              >
                <title>{feature.properties.mpio_cnmbre}</title>
              </path>
            ))}

            {declusteredEvents.map((entry, index) => {
              const key = entry.kind === "point" ? entry.item.id : `sgc-cluster-${index}`;
              if (entry.kind === "cluster") {
                return (
                  <g
                    key={key}
                    className="mapCluster sgcCluster"
                    transform={`translate(${entry.x}, ${entry.y}) scale(${1 / zoomTransform.scale})`}
                  >
                    <circle r={10} />
                    <text textAnchor="middle" dominantBaseline="central">
                      {entry.items.length}
                    </text>
                    <title>{`${entry.items.length} eventos SGC en esta zona — acércate para verlos por separado`}</title>
                  </g>
                );
              }
              const event = entry.item;
              return (
                <circle
                  className={`sgcEvent ${event.status}`}
                  cx={entry.x}
                  cy={entry.y}
                  key={key}
                  r={Math.max(2.5, Math.min(7, event.magnitude * 1.25)) / zoomTransform.scale}
                >
                  <title>{`SGC · M ${event.magnitude.toFixed(1)} · ${event.place} · profundidad ${event.depthKm.toFixed(1)} km · ${event.localTime}`}</title>
                </circle>
              );
            })}

            {declusteredReports.map((entry, index) => {
              const key = entry.kind === "point" ? entry.item.id : `report-cluster-${index}`;
              if (entry.kind === "cluster") {
                return (
                  <g
                    key={key}
                    className="mapCluster reportCluster"
                    transform={`translate(${entry.x}, ${entry.y}) scale(${1 / zoomTransform.scale})`}
                  >
                    <circle r={11} />
                    <text textAnchor="middle" dominantBaseline="central">
                      {entry.items.length}
                    </text>
                    <title>{`${entry.items.length} reportes ciudadanos en esta zona — acércate para verlos por separado`}</title>
                  </g>
                );
              }
              const report = entry.item;
              return (
                // biome-ignore lint/a11y/useSemanticElements: SVG marker cannot be represented by an HTML button.
                <g
                  key={key}
                  className={`communityReportMarker ${reportStatusToken(report.status)}`}
                  transform={`translate(${entry.x}, ${entry.y}) scale(${1 / zoomTransform.scale})`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveReport(report);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setActiveReport(report);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <circle r={9} />
                  {/* El glifo se dibuja a escala 0.55 y centrado: el trazo del set está pensado
                      para 24 y aquí el marcador mide 18 de diámetro. */}
                  <path
                    d={REPORT_MARKER_PATH[report.reportType]}
                    transform="scale(0.55) translate(-12, -12)"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <title>{report.title}</title>
                </g>
              );
            })}

            {pendingPoint &&
              projection &&
              (() => {
                const point = projection(pendingPoint);
                if (!point) return null;
                return (
                  <circle
                    className="communityReportMarker pendingPoint"
                    cx={point[0]}
                    cy={point[1]}
                    r={9 / zoomTransform.scale}
                  />
                );
              })()}
          </g>
        </svg>
      ) : (
        <div className="mapLoading" role="status">
          Cargando territorio…
        </div>
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
            {/* Decir "2.186 reportes" mientras se dibujan 800 es afirmar algo que la pantalla no
                sostiene. Cuando el listado va recortado se nombra el recorte y qué hacer con él. */}
            {reportsTotal > allReports.length
              ? `${allReports.length} de ${reportsTotal.toLocaleString("es-CO")} reportes ciudadanos · entra a un departamento para verlos todos`
              : `${allReports.length} reportes ciudadanos (PMU / necesidades)`}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
