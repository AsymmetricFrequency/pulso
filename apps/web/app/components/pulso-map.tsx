"use client";

import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { PublicCommunityReport } from "./community-report-form";
import { buildPulsoMapStyle, MAP_ATTRIBUTION } from "./map-style";

/**
 * El mapa de Pulso: uno solo.
 *
 * Antes había dos. La vista de país era un SVG dibujado a mano con d3-geo —mil líneas, sin mapa
 * base, con su propio algoritmo de agrupamiento— y al entrar a un departamento se cambiaba a
 * Leaflet. No era un zoom: era un cambio de motor, con otro arrastre, otro zoom y otros
 * marcadores. Ese salto era lo que se sentía roto.
 *
 * Con MapLibre el recorrido de país a calle es continuo y el agrupamiento lo hace el motor, que
 * aguanta los 2.288 puntos sin el código a mano que había que mantener.
 */

type DepartmentProperties = { dpto_ccdgo: string; dpto_cnmbre: string };
type MunicipalityProperties = { mpio_cdpmp: string; mpio_cnmbre: string };

export type SgcEvent = {
  id: string;
  magnitude: number;
  depthKm: number;
  latitude: number;
  longitude: number;
  localTime: string;
  place: string;
};

type PulsoMapProps = {
  departments: FeatureCollection<Geometry, DepartmentProperties> | null;
  municipalities: FeatureCollection<Geometry, MunicipalityProperties> | null;
  reports: PublicCommunityReport[];
  sgcEvents: SgcEvent[];
  /** Color de relleno por código de departamento, según la capa activa. */
  departmentColors: Record<string, string>;
  selectedCode: string | null;
  reportMode: boolean;
  pendingPoint: [number, number] | null;
  /** Caja a la que volar: [oeste, sur, este, norte]. */
  flyToBounds: [number, number, number, number] | null;
  onSelectDepartment: (code: string, name: string) => void;
  onSelectReport: (report: PublicCommunityReport) => void;
  onMapClickForReport: (lonLat: [number, number]) => void;
  onCenterChange: (center: [number, number]) => void;
};

const COLOMBIA_BOUNDS: [number, number, number, number] = [-79.5, -4.3, -66.8, 13.5];

const STATUS_COLOR: Record<PublicCommunityReport["status"], string> = {
  validated: "#257350",
  corroborated: "#257350",
  reported: "#c8811d",
  superseded: "#9aa39d",
  rejected: "#9aa39d",
};

const reportsToGeoJson = (reports: PublicCommunityReport[]): FeatureCollection => ({
  type: "FeatureCollection",
  features: reports.map(
    (report): Feature => ({
      type: "Feature",
      geometry: report.location,
      properties: {
        id: report.id,
        title: report.title,
        color: STATUS_COLOR[report.status] ?? STATUS_COLOR.reported,
        // El tipo viaja como número para poder usarlo en una expresión de estilo sin
        // convertirlo en cada cuadro.
        isNeed: report.reportType === "necesidad" ? 1 : 0,
      },
    }),
  ),
});

const sgcToGeoJson = (events: SgcEvent[]): FeatureCollection => ({
  type: "FeatureCollection",
  features: events.map(
    (event): Feature => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [event.longitude, event.latitude] },
      properties: {
        magnitude: event.magnitude,
        label: `SGC · M ${event.magnitude.toFixed(1)} · ${event.place} · ${event.localTime}`,
      },
    }),
  ),
});

