"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  IconBrick,
  IconCompass,
  IconCrane,
  IconDot,
  IconPlug,
  IconSaw,
  IconStore,
  IconTools,
  IconWorker,
  IconWrench,
} from "./icons";

/** Cualquiera del set de `icons.tsx`: comparten firma, así que se pasan como dato. */
type IconComponent = typeof IconDot;

const LocationPicker = dynamic(
  () => import("./location-picker").then((mod) => mod.LocationPicker),
  { ssr: false, loading: () => <div className="locationPicker mapLoading">Cargando mapa…</div> },
);

type MaterialProgress = {
  catalogItemCode: string;
  catalogItemName: string;
  category: string;
  unit: string;
  quantityNeeded: number;
  quantityDelivered: number;
};

type TerritoryProgress = {
  territoryCode: string;
  territoryName: string;
  casesTotal: number;
  casesWithMaterialsAssigned: number;
  suppliersRegistered: number;
  workforceHeadcount: number;
};

type ReconstructionProgress = {
  materials: MaterialProgress[];
  territories: TerritoryProgress[];
  totals: {
    casesTotal: number;
    casesWithMaterialsAssigned: number;
    suppliersRegistered: number;
    workforceHeadcount: number;
    donationsLinkedToCases: number;
  };
};

type SupplierOffer = {
  catalogItemCode: string;
  catalogItemName: string;
  unit: string;
  unitPrice: number | null;
  currency: string | null;
  availableQuantity: number | null;
};

type MaterialSupplier = {
  id: string;
  name: string;
  address: string | null;
  publicContact: string | null;
  verificationLevel: "reported" | "corroborated" | "verified";
  offers: SupplierOffer[];
};

type WorkforceProfile = {
  id: string;
  territoryCode: string | null;
  maskedDisplayName: string;
  role: string;
  headcount: number;
  availability: "available" | "assigned" | "unavailable";
};

type Department = { code: string; name: string };

const CATALOG_OPTIONS = [
  { code: "ladrillo", name: "Ladrillo", unit: "unidad" },
  { code: "bloque-concreto", name: "Bloque de concreto", unit: "unidad" },
  { code: "cemento", name: "Cemento", unit: "kg" },
  { code: "varilla", name: "Varilla / hierro de refuerzo", unit: "m" },
  { code: "arena", name: "Arena", unit: "m3" },
  { code: "gravilla", name: "Gravilla / triturado", unit: "m3" },
  { code: "madera", name: "Madera", unit: "unidad" },
  { code: "teja-zinc", name: "Teja de zinc", unit: "unidad" },
  { code: "teja-barro", name: "Teja de barro", unit: "unidad" },
  { code: "lamina-fibrocemento", name: "Lámina de fibrocemento", unit: "unidad" },
  { code: "clavos", name: "Clavos / puntillas", unit: "kg" },
  { code: "pintura", name: "Pintura", unit: "gal" },
  { code: "tuberia-pvc", name: "Tubería PVC", unit: "m" },
  { code: "cable-electrico", name: "Cable eléctrico", unit: "m" },
];

const ROLE_OPTIONS: Array<{ id: WorkforceProfile["role"]; label: string; Icon: IconComponent }> = [
  { id: "site_lead", label: "Líder de obra", Icon: IconCompass },
  { id: "construction_master", label: "Maestro de construcción", Icon: IconCrane },
  { id: "mason", label: "Albañil", Icon: IconBrick },
  { id: "electrician", label: "Electricista", Icon: IconPlug },
  { id: "plumber", label: "Plomero", Icon: IconWrench },
  { id: "carpenter", label: "Carpintero", Icon: IconSaw },
  { id: "general_labor", label: "Obrero general", Icon: IconTools },
  { id: "other", label: "Otro oficio", Icon: IconDot },
];

