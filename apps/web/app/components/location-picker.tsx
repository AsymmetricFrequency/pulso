"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

type LocationPickerProps = {
  value: [number, number] | null;
  onChange: (lonLat: [number, number]) => void;
};

// Colombia's rough center — a neutral starting view before the user picks a point.
const DEFAULT_CENTER: [number, number] = [4.5, -74.3];

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialValueRef = useRef(value);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const initialValue = initialValueRef.current;
    const map = L.map(container, { minZoom: 5, maxZoom: 18, zoomControl: true }).setView(
      initialValue ? [initialValue[1], initialValue[0]] : DEFAULT_CENTER,
      initialValue ? 14 : 6,
    );
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    map.on("click", (event: L.LeafletMouseEvent) => {
      onChangeRef.current([event.latlng.lng, event.latlng.lat]);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (!value) return;
    const [lng, lat] = value;
    markerRef.current = L.marker([lat, lng]).addTo(map);
    map.setView([lat, lng], Math.max(map.getZoom(), 13));
  }, [value]);

  return <div className="locationPicker" ref={containerRef} />;
}
