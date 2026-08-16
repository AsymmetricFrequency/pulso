"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { AtlasMap, type PublicMapLayer } from "./atlas-map";
import { CommunityReportDetailCard } from "./community-report-detail";
import type { PublicCommunityReport } from "./community-report-form";

const defaultLayer: { id: PublicMapLayer; label: string; description: string } = {
  id: "coverage",
  label: "Cobertura",
  description: "Zonas visitadas y por verificar",
};

const layers: Array<{ id: PublicMapLayer; label: string; description: string }> = [
  defaultLayer,
  { id: "damage", label: "Daños", description: "Afectaciones reportadas y validadas" },
  { id: "supplies", label: "Insumos", description: "Necesidades, brechas y entregas" },
  { id: "donations", label: "Donaciones", description: "Del registro a la entrega" },
  { id: "teams", label: "Equipos", description: "Capacidad desplegada en territorio" },
];

const headlineMetrics = [
  { label: "Reportes recibidos", value: "184", note: "161 con evidencia" },
  { label: "Viviendas afectadas", value: "73", note: "28 requieren inspección" },
  { label: "Necesidades abiertas", value: "46", note: "12 de prioridad alta" },
  { label: "Donaciones registradas", value: "$428 M", note: "COP · dinero y especie" },
  { label: "Entregas verificadas", value: "31", note: "Con receptor y evidencia" },
  { label: "Equipos activos", value: "14", note: "67 personas desplegadas" },
];

type TerritoryProfile = {
  municipalities: Array<{ code?: string; name: string; localities: string[] }>;
  update: string;
  confidence: string;
  coverage: string;
  damage: string;
  supplies: string;
  donations: string;
  teams: string;
};

type PublicReportPayload = {
  incident: {
    name: string;
    dataMode: "demo" | "live";
    cutoffAt: string;
  };
  metrics: Array<{ id: string; label: string; value: string; note: string }>;
  territories: Array<{
    code: string;
    name: string;
    municipalities: Array<{ code: string; name: string; localities: string[] }>;
    updatedAt: string;
    confidenceLabel: string;
    coverage: string;
    damage: string;
    supplies: string;
    donations: string;
    teams: string;
  }>;
  updates: Array<{
    id: string;
    title: string;
    territory: string;
    detail: string;
    verificationLabel: string;
    observedAt: string;
  }>;
  aidBalances: Array<{
    catalogCode: string;
    label: string;
    unit: string;
    validatedNeed: number;
    inTransit: number;
    deliveredUsable: number;
    rejected: number;
    openGap: number;
  }>;
  donationFlow: {
    currency: string;
    registered: number;
    reconciled: number;
    allocated: number;
    delivered: number;
  };
  integrity: { status: "pending" | "anchored"; network: string };
};

const territoryProfiles: Record<string, TerritoryProfile> = {
  "27": {
    municipalities: [
      { code: "27001", name: "Quibdó", localities: ["Cabecera municipal", "Zona rural norte"] },
      {
        code: "27361",
        name: "Istmina",
        localities: ["Cabecera municipal", "Corregimientos priorizados"],
      },
    ],
    update: "Hace 18 minutos",
    confidence: "Validación parcial",
    coverage: "9 de 14 zonas visitadas",
    damage: "21 reportes · 13 validados",
    supplies: "8 brechas abiertas",
    donations: "6 entregas verificadas",
    teams: "4 equipos activos",
  },
  "76": {
    municipalities: [
      { code: "76001", name: "Cali", localities: ["Comuna priorizada", "Zona de ladera"] },
      {
        code: "76109",
        name: "Buenaventura",
        localities: ["Cabecera distrital", "Zona rural"],
      },
    ],
    update: "Hace 26 minutos",
    confidence: "Datos corroborados",
    coverage: "12 de 16 zonas visitadas",
    damage: "34 reportes · 29 validados",
    supplies: "11 brechas abiertas",
    donations: "9 entregas verificadas",
    teams: "5 equipos activos",
  },
  "63": {
    municipalities: [
      { code: "63001", name: "Armenia", localities: ["Cabecera municipal", "Periferia"] },
      { code: "63130", name: "Calarcá", localities: ["Cabecera municipal", "Zona rural"] },
    ],
    update: "Hace 41 minutos",
    confidence: "Datos corroborados",
    coverage: "10 de 10 zonas visitadas",
    damage: "12 reportes · 12 validados",
    supplies: "2 brechas abiertas",
    donations: "11 entregas verificadas",
    teams: "2 equipos activos",
  },
};