function SupplierRegistrationForm({
  apiUrl,
  incidentCode,
  onClose,
  onSubmitted,
}: {
  apiUrl: string;
  incidentCode: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleItem = (code: string) => {
    setSelectedItems((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  };

  const submit = async () => {
    if (name.trim().length < 2) {
      setError("Escribe el nombre del negocio.");
      return;
    }
    if (!location) {
      setError("Toca el mapa para marcar dónde está tu negocio.");
      return;
    }
    if (selectedItems.length === 0) {
      setError("Selecciona al menos un material que ofrezcas.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/v1/public/incidents/${incidentCode}/material-suppliers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientMutationId: crypto.randomUUID(),
            name: name.trim(),
            location: { type: "Point", coordinates: location },
            address: address.trim() || null,
            publicContact: contact.trim() || null,
            offers: selectedItems.map((code) => ({
              catalogItemCode: code,
              unit: CATALOG_OPTIONS.find((item) => item.code === code)?.unit ?? "unidad",
            })),
          }),
        },
      );
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Ya registraste varias veces seguidas. Espera unos minutos."
            : "No pudimos publicar el registro. Intenta de nuevo.",
        );
        return;
      }
      onSubmitted();
    } catch {
      setError("Sin conexión. El registro no se pudo enviar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="communityReportForm reconstructionForm"
      role="dialog"
      aria-label="Registrar proveedor"
    >
      <div className="communityReportFormHeader">
        <strong>Registrar mi negocio como proveedor</strong>
        <button type="button" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </div>

      <p className="communityReportFormLabel">1. Datos del negocio</p>
      <label>
        <span>Nombre del negocio</span>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={180} />
      </label>
      <label>
        <span>Dirección (opcional)</span>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          maxLength={300}
        />
      </label>
      <label>
        <span>Contacto público (opcional)</span>
        <input
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder="WhatsApp o teléfono del negocio"
          maxLength={160}
        />
      </label>

      <div>
        <span className="communityReportFormLabel">2. Ubicación — toca el mapa</span>
        <LocationPicker value={location} onChange={setLocation} />
      </div>

      <div>
        <span className="communityReportFormLabel">
          3. ¿Qué materiales ofreces?
          {selectedItems.length > 0 && (
            <span className="reconstructionSelectionCount">{selectedItems.length}</span>
          )}
        </span>
        <div className="communityReportCategoryGrid">
          {CATALOG_OPTIONS.map((item) => (
            <button
              type="button"
              key={item.code}
              className={selectedItems.includes(item.code) ? "active" : ""}
              onClick={() => toggleItem(item.code)}
            >
              {selectedItems.includes(item.code) && <span aria-hidden="true">✓ </span>}
              {item.name}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p className="communityReportFormError" role="alert">
          {error}
        </p>
      )}
      <div className="communityReportFormActions">
        <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
          Cancelar
        </button>
        <button type="button" onClick={() => void submit()} disabled={submitting}>
          {submitting ? "Publicando…" : "Registrar negocio"}
        </button>
      </div>
    </div>
  );
}

function WorkforceRegistrationForm({
  apiUrl,
  incidentCode,
  departments,
  onClose,
  onSubmitted,
}: {
  apiUrl: string;
  incidentCode: string;
  departments: Department[];
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [territoryCode, setTerritoryCode] = useState(departments[0]?.code ?? "");
  const [displayName, setDisplayName] = useState("");
  const [contact, setContact] = useState("");
  const [role, setRole] = useState<WorkforceProfile["role"]>("mason");
  const [headcount, setHeadcount] = useState(1);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (displayName.trim().length < 2) {
      setError("Escribe tu nombre.");
      return;
    }
    if (!territoryCode) {
      setError("Selecciona un departamento.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/v1/public/incidents/${incidentCode}/workforce-profiles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientMutationId: crypto.randomUUID(),
            territoryCode,
            displayName: displayName.trim(),
            contact: contact.trim() || null,
            role,
            headcount,
            notes: notes.trim() || null,
          }),
        },
      );
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Ya registraste varias veces seguidas. Espera unos minutos."
            : "No pudimos publicar el registro. Intenta de nuevo.",
        );
        return;
      }
      onSubmitted();
    } catch {
      setError("Sin conexión. El registro no se pudo enviar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="communityReportForm reconstructionForm"
      role="dialog"
      aria-label="Registrar mano de obra"
    >
      <div className="communityReportFormHeader">
        <strong>Registrar mano de obra disponible</strong>
        <button type="button" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </div>
      <p className="communityReportSource">
        Tu nombre se muestra en público solo parcialmente (ej. "María G***"). Tu contacto nunca se
        publica — queda cifrado y solo lo puede ver un coordinador de Operaciones para contactarte
        sobre una asignación.
      </p>

      <p className="communityReportFormLabel">1. Tus datos</p>
      <label>
        <span>Tu nombre</span>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={160}
        />
      </label>
      <label>
        <span>Contacto (opcional, protegido — no se publica)</span>
        <input
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder="Teléfono o WhatsApp"
          maxLength={160}
        />
      </label>

      <p className="communityReportFormLabel">2. Dónde y en qué oficio ayudas</p>
      <label>
        <span>Departamento</span>
        <select value={territoryCode} onChange={(event) => setTerritoryCode(event.target.value)}>
          {departments.map((department) => (
            <option value={department.code} key={department.code}>
              {department.name}
            </option>
          ))}
        </select>
      </label>
      <div className="communityReportCategoryGrid">
        {ROLE_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.id}
            className={role === option.id ? "active" : ""}
            onClick={() => setRole(option.id)}
          >
            <option.Icon />
            {option.label}
          </button>
        ))}
      </div>

      <p className="communityReportFormLabel">3. Detalles adicionales</p>
      <label>
        <span>¿Cuántas personas?</span>
        <input
          type="number"
          min={1}
          max={500}
          value={headcount}
          onChange={(event) => setHeadcount(Math.max(1, Number(event.target.value) || 1))}
        />
      </label>
      <label>
        <span>Notas (opcional)</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          maxLength={500}
        />
      </label>
      {error && (
        <p className="communityReportFormError" role="alert">
          {error}
        </p>
      )}
      <div className="communityReportFormActions">
        <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
          Cancelar
        </button>
        <button type="button" onClick={() => void submit()} disabled={submitting}>
          {submitting ? "Publicando…" : "Registrar"}
        </button>
      </div>
    </div>
  );
}

