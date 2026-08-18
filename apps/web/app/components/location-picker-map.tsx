"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { reportMarkerSvg } from "./icons";

type LocationPickerMapProps = {
  /** [lng, lat], igual que el resto del código de mapas del proyecto. */
  point: [number, number] | null;
  onChange: (point: [number, number]) => void;
  /** [lat, lng] — dónde centrar el mapa mientras no hay un punto elegido todavía. */
  initialCenter?: [number, number];
};

// Centro geográfico aproximado de Colombia continental: vista de arranque cuando no hay
// pista de dónde está el usuario ni un punto elegido todavía.
const COLOMBIA_CENTER: [number, number] = [4.5709, -74.2973];
const COUNTRY_ZOOM = 5;
const PICK_ZOOM = 14;

// Triángulo de alerta en vez del pin por defecto de Leaflet (esa imagen azul genérica no dice
// nada de lo que se está marcando): un reporte siempre es una situación que necesita atención.
const dangerIcon = L.divIcon({
  className: "pulsoMarker",
  html: `<span class="pulsoMarkerDot pulsoMarkerDanger">${reportMarkerSvg("necesidad", 15)}</span>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

function ensureMarker(
  map: L.Map,
  markerRef: { current: L.Marker | null },
  lat: number,
  lng: number,
  onChangeRef: { current: (point: [number, number]) => void },
) {
  if (markerRef.current) {
    markerRef.current.setLatLng([lat, lng]);
    return;
  }
  const marker = L.marker([lat, lng], { draggable: true, icon: dangerIcon }).addTo(map);
  marker.on("dragend", () => {
    const latlng = marker.getLatLng();
    onChangeRef.current([latlng.lng, latlng.lat]);
  });
  markerRef.current = marker;
}

/**
 * Mini mapa para elegir el punto de un reporte desde dentro del modal: tocar el mapa o
 * arrastrar el pin lo mueve, y el botón "Usar mi ubicación" del formulario lo hace volar hasta
 * la posición del dispositivo. Es un mapa Leaflet aparte y más chico que el de departamento —
 * ese trae clustering y capas de reportes que aquí solo estorbarían.
 */
export function LocationPickerMap({ point, onChange, initialCenter }: LocationPickerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mapa: se crea una sola vez. El punto inicial se coloca aquí mismo; los cambios
  // posteriores (clic, arrastre, geolocalización) los maneja el efecto de más abajo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo debe correr al montar — point/initialCenter iniciales ya se leen dentro.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const startCenter: [number, number] = point
      ? [point[1], point[0]]
      : (initialCenter ?? COLOMBIA_CENTER);
    const map = L.map(container, { minZoom: 4, maxZoom: 18, zoomControl: true }).setView(
      startCenter,
      point ? PICK_ZOOM : COUNTRY_ZOOM,
    );
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    if (point) ensureMarker(map, markerRef, point[1], point[0], onChangeRef);

    map.on("click", (event: L.LeafletMouseEvent) => {
      ensureMarker(map, markerRef, event.latlng.lat, event.latlng.lng, onChangeRef);
      onChangeRef.current([event.latlng.lng, event.latlng.lat]);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Cuando el punto cambia desde afuera (el botón "Usar mi ubicación"), el mini mapa vuela
  // hasta ahí. Un clic dentro del mini mapa también dispara esto, pero como ya está parado
  // justo en ese punto el vuelo no se nota — por eso no hace falta distinguir el origen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !point) return;
    ensureMarker(map, markerRef, point[1], point[0], onChangeRef);
    map.flyTo([point[1], point[0]], Math.max(map.getZoom(), PICK_ZOOM));
  }, [point]);

  return <div className="locationPickerMap" ref={containerRef} />;
}