export function PulsoMap({
  departments,
  municipalities,
  reports,
  sgcEvents,
  departmentColors,
  selectedCode,
  reportMode,
  pendingPoint,
  flyToBounds,
  onSelectDepartment,
  onSelectReport,
  onMapClickForReport,
  onCenterChange,
}: PulsoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const pendingMarkerRef = useRef<maplibregl.Marker | null>(null);
  // Los datos llegan por fetch y el estilo tarda en cargar; cualquiera de los dos puede ganar la
  // carrera. Se guarda lo último recibido y se aplica también al terminar de cargar, para que un
  // dato que llegó antes que el mapa no se pierda en silencio.
  const latestData = useRef<Record<string, FeatureCollection>>({});
  // Las funciones cambian de identidad en cada render del padre; guardarlas en una referencia
  // evita recrear el mapa —y perder la posición— cada vez que eso pasa.
  const handlers = useRef({
    onSelectDepartment,
    onSelectReport,
    onMapClickForReport,
    onCenterChange,
    reportMode,
    reports,
  });
  handlers.current = {
    onSelectDepartment,
    onSelectReport,
    onMapClickForReport,
    onCenterChange,
    reportMode,
    reports,
  };

  // Instancia única. Se crea una vez y vive mientras viva el componente.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: buildPulsoMapStyle(),
      bounds: COLOMBIA_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      minZoom: 4,
      maxZoom: 18,
      attributionControl: false,
      // El teclado y el arrastre con dos dedos quedan activos; lo que se desactiva es el zoom con
      // rueda sin modificador, porque secuestra el desplazamiento de la página.
      scrollZoom: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: MAP_ATTRIBUTION }),
      "bottom-right",
    );
    // Con Ctrl/⌘ el zoom con rueda sí funciona: es el gesto que la gente ya conoce de otros mapas.
    map.scrollZoom.setWheelZoomRate(1 / 450);
    container.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey || event.metaKey) map.scrollZoom.enable();
        else map.scrollZoom.disable();
      },
      { passive: true },
    );

    map.on("load", () => {
      readyRef.current = true;

      map.addSource("departamentos", { type: "geojson", data: emptyCollection() });
      map.addSource("municipios", { type: "geojson", data: emptyCollection() });
      map.addSource("sgc", { type: "geojson", data: emptyCollection() });
      map.addSource("reportes", {
        type: "geojson",
        data: emptyCollection(),
        // El agrupamiento lo hace el motor. Hasta zoom 11 se agrupa; más allá cada punto es
        // individual, que es cuando de verdad sirve verlos separados.
        cluster: true,
        clusterMaxZoom: 11,
        clusterRadius: 46,
      });

      map.addLayer({
        id: "departamentos-relleno",
        type: "fill",
        source: "departamentos",
        paint: {
          "fill-color": ["coalesce", ["get", "color"], "#c8c3b7"],
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.5, 0.28],
        },
      });
      map.addLayer({
        id: "departamentos-borde",
        type: "line",
        source: "departamentos",
        paint: {
          "line-color": "#12241d",
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.2, 0.7],
          "line-opacity": 0.55,
        },
      });
      map.addLayer({
        id: "municipios-borde",
        type: "line",
        source: "municipios",
        paint: { "line-color": "#12241d", "line-width": 0.5, "line-opacity": 0.3 },
      });

      map.addLayer({
        id: "sgc-eventos",
        type: "circle",
        source: "sgc",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "magnitude"], 2, 3, 7, 11],
          "circle-color": "#d87246",
          "circle-opacity": 0.75,
          "circle-stroke-color": "#fffdf6",
          "circle-stroke-width": 1,
        },
      });

      map.addLayer({
        id: "reportes-cumulo",
        type: "circle",
        source: "reportes",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#12241d",
          "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 14, 500, 34],
          "circle-stroke-color": "#fffdf6",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "reportes-cumulo-conteo",
        type: "symbol",
        source: "reportes",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
        },
        paint: { "text-color": "#fffdf6" },
      });
      map.addLayer({
        id: "reportes-punto",
        type: "circle",
        source: "reportes",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 6,
          "circle-stroke-color": "#fffdf6",
          "circle-stroke-width": 1.5,
        },
      });

      map.on(
        "click",
        "reportes-cumulo",
        (
          event: MapMouseEvent & {
            features?: Array<{ properties?: Record<string, unknown>; geometry: unknown }>;
          },
        ) => {
          const feature = event.features?.[0];
          const clusterId = feature?.properties?.cluster_id;
          // La geometría se lee aquí, con el rasgo ya comprobado: dentro de la promesa el
          // encadenamiento opcional sobre algo posiblemente ausente sería una lectura a ciegas.
          const geometry = feature?.geometry as { coordinates: [number, number] } | undefined;
          if (clusterId === undefined || !geometry) return;
          const source = map.getSource("reportes") as GeoJSONSource;
          void source.getClusterExpansionZoom(Number(clusterId)).then((zoom: number) => {
            map.easeTo({ center: geometry.coordinates, zoom });
          });
        },
      );

      map.on(
        "click",
        "reportes-punto",
        (event: MapMouseEvent & { features?: Array<{ properties?: Record<string, unknown> }> }) => {
          const id = event.features?.[0]?.properties?.id;
          const report = handlers.current.reports.find((item) => item.id === id);
          if (report) handlers.current.onSelectReport(report);
        },
      );

      map.on(
        "click",
        "departamentos-relleno",
        (event: MapMouseEvent & { features?: Array<{ properties?: Record<string, unknown> }> }) => {
          if (handlers.current.reportMode) return;
          const properties = event.features?.[0]?.properties;
          if (!properties) return;
          handlers.current.onSelectDepartment(
            String(properties.dpto_ccdgo),
            String(properties.dpto_cnmbre),
          );
        },
      );

      map.on("click", (event: MapMouseEvent) => {
        if (!handlers.current.reportMode) return;
        handlers.current.onMapClickForReport([event.lngLat.lng, event.lngLat.lat]);
      });

      for (const layer of ["reportes-punto", "reportes-cumulo", "departamentos-relleno"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = handlers.current.reportMode ? "crosshair" : "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = handlers.current.reportMode ? "crosshair" : "";
        });
      }

      for (const [id, data] of Object.entries(latestData.current)) {
        (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
      }

      const emitCenter = () => {
        const center = map.getCenter();
        handlers.current.onCenterChange([center.lng, center.lat]);
      };
      map.on("moveend", emitCenter);
      emitCenter();
    });

    return () => {
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const publish = (id: string, data: FeatureCollection) => {
    latestData.current[id] = data;
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `publish` se redefine en cada render pero solo escribe en refs.
  useEffect(() => {
    publish("departamentos", withColors(departments, departmentColors));
  }, [departments, departmentColors]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ver arriba.
  useEffect(() => {
    publish("municipios", municipalities ?? emptyCollection());
  }, [municipalities]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ver arriba.
  useEffect(() => {
    publish("reportes", reportsToGeoJson(reports));
  }, [reports]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ver arriba.
  useEffect(() => {
    publish("sgc", sgcToGeoJson(sgcEvents));
  }, [sgcEvents]);

  // Resaltado del departamento elegido, por estado de entidad y no repintando la fuente: cambiar
  // el dato entero para marcar uno solo obligaría a reprocesar los 33 polígonos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !departments) return;
    for (const feature of departments.features) {
      const code = feature.properties.dpto_ccdgo;
      map.setFeatureState(
        { source: "departamentos", id: code },
        { selected: code === selectedCode },
      );
    }
  }, [selectedCode, departments]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToBounds) return;
    map.fitBounds(flyToBounds, { padding: 40, duration: 900, maxZoom: 11 });
  }, [flyToBounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = reportMode ? "crosshair" : "";
  }, [reportMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pendingMarkerRef.current?.remove();
    pendingMarkerRef.current = null;
    if (!pendingPoint) return;
    const element = document.createElement("span");
    element.className = "pulsoPendingMarker";
    pendingMarkerRef.current = new maplibregl.Marker({ element })
      .setLngLat(pendingPoint)
      .addTo(map);
  }, [pendingPoint]);

  return <div className="pulsoMapCanvas" ref={containerRef} />;
}

const emptyCollection = (): FeatureCollection => ({ type: "FeatureCollection", features: [] });

/** Copia la colección añadiendo el color de la capa activa y un id estable por departamento. */
function withColors(
  departments: FeatureCollection<Geometry, DepartmentProperties> | null,
  colors: Record<string, string>,
): FeatureCollection {
  if (!departments) return emptyCollection();
  return {
    type: "FeatureCollection",
    features: departments.features.map((feature) => ({
      ...feature,
      // `setFeatureState` necesita un id; el código DANE ya es único y estable.
      id: feature.properties.dpto_ccdgo,
      properties: {
        ...feature.properties,
        color: colors[feature.properties.dpto_ccdgo] ?? "#c8c3b7",
      },
    })),
  };
}