const defaultMunicipality: TerritoryProfile["municipalities"][number] = {
  name: "Todos los municipios",
  localities: ["Todas las localidades"],
};

const fallbackProfile: TerritoryProfile = {
  municipalities: [defaultMunicipality],
  update: "Sin actualización reciente",
  confidence: "Información insuficiente",
  coverage: "Territorio sin verificar",
  damage: "Sin daños publicados",
  supplies: "Sin balance publicado",
  donations: "Sin entregas publicadas",
  teams: "Sin despliegue publicado",
};

const situationRows = [
  {
    title: "Evaluación de vivienda",
    territory: "Quibdó · zona rural norte",
    detail: "13 viviendas requieren inspección técnica prioritaria.",
    state: "Validado por profesional",
    time: "Actualizado hace 18 min",
  },
  {
    title: "Agua y almacenamiento",
    territory: "Buenaventura · zona rural",
    detail: "Brecha estimada de 42 kits familiares y 18 tanques.",
    state: "Corroborado en campo",
    time: "Actualizado hace 26 min",
  },
  {
    title: "Acceso territorial",
    territory: "Cauca · corredor priorizado",
    detail: "Dos zonas continúan sin verificación presencial.",
    state: "Requiere segunda fuente",
    time: "Actualizado hace 1 h",
  },
];

const aidBalances = [
  {
    label: "Materiales de construcción",
    requested: "1.240 unidades",
    delivered: "620",
    progress: 50,
  },
  { label: "Agua y saneamiento", requested: "780 unidades", delivered: "546", progress: 70 },
  { label: "Alimentos", requested: "1.800 raciones", delivered: "1.350", progress: 75 },
  { label: "Refugio temporal", requested: "310 kits", delivered: "124", progress: 40 },
];

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Bogota",
  }).format(new Date(value));

const formatQuantity = (value: number) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(value);

const formatMoney = (value: number) => `$${Math.round(value / 1_000_000)} M`;

