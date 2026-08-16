"use client";

import type { MapMouseEvent } from "maplibre-gl";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { buildPulsoMapStyle, MAP_ATTRIBUTION } from "./map-style";

type LocationPickerProps = {
  value: [number, number] | null;
  onChange: (lonLat: [number, number]) => void;
};

/** Centro aproximado de Colombia: vista neutral antes de que alguien elija un punto. */
const DEFAULT_CENTER: [number, number] = [-74.3, 4.5];

/**
 * Selector de punto en el mapa.
 *
 * Usa el mismo motor y el mismo estilo que el mapa principal. Antes era Leaflet con teselas de
 * OpenStreetMap: dos motores y dos estéticas distintas en la misma aplicación, y quien acababa de
 * mirar el mapa grande se encontraba aquí con otro mapa que se veía y se manejaba distinto.
 */
export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialValueRef = useRef(value);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const initialValue = initialValueRef.current;

    const map = new maplibregl.Map({
      container,
      style: buildPulsoMapStyle(),
      center: initialValue ?? DEFAULT_CENTER,
      zoom: initialValue ? 14 : 5.2,
      minZoom: 4,
      maxZoom: 18,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: MAP_ATTRIBUTION }),
      "bottom-right",
    );
    // Aquí el cursor es de puntería desde el principio: la única razón de este mapa es marcar un
    // punto, así que no hace falta un modo aparte que lo anuncie.
    map.getCanvas().style.cursor = "crosshair";

    map.on("click", (event: MapMouseEvent) => {
      onChangeRef.current([event.lngLat.lng, event.lngLat.lat]);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove();
    markerRef.current = null;
    if (!value) return;
    const element = document.createElement("span");
    element.className = "pulsoPendingMarker";
    markerRef.current = new maplibregl.Marker({ element }).setLngLat(value).addTo(map);
    map.easeTo({ center: value, zoom: Math.max(map.getZoom(), 13), duration: 400 });
  }, [value]);

  return <div className="locationPicker" ref={containerRef} />;
}
