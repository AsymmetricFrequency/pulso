"use client";

import { geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";

type DepartmentProperties = {
  dpto_ccdgo: string;
  dpto_cnmbre: string;
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
};

export function AtlasMap({
  layer = "coverage",
  selectedCode: controlledCode,
  onSelectCode,
}: AtlasMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [data, setData] = useState<FeatureCollection<Geometry, DepartmentProperties> | null>(null);
  const [internalCode, setInternalCode] = useState("27");
  const [error, setError] = useState(false);
  const selectedCode = controlledCode ?? internalCode;
  const definition = layerDefinitions[layer];

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
  const selectedStatus = definition.statuses[selectedCode] ?? definition.defaultStatus;

  const selectDepartment = (code: string) => {
    const department = departments.find((item) => item.properties.dpto_ccdgo === code);
    setInternalCode(code);
    onSelectCode?.(code, department?.properties.dpto_cnmbre ?? "Departamento");
  };

  return (
    <div className="atlasMap" ref={containerRef}>
      <div className="mapToolbar">
        <div>
          <span className="mapKicker">{definition.title}</span>
          <strong>Departamentos de Colombia</strong>
        </div>
        <label>
          <span>Seleccionar departamento</span>
          <select value={selectedCode} onChange={(event) => selectDepartment(event.target.value)}>
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
          <title id="map-title">{definition.title} por departamento</title>
          <desc id="map-desc">
            Mapa público demostrativo de Colombia. Seleccione un departamento para consultar su
            resumen territorial.
          </desc>
          {paths.map(({ feature, d }) => {
            const code = feature.properties.dpto_ccdgo;
            const departmentStatus = definition.statuses[code] ?? definition.defaultStatus;
            return (
              // biome-ignore lint/a11y/useSemanticElements: SVG geography cannot be represented by an HTML button.
              <path
                className={`department status-${departmentStatus.token}${code === selectedCode ? " selected" : ""}`}
                d={d}
                key={code}
                onClick={() => selectDepartment(code)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") selectDepartment(code);
                }}
                role="button"
                tabIndex={0}
              >
                <title>{`${feature.properties.dpto_cnmbre}: ${departmentStatus.label}`}</title>
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
        <span className={`coverageBadge ${selectedStatus.token}`}>{selectedStatus.label}</span>
      </div>

      <ul className="mapLegend embedded" aria-label={`Leyenda: ${definition.title}`}>
        {definition.legend.map((item) => (
          <li key={`${layer}-${item.token}`}>
            <i className={`statusDot ${item.token}`} /> {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
