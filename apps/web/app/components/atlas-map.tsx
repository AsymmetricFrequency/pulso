"use client";

import { geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";

type DepartmentProperties = {
  dpto_ccdgo: string;
  dpto_cnmbre: string;
};

type CoverageStatus = "unknown" | "assigned" | "partial" | "visited" | "inaccessible";

const demoCoverage: Record<string, CoverageStatus> = {
  "17": "partial",
  "19": "inaccessible",
  "27": "assigned",
  "63": "visited",
  "66": "visited",
  "76": "partial",
};

const statusLabels: Record<CoverageStatus, string> = {
  unknown: "Sin verificar",
  assigned: "Brigada asignada",
  partial: "Visita parcial",
  visited: "Visitada",
  inaccessible: "Acceso restringido",
};

export function AtlasMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [data, setData] = useState<FeatureCollection<Geometry, DepartmentProperties> | null>(null);
  const [selectedCode, setSelectedCode] = useState("27");
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/colombia-departamentos.geojson", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("No fue posible cargar la capa territorial");
        return response.json();
      })
      .then((collection: FeatureCollection<Geometry, DepartmentProperties>) => setData(collection))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
      });
    return () => controller.abort();
  }, []);

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
  const paths = useMemo(() => {
    if (!data) return [];
    const projection = geoMercator().fitExtent(
      [
        [24, 22],
        [width - 24, height - 22],
      ],
      data,
    );
    const path = geoPath(projection);
    return data.features.map((feature) => ({ feature, d: path(feature) ?? "" }));
  }, [data, height, width]);

  const departments = useMemo(
    () =>
      [...(data?.features ?? [])].sort((a, b) =>
        a.properties.dpto_cnmbre.localeCompare(b.properties.dpto_cnmbre, "es"),
      ),
    [data],
  );
  const selected = departments.find(
    (feature: Feature<Geometry, DepartmentProperties>) =>
      feature.properties.dpto_ccdgo === selectedCode,
  );
  const selectedStatus = demoCoverage[selectedCode] ?? "unknown";

  return (
    <div className="atlasMap" ref={containerRef}>
      <div className="mapToolbar">
        <div>
          <span className="mapKicker">Capa territorial oficial</span>
          <strong>Departamentos de Colombia</strong>
        </div>
        <label>
          <span>Seleccionar departamento</span>
          <select value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)}>
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

      {error ? (
        <div className="mapLoading" role="alert">
          No fue posible cargar la capa territorial.
        </div>
      ) : data ? (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="map-title map-desc">
          <title id="map-title">Mapa departamental de Colombia</title>
          <desc id="map-desc">
            Capa geográfica con estados de cobertura sintéticos para demostrar Atlas Map.
          </desc>
          {paths.map(({ feature, d }) => {
            const code = feature.properties.dpto_ccdgo;
            const status = demoCoverage[code] ?? "unknown";
            return (
              <path
                className={`department status-${status}${code === selectedCode ? " selected" : ""}`}
                d={d}
                key={code}
              >
                <title>{`${feature.properties.dpto_cnmbre}: ${statusLabels[status]}`}</title>
              </path>
            );
          })}
        </svg>
      ) : (
        <div className="mapLoading" role="status">
          Cargando territorio…
        </div>
      )}

      <div className="mapSelection" aria-live="polite">
        <span>Territorio seleccionado</span>
        <strong>{selected?.properties.dpto_cnmbre ?? "Cargando…"}</strong>
        <span className={`coverageBadge ${selectedStatus}`}>{statusLabels[selectedStatus]}</span>
      </div>
    </div>
  );
}