export function ReconstructionPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const incidentCode = "colombia-2026";

  const [progress, setProgress] = useState<ReconstructionProgress | null>(null);
  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>([]);
  const [workforce, setWorkforce] = useState<WorkforceProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [workforceFormOpen, setWorkforceFormOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [joinTab, setJoinTab] = useState<"suppliers" | "workforce">("suppliers");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierMaterialFilter, setSupplierMaterialFilter] = useState<string | null>(null);
  const [workforceRoleFilter, setWorkforceRoleFilter] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey isn't read here, it just needs to re-fire the fetch after a registration.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/v1/public/incidents/${incidentCode}/reconstruction-progress`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ReconstructionProgress | null) => data && setProgress(data))
      .catch(() => undefined);
    fetch(`${apiUrl}/v1/public/incidents/${incidentCode}/material-suppliers`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: MaterialSupplier[]) => setSuppliers(data))
      .catch(() => undefined);
    fetch(`${apiUrl}/v1/public/incidents/${incidentCode}/workforce-profiles`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: WorkforceProfile[]) => setWorkforce(data))
      .catch(() => undefined);
    fetch(`${apiUrl}/v1/public/incidents/${incidentCode}/territories?level=department`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          data: {
            features: Array<{ properties: { dpto_ccdgo: string; dpto_cnmbre: string } }>;
          } | null,
        ) => {
          if (!data) return;
          setDepartments(
            data.features
              .map((feature) => ({
                code: feature.properties.dpto_ccdgo,
                name: feature.properties.dpto_cnmbre,
              }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
        },
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [apiUrl, refreshKey]);

  const workforceByRole = ROLE_OPTIONS.map((option) => ({
    ...option,
    headcount: workforce
      .filter((profile) => profile.role === option.id)
      .reduce((sum, profile) => sum + profile.headcount, 0),
    profiles: workforce.filter((profile) => profile.role === option.id),
  })).filter((item) => item.headcount > 0);

  const availableMaterialFilters = useMemo(() => {
    const codes = new Set(
      suppliers.flatMap((supplier) => supplier.offers.map((offer) => offer.catalogItemCode)),
    );
    return CATALOG_OPTIONS.filter((item) => codes.has(item.code));
  }, [suppliers]);

  const filteredSuppliers = useMemo(() => {
    const query = supplierQuery.trim().toLowerCase();
    return suppliers.filter((supplier) => {
      if (
        supplierMaterialFilter &&
        !supplier.offers.some((offer) => offer.catalogItemCode === supplierMaterialFilter)
      ) {
        return false;
      }
      if (query && !`${supplier.name} ${supplier.address ?? ""}`.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [suppliers, supplierQuery, supplierMaterialFilter]);

  const filteredWorkforceByRole = workforceRoleFilter
    ? workforceByRole.filter((role) => role.id === workforceRoleFilter)
    : workforceByRole;

  const totals = progress?.totals;

  return (
    <>
      <section className="reconstructionHero">
        <p className="eyebrow">Reconstrucción</p>
        <h2>De la evaluación de daños a la vivienda reconstruida</h2>
        <p className="subtitle">
          Cada vivienda dañada necesita materiales y mano de obra para reconstruirse. Aquí se
          conectan proveedores locales, cuadrillas disponibles y donaciones con esas necesidades
          reales — cerrando el ciclo entre lo que se dona y lo que de verdad se reconstruye.
        </p>
      </section>

      <div className="headlineGrid reconstructionMetrics">
        <article className="headlineMetric">
          <span>Casos de reconstrucción</span>
          <strong>{totals?.casesTotal ?? 0}</strong>
          <small>{totals?.casesWithMaterialsAssigned ?? 0} con materiales asignados</small>
        </article>
        <article className="headlineMetric">
          <span>Proveedores registrados</span>
          <strong>{totals?.suppliersRegistered ?? suppliers.length}</strong>
          <small>Materiales de construcción en el territorio</small>
        </article>
        <article className="headlineMetric">
          <span>Mano de obra disponible</span>
          <strong>{totals?.workforceHeadcount ?? 0}</strong>
          <small>Personas registradas por oficio</small>
        </article>
        <article className="headlineMetric">
          <span>Donaciones conectadas</span>
          <strong>{totals?.donationsLinkedToCases ?? 0}</strong>
          <small>Ligadas a un caso específico</small>
        </article>
      </div>

      {progress && progress.materials.length > 0 && (
        <section className="reconstructionSection">
          <div className="sectionHeading compact">
            <h3>Materiales: lo que se necesita y lo que ya llegó</h3>
          </div>
          <div className="aidBalances">
            {progress.materials.map((material) => {
              const progressPct =
                material.quantityNeeded > 0
                  ? Math.min(
                      100,
                      Math.round((material.quantityDelivered / material.quantityNeeded) * 100),
                    )
                  : 0;
              return (
                <article key={material.catalogItemCode}>
                  <div>
                    <strong>{material.catalogItemName}</strong>
                    <span>
                      {material.quantityDelivered} {material.unit} entregados de{" "}
                      {material.quantityNeeded} {material.unit}
                    </span>
                  </div>
                  <div
                    className="progressTrack"
                    role="progressbar"
                    aria-label={`${progressPct}% entregado`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progressPct}
                  >
                    <span style={{ width: `${progressPct}%` }} />
                  </div>
                  <b>{progressPct}%</b>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {progress && progress.territories.length > 0 && (
        <section className="reconstructionSection">
          <div className="sectionHeading compact">
            <h3>Avance por departamento</h3>
          </div>
          <div className="reconstructionTerritoryGrid">
            {progress.territories.map((territory) => (
              <article key={territory.territoryCode} className="reconstructionTerritoryCard">
                <strong>{territory.territoryName}</strong>
                <dl>
                  <div>
                    <dt>Casos</dt>
                    <dd>{territory.casesTotal}</dd>
                  </div>
                  <div>
                    <dt>Con materiales</dt>
                    <dd>{territory.casesWithMaterialsAssigned}</dd>
                  </div>
                  <div>
                    <dt>Proveedores</dt>
                    <dd>{territory.suppliersRegistered}</dd>
                  </div>
                  <div>
                    <dt>Mano de obra</dt>
                    <dd>{territory.workforceHeadcount}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="reconstructionSection">
        <div className="sectionHeading compact">
          <h3>Únete a la reconstrucción</h3>
        </div>

        <div className="reconstructionTabs" role="tablist" aria-label="Proveedores o mano de obra">
          <button
            type="button"
            role="tab"
            aria-selected={joinTab === "suppliers"}
            className={joinTab === "suppliers" ? "active" : ""}
            onClick={() => setJoinTab("suppliers")}
          >
            <strong>
              <IconStore />
              Proveedores de materiales
            </strong>
            <span>{suppliers.length} registrados</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={joinTab === "workforce"}
            className={joinTab === "workforce" ? "active" : ""}
            onClick={() => setJoinTab("workforce")}
          >
            <strong>
              <IconWorker />
              Mano de obra y voluntarios
            </strong>
            <span>{totals?.workforceHeadcount ?? 0} personas</span>
          </button>
        </div>

        {joinTab === "suppliers" ? (
          <div className="reconstructionTabPanel">
            <div className="reconstructionPanelToolbar">
              <input
                type="search"
                className="reconstructionSearchInput"
                placeholder="Buscar por nombre o dirección…"
                value={supplierQuery}
                onChange={(event) => setSupplierQuery(event.target.value)}
                aria-label="Buscar proveedor"
              />
              <button
                type="button"
                className="button primary"
                onClick={() => setSupplierFormOpen(true)}
              >
                Registrar mi negocio
              </button>
            </div>

            {supplierFormOpen && (
              <SupplierRegistrationForm
                apiUrl={apiUrl}
                incidentCode={incidentCode}
                onClose={() => setSupplierFormOpen(false)}
                onSubmitted={() => {
                  setSupplierFormOpen(false);
                  setRefreshKey((key) => key + 1);
                }}
              />
            )}

            {availableMaterialFilters.length > 0 && (
              <div className="reconstructionFilterChips">
                <button
                  type="button"
                  className={supplierMaterialFilter === null ? "active" : ""}
                  onClick={() => setSupplierMaterialFilter(null)}
                >
                  Todos los materiales
                </button>
                {availableMaterialFilters.map((item) => (
                  <button
                    type="button"
                    key={item.code}
                    className={supplierMaterialFilter === item.code ? "active" : ""}
                    onClick={() => setSupplierMaterialFilter(item.code)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            )}

            {suppliers.length === 0 ? (
              <p className="sectionNote">
                Todavía no hay proveedores registrados en este territorio.
              </p>
            ) : filteredSuppliers.length === 0 ? (
              <p className="sectionNote">Ningún proveedor coincide con esa búsqueda o filtro.</p>
            ) : (
              <>
                <div className="supplierGrid">
                  {filteredSuppliers.map((supplier) => (
                    <article key={supplier.id} className="supplierCard">
                      <div className="supplierCardHeader">
                        <strong>{supplier.name}</strong>
                        <span
                          className={`communityReportStatusBadge ${supplier.verificationLevel === "reported" ? "unverified" : "verified"}`}
                        >
                          {supplier.verificationLevel === "verified"
                            ? "Verificado"
                            : supplier.verificationLevel === "corroborated"
                              ? "Corroborado"
                              : "Sin verificar"}
                        </span>
                      </div>
                      {supplier.address && <p>{supplier.address}</p>}
                      {supplier.publicContact && <p>{supplier.publicContact}</p>}
                      <ul className="supplierOffers">
                        {supplier.offers.map((offer) => (
                          <li key={offer.catalogItemCode}>
                            {offer.catalogItemName}
                            {offer.unitPrice
                              ? ` · ${offer.currency ?? ""}$${offer.unitPrice}/${offer.unit}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
                <ul className="reconstructionLegend">
                  <li>
                    <span className="communityReportStatusBadge verified">
                      Verificado / Corroborado
                    </span>{" "}
                    — cadenas nacionales y negocios confirmados.
                  </li>
                  <li>
                    <span className="communityReportStatusBadge unverified">Sin verificar</span> —
                    autoregistro, todavía sin corroborar.
                  </li>
                </ul>
              </>
            )}
          </div>
        ) : (
          <div className="reconstructionTabPanel">
            <div className="reconstructionPanelToolbar">
              <div className="reconstructionFilterChips">
                <button
                  type="button"
                  className={workforceRoleFilter === null ? "active" : ""}
                  onClick={() => setWorkforceRoleFilter(null)}
                >
                  Todos los oficios
                </button>
                {workforceByRole.map((role) => (
                  <button
                    type="button"
                    key={role.id}
                    className={workforceRoleFilter === role.id ? "active" : ""}
                    onClick={() => setWorkforceRoleFilter(role.id)}
                  >
                    <role.Icon />
                    {role.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="button primary"
                onClick={() => setWorkforceFormOpen(true)}
              >
                Registrarme
              </button>
            </div>

            {workforceFormOpen && (
              <WorkforceRegistrationForm
                apiUrl={apiUrl}
                incidentCode={incidentCode}
                departments={departments}
                onClose={() => setWorkforceFormOpen(false)}
                onSubmitted={() => {
                  setWorkforceFormOpen(false);
                  setRefreshKey((key) => key + 1);
                }}
              />
            )}

            {workforceByRole.length === 0 ? (
              <p className="sectionNote">Todavía no hay mano de obra registrada.</p>
            ) : (
              <div className="workforceRoleGroups">
                {filteredWorkforceByRole.map((role) => (
                  <div className="workforceRoleGroup" key={role.id}>
                    <p>
                      <role.Icon />
                      {role.label}: <strong>{role.headcount}</strong>
                    </p>
                    <ul className="workforceProfileList">
                      {role.profiles.map((profile) => (
                        <li key={profile.id}>
                          <span
                            className={`workforceAvailabilityDot ${profile.availability}`}
                            aria-hidden="true"
                          />
                          {profile.maskedDisplayName}
                          {profile.headcount > 1 ? ` · ${profile.headcount} personas` : ""}
                          {profile.territoryCode
                            ? ` · ${departments.find((department) => department.code === profile.territoryCode)?.name ?? profile.territoryCode}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="reconstructionCycleNote">
        <p className="eyebrow">Cómo cierra el ciclo</p>
        <p className="reconstructionCycleDetail">
          Un daño evaluado en campo genera una necesidad de materiales. Un proveedor local o una
          donación cubre esa necesidad. Una cuadrilla disponible la ejecuta. Cuando el material se
          entrega a un caso específico, esa entrega queda ligada a la donación que la financió — así
          cada aporte se puede rastrear hasta la vivienda que ayudó a reconstruir.
        </p>
      </div>
    </>
  );
}