export function PublicSituationReport() {
  const [report, setReport] = useState<PublicReportPayload | null>(null);
  // Tres estados, no dos: mientras el fetch está en vuelo el sitio no puede afirmar ni que los
  // datos son reales ni que son de respaldo. Antes arrancaba en "fallback" y el primer render
  // anunciaba "datos sintéticos" aunque un instante después llegara el informe real.
  const [reportSource, setReportSource] = useState<"loading" | "fallback" | "api">("loading");
  const [layer, setLayer] = useState<PublicMapLayer>("coverage");
  const [departmentCode, setDepartmentCode] = useState("27");
  const [departmentName, setDepartmentName] = useState("Chocó");
  const [activeReport, setActiveReport] = useState<PublicCommunityReport | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    fetch(`${apiUrl}/v1/public/incidents/colombia-2026/report`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Public report is unavailable");
        return response.json() as Promise<PublicReportPayload>;
      })
      .then((payload) => {
        setReport(payload);
        setReportSource("api");
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setReportSource("fallback");
        }
      });
    return () => controller.abort();
  }, []);

  const publishedProfiles = useMemo<Record<string, TerritoryProfile>>(() => {
    if (!report) return territoryProfiles;
    return Object.fromEntries(
      report.territories.map((territory) => [
        territory.code,
        {
          municipalities: territory.municipalities.map((municipality) => ({
            code: municipality.code,
            name: municipality.name,
            localities: municipality.localities,
          })),
          update: formatDateTime(territory.updatedAt),
          confidence: territory.confidenceLabel,
          coverage: territory.coverage,
          damage: territory.damage,
          supplies: territory.supplies,
          donations: territory.donations,
          teams: territory.teams,
        },
      ]),
    );
  }, [report]);
  const profile = publishedProfiles[departmentCode] ?? fallbackProfile;
  const [municipalityIndex, setMunicipalityIndex] = useState(0);
  const [localityIndex, setLocalityIndex] = useState(0);
  const municipality =
    profile.municipalities[municipalityIndex] ?? profile.municipalities[0] ?? defaultMunicipality;
  const locality = municipality.localities[localityIndex] ?? municipality.localities[0];
  const selectedLayer = useMemo(
    () => layers.find((item) => item.id === layer) ?? defaultLayer,
    [layer],
  );

  const changeDepartment = (code: string, name: string) => {
    setDepartmentCode(code);
    setDepartmentName(name);
    setMunicipalityIndex(0);
    setLocalityIndex(0);
  };

  const visibleMetrics: Array<{ id?: string; label: string; value: string; note: string }> =
    report?.metrics ?? headlineMetrics;
  const visibleUpdates =
    report?.updates.map((update) => ({
      title: update.title,
      territory: update.territory,
      detail: update.detail,
      state: update.verificationLabel,
      time: `Observado ${formatDateTime(update.observedAt)}`,
    })) ?? situationRows;
  const visibleAidBalances =
    report?.aidBalances.map((balance) => ({
      label: balance.label,
      requested: `${formatQuantity(balance.validatedNeed)} ${balance.unit}`,
      delivered: formatQuantity(balance.deliveredUsable),
      progress:
        balance.validatedNeed === 0
          ? 0
          : Math.min(100, Math.round((balance.deliveredUsable / balance.validatedNeed) * 100)),
    })) ?? aidBalances;
  const donationFlow = report?.donationFlow;
  const cutoffLabel = report ? formatDateTime(report.incident.cutoffAt) : "14 ago 2026 · 11:30";

  return (
    <>
      <section className="publicReport" id="informe" aria-labelledby="public-report-title">
        <div className="reportIntro">
          <div>
            <p className="eyebrow">Informe público de situación</p>
            <h2 id="public-report-title">Respuesta Colombia 2026</h2>
          </div>
          <div className="publicationState">
            <span className="liveDot" aria-hidden="true" />
            <div>
              <strong>
                {reportSource === "loading"
                  ? "Informe público"
                  : reportSource === "fallback"
                    ? "Sin conexión con la API pública"
                    : report?.incident.dataMode === "live"
                      ? "Informe público"
                      : "Demostración · datos sintéticos"}
              </strong>
              <span>
                {reportSource === "loading"
                  ? "Conectando con la API pública…"
                  : reportSource === "api"
                    ? `API pública conectada · Último corte: ${cutoffLabel} COT`
                    : "Cifras de referencia, no el estado actual del incidente"}
              </span>
            </div>
          </div>
        </div>

        <div className="headlineGrid">
          {visibleMetrics.map((metric) => (
            <article className="headlineMetric" key={metric.id ?? metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.note}</small>
            </article>
          ))}
        </div>
      </section>

      {/* Lo que está pasando en vivo va antes del mapa: quien entra quiere saber primero qué
          ocurrió, y solo después dónde. El mapa es la herramienta para profundizar, no la portada. */}
      <section className="situationSection" aria-labelledby="situation-title">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow">Actualizaciones verificables</p>
            <h2 id="situation-title">Qué está pasando ahora</h2>
          </div>
          <span className="sectionNote">La identidad personal está protegida</span>
        </div>
        <div className="situationList">
          {visibleUpdates.map((row, index) => (
            <article key={row.title} style={{ "--stagger": index } as CSSProperties}>
              <div>
                <span className="recordType">Reporte territorial</span>
                <h3>{row.title}</h3>
                <p>{row.territory}</p>
              </div>
              <p className="recordDetail">{row.detail}</p>
              <div className="recordVerification">
                <strong>{row.state}</strong>
                <span>{row.time}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mapSection" id="mapa" aria-labelledby="map-section-title">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow">Mapa territorial</p>
            <h2 id="map-section-title">Dónde está pasando</h2>
          </div>
          <span className="sectionNote">Entra a un departamento para ver cada reporte</span>
        </div>

        <div className="layerTabs" role="tablist" aria-label="Capas del informe">
          {layers.map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={layer === item.id}
              className={layer === item.id ? "active" : ""}
              onClick={() => setLayer(item.id)}
              key={item.id}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>

        <nav className="territoryTrail" aria-label="Nivel territorial seleccionado">
          <span>Colombia</span>
          <i aria-hidden="true">/</i>
          <strong>{departmentName}</strong>
          <i aria-hidden="true">/</i>
          <label>
            <span className="srOnly">Municipio</span>
            <select
              value={municipalityIndex}
              onChange={(event) => {
                setMunicipalityIndex(Number(event.target.value));
                setLocalityIndex(0);
              }}
            >
              {profile.municipalities.map((item, index) => (
                <option value={index} key={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <i aria-hidden="true">/</i>
          <label>
            <span className="srOnly">Ciudad, localidad o zona</span>
            <select
              value={localityIndex}
              onChange={(event) => setLocalityIndex(Number(event.target.value))}
            >
              {municipality.localities.map((item, index) => (
                <option value={index} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </nav>

        <div className="publicMapWorkspace">
          <AtlasMap
            layer={layer}
            selectedCode={departmentCode}
            onSelectCode={changeDepartment}
            onActiveReportChange={setActiveReport}
            {...(municipality.code ? { focusMunicipalityCode: municipality.code } : {})}
          />
          <aside className="territorySummary" aria-live="polite">
            {activeReport ? (
              <CommunityReportDetailCard
                report={activeReport}
                onClose={() => setActiveReport(null)}
              />
            ) : (
              <>
                <p className="eyebrow">Resumen territorial</p>
                <h3>{departmentName}</h3>
                <p className="territoryPath">
                  {municipality.name} · {locality}
                </p>
                <div className="confidenceLine">
                  <span>{profile.confidence}</span>
                  <small>{profile.update}</small>
                </div>
                <dl>
                  <div>
                    <dt>Cobertura</dt>
                    <dd>{profile.coverage}</dd>
                  </div>
                  <div>
                    <dt>Daños</dt>
                    <dd>{profile.damage}</dd>
                  </div>
                  <div>
                    <dt>Insumos</dt>
                    <dd>{profile.supplies}</dd>
                  </div>
                  <div>
                    <dt>Donaciones</dt>
                    <dd>{profile.donations}</dd>
                  </div>
                  <div>
                    <dt>Equipos</dt>
                    <dd>{profile.teams}</dd>
                  </div>
                </dl>
                <div className="selectedLayerCallout">
                  <span>Capa visible</span>
                  <strong>{selectedLayer.label}</strong>
                  <p>{selectedLayer.description}</p>
                </div>
              </>
            )}
          </aside>
        </div>
      </section>

      <section className="aidSection" id="ayuda" aria-labelledby="aid-title">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow">Trazabilidad de ayuda</p>
            <h2 id="aid-title">Qué se necesita y qué ya llegó</h2>
          </div>
          <p className="sectionNote">Cantidades normalizadas y entregas con evidencia</p>
        </div>
        <div className="aidLayout">
          <div className="aidBalances">
            {visibleAidBalances.map((item) => (
              <article key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <span>
                    {item.delivered} entregadas de {item.requested}
                  </span>
                </div>
                <div
                  className="progressTrack"
                  role="progressbar"
                  aria-label={`${item.progress}% entregado`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.progress}
                >
                  <span style={{ width: `${item.progress}%` }} />
                </div>
                <b>{item.progress}%</b>
              </article>
            ))}
          </div>
          <aside className="donationFlow">
            <p className="eyebrow">Donaciones monetarias y en especie</p>
            <div>
              <span>Registradas</span>
              <strong>{formatMoney(donationFlow?.registered ?? 0)}</strong>
            </div>
            <div>
              <span>Conciliadas</span>
              <strong>{formatMoney(donationFlow?.reconciled ?? 0)}</strong>
            </div>
            <div>
              <span>Asignadas</span>
              <strong>{formatMoney(donationFlow?.allocated ?? 0)}</strong>
            </div>
            <div>
              <span>Entrega verificada</span>
              <strong>{formatMoney(donationFlow?.delivered ?? 0)}</strong>
            </div>
            <small>
              Cifras en pesos colombianos. Quedan en cero mientras no haya un ledger de donaciones
              conectado; cada entrega registrada conserva unidad, cantidad, origen, destino,
              receptor y evidencia.
            </small>
          </aside>
        </div>
      </section>

      <section className="methodSection" id="metodologia" aria-labelledby="method-title">
        <div>
          <p className="eyebrow">Confianza sin exponer personas</p>
          <h2 id="method-title">Cómo se construye este informe</h2>
          <p>
            El mapa público muestra agregados territoriales. Los expedientes, documentos, teléfonos,
            ubicaciones precisas de hogares y fotografías sensibles permanecen protegidos.
          </p>
        </div>
        <ol>
          <li>
            <strong>1</strong>
            <span>
              <b>Reportado</b>Una persona o equipo registra el hecho, incluso sin conexión.
            </span>
          </li>
          <li>
            <strong>2</strong>
            <span>
              <b>Corroborado</b>Otra fuente o brigada confirma lugar, momento y evidencia.
            </span>
          </li>
          <li>
            <strong>3</strong>
            <span>
              <b>Validado</b>Un actor autorizado firma la decisión según su rol.
            </span>
          </li>
          <li>
            <strong>4</strong>
            <span>
              <b>Publicado</b>Solo el agregado seguro aparece en el informe público.
            </span>
          </li>
          <li>
            <strong>5</strong>
            <span>
              <b>Anclado</b>La huella del lote se registra en Solana para probar integridad.
            </span>
          </li>
        </ol>
      </section>
    </>
  );
}
