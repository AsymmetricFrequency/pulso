"use client";

import type { Feature, FeatureCollection, Geometry } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useEffect, useRef } from "react";
import type { PublicCommunityReport } from "./community-report-form";
import { reportMarkerKey, reportMarkerSvg } from "./icons";

type DepartmentProperties = { dpto_ccdgo: string; dpto_cnmbre: string };
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

const statusColor = (status: PublicCommunityReport["status"]) => {
  if (status === "corroborated" || status === "validated") return "#2a7d57";
  if (status === "reported") return "#d08b25";
  return "#9a9484";
};

function reportDivIcon(report: PublicCommunityReport) {
  // Un rescate no se colorea por estado de revisión. El ámbar de «sin verificar» lo haría
  // indistinguible de una necesidad recién reportada, y aquí la distinción tiene que sobrevivir a
  // una mirada de medio segundo sobre un mapa con miles de puntos.
  if (report.reportType === "rescate") {
    const live = report.signsOfLife === "yes" ? " pulsoMarkerRescueLive" : "";
    return L.divIcon({
      className: "pulsoMarker",
      html:
        `<span class="pulsoMarkerDot pulsoMarkerRescue${live}">` +
        `${reportMarkerSvg("rescate", 18)}</span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
  }
  // Una vía tampoco. Lo que importa de ella es si se puede pasar, no si alguien de Operaciones ya
  // la miró: pintarla de ámbar por «sin verificar» escondería justo el dato que se viene a buscar.
  if (report.reportType === "via") {
    const open = report.routeStatus === "habilitada";
    return L.divIcon({
      className: "pulsoMarker",
      html:
        `<span class="pulsoMarkerDot pulsoMarkerRoute${open ? " pulsoMarkerRouteOpen" : ""}">` +
        `${reportMarkerSvg(reportMarkerKey(report), 16)}</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }
  // Un daño tampoco se colorea por estado de revisión: lo que decide si alguien va es la severidad.
  if (report.reportType === "dano") {
    const collapse = report.damageSeverity === "colapso";
    return L.divIcon({
      className: "pulsoMarker",
      html:
        `<span class="pulsoMarkerDot pulsoMarkerDamage${collapse ? " pulsoMarkerCollapse" : ""}">` +
        `${reportMarkerSvg(reportMarkerKey(report), collapse ? 17 : 14)}</span>`,
      iconSize: collapse ? [30, 30] : [26, 26],
      iconAnchor: collapse ? [15, 15] : [13, 13],
    });
  }
  const color = statusColor(report.status);
  // Punteado si el estado es «sin verificar» **o** si la coordenada se dedujo de una dirección
  // escrita. Son dos incertidumbres distintas —quién lo dice, y dónde está— y el borde abierto
  // significa lo mismo en las dos: no des este punto por firme.
  const dashed =
    report.status === "reported" || report.locationPrecision === "geocoded"
      ? "border-style:dashed;"
      : "";
  return L.divIcon({
    className: "pulsoMarker",
    html: `<span style="background:${color};${dashed}" class="pulsoMarkerDot">${reportMarkerSvg(reportMarkerKey(report))}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function clusterIcon(color: string) {
  return (cluster: L.MarkerCluster) =>
    L.divIcon({
      className: "pulsoClusterIcon",
      html: `<span style="background:${color}">${cluster.getChildCount()}</span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
}

type LeafletMapProps = {
  departmentFeature: Feature<Geometry, DepartmentProperties>;
  municipalities: FeatureCollection<Geometry, MunicipalityProperties> | null;
  sgcEvents: SgcEvent[];
  reports: PublicCommunityReport[];
  reportMode: boolean;
  pendingPoint: [number, number] | null;
  onMapClickForReport: (lonLat: [number, number]) => void;
  onSelectReport: (report: PublicCommunityReport) => void;
  /** Centro de la vista tras cada movimiento, para poder decir en qué municipio estás parado. */
  onCenterChange?: (center: [number, number]) => void;
  focusMunicipalityCode?: string;
};

export function LeafletMap({
  departmentFeature,
  municipalities,
  sgcEvents,
  reports,
  reportMode,
  pendingPoint,
  onMapClickForReport,
  onSelectReport,
  onCenterChange,
  focusMunicipalityCode,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pendingMarkerRef = useRef<L.Marker | null>(null);
  const callbacksRef = useRef({ onMapClickForReport, onSelectReport, onCenterChange, reportMode });
  callbacksRef.current = { onMapClickForReport, onSelectReport, onCenterChange, reportMode };

  // Map instance: created once per mounted department view, destroyed on unmount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, { minZoom: 5, maxZoom: 18, zoomControl: true });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    const departmentLayer = L.geoJSON(departmentFeature, {
      style: { color: "#10231c", weight: 2, fill: false },
    }).addTo(map);
    map.fitBounds(departmentLayer.getBounds(), { padding: [24, 24] });

    map.on("click", (event: L.LeafletMouseEvent) => {
      if (!callbacksRef.current.reportMode) return;
      callbacksRef.current.onMapClickForReport([event.latlng.lng, event.latlng.lat]);
    });

    const emitCenter = () => {
      const center = map.getCenter();
      callbacksRef.current.onCenterChange?.([center.lng, center.lat]);
    };
    map.on("moveend", emitCenter);
    emitCenter();

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [departmentFeature]);

  // Municipality boundaries — added/replaced whenever the data arrives (fetched on demand).
  // biome-ignore lint/correctness/useExhaustiveDependencies: departmentFeature isn't read here, but must rerun when the map is recreated.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !municipalities) return;
    const layer = L.geoJSON(municipalities, {
      style: { color: "#10231c", weight: 1, opacity: 0.45, fill: false },
      onEachFeature: (feature, featureLayer) => {
        const name = (feature.properties as MunicipalityProperties | undefined)?.mpio_cnmbre;
        if (name) featureLayer.bindTooltip(name, { sticky: true });
      },
    }).addTo(map);
    return () => {
      layer.remove();
    };
  }, [municipalities, departmentFeature]);

  // Pan/zoom to the selected municipality once its boundary is available.
  // biome-ignore lint/correctness/useExhaustiveDependencies: departmentFeature isn't read here, but must rerun when the map is recreated.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !municipalities || !focusMunicipalityCode) return;
    const feature = municipalities.features.find(
      (item) => item.properties?.mpio_cdpmp === focusMunicipalityCode,
    );
    if (!feature) return;
    const bounds = L.geoJSON(feature).getBounds();
    if (bounds.isValid()) map.flyToBounds(bounds, { padding: [32, 32], maxZoom: 13 });
  }, [municipalities, focusMunicipalityCode, departmentFeature]);

  // SGC seismic events, clustered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: departmentFeature isn't read here, but must rerun when the map is recreated.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const group = L.markerClusterGroup({
      iconCreateFunction: clusterIcon("#e0523f"),
      maxClusterRadius: 50,
    });
    for (const event of sgcEvents) {
      const marker = L.circleMarker([event.latitude, event.longitude], {
        radius: Math.max(3, Math.min(9, event.magnitude * 1.4)),
        color: "#fffdf7",
        weight: 1.5,
        fillColor: "#e0523f",
        fillOpacity: 0.9,
      });
      marker.bindTooltip(
        `SGC · M ${event.magnitude.toFixed(1)} · ${event.place} · ${event.localTime}`,
      );
      group.addLayer(marker);
    }
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
    };
  }, [sgcEvents, departmentFeature]);

  // Citizen/PMU/necesidad reports, clustered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: departmentFeature isn't read here, but must rerun when the map is recreated.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const group = L.markerClusterGroup({
      iconCreateFunction: clusterIcon("#10231c"),
      maxClusterRadius: 44,
    });
    // Los rescates salen del clúster y van en su propia capa, por encima. Agrupados quedarían
    // absorbidos por el globo de «37 reportes» de su cuadra: existirían en los datos y no en la
    // pantalla, que para esto es lo mismo que no existir.
    //
    // Las vías van en la misma capa por la misma razón, y son pocas: un cierre escondido dentro de
    // un clúster manda a un equipo por una carretera que no existe.
    const rescueLayer = L.layerGroup();
    for (const report of reports) {
      const [lng, lat] = report.location.coordinates;
      // Los colapsos salen del clúster con los rescates y las vías: son ~100 entre miles de puntos
      // y el globo de «37 reportes» de su cuadra los haría desaparecer justo donde importan.
      const alwaysVisible =
        report.reportType === "rescate" ||
        report.reportType === "via" ||
        (report.reportType === "dano" && report.damageSeverity === "colapso");
      const marker = L.marker([lat, lng], {
        icon: reportDivIcon(report),
        zIndexOffset: report.reportType === "rescate" ? 1_000 : alwaysVisible ? 900 : 0,
      });
      marker.bindPopup(`<strong>${report.title}</strong>`);
      marker.on("click", () => callbacksRef.current.onSelectReport(report));
      (alwaysVisible ? rescueLayer : group).addLayer(marker);
    }
    map.addLayer(group);
    map.addLayer(rescueLayer);
    return () => {
      map.removeLayer(group);
      map.removeLayer(rescueLayer);
    };
  }, [reports, departmentFeature]);

  // Optimistic "you are placing a report here" marker.
  // biome-ignore lint/correctness/useExhaustiveDependencies: departmentFeature isn't read here, but must rerun when the map is recreated.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pendingMarkerRef.current) {
      pendingMarkerRef.current.remove();
      pendingMarkerRef.current = null;
    }
    if (!pendingPoint) return;
    const [lng, lat] = pendingPoint;
    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: "pulsoMarker",
        html: `<span class="pulsoMarkerDot pulsoMarkerPending"></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    }).addTo(map);
    pendingMarkerRef.current = marker;
  }, [pendingPoint, departmentFeature]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.classList.toggle("reportMode", reportMode);
  }, [reportMode]);

  return <div className="leafletMapContainer" ref={containerRef} />;
}
