"use client";

import { useState } from "react";

export type CommunityReportType = "pmu" | "necesidad";
export type CommunityReportCategory =
  | "agua"
  | "alimentos"
  | "salud"
  | "refugio"
  | "higiene"
  | "herramienta"
  | "escombros"
  | "voluntariado"
  | "animales"
  | "logistica"
  | "otro";

export type CommunityReportMetadata = {
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  department?: string | null;
  urgency?: string | null;
  sourceStatus?: string | null;
  needs?: string[] | null;
  personsNeeded?: number | null;
  personsPresent?: number | null;
  capacity?: string | null;
  schedule?: string | null;
  organization?: string | null;
  reportedAt?: string | null;
  reportUpdatedAt?: string | null;
  confidence?: string | null;
  corroborationCount?: number | null;
  needsOpen?: number | null;
  needsCovered?: number | null;
  departmentPriority?: string | null;
  subSource?: string | null;
  hasContact?: boolean | null;
};

export type PublicCommunityReport = {
  id: string;
  reportType: CommunityReportType;
  category: CommunityReportCategory | null;
  title: string;
  description: string | null;
  location: { type: "Point"; coordinates: [number, number] };
  status: "reported" | "corroborated" | "validated" | "rejected" | "superseded";
  externalSourceId: string | null;
  metadata: CommunityReportMetadata | null;
  createdAt: string;
};

export const externalSourceLabels: Record<string, { name: string; url: string }> = {
  "contemos-mapa-situacion": {
    name: "contemos.org",
    url: "https://mapa.contemos.org/",
  },
  "gravitas-mapa-ciudadano": {
    name: "GRAVITAS",
    url: "https://www.mapa.gravitasworld.com/",
  },
};

export const categoryOptions: Array<{ id: CommunityReportCategory; label: string; icon: string }> =
  [
    { id: "agua", label: "Agua", icon: "💧" },
    { id: "alimentos", label: "Alimentos", icon: "🍞" },
    { id: "salud", label: "Salud", icon: "🩺" },
    { id: "refugio", label: "Refugio", icon: "⛺" },
    { id: "higiene", label: "Higiene", icon: "🧴" },
    { id: "herramienta", label: "Herramientas", icon: "🛠️" },
    { id: "escombros", label: "Escombros", icon: "⛏️" },
    { id: "voluntariado", label: "Voluntariado", icon: "🤝" },
    { id: "animales", label: "Animales", icon: "🐾" },
    { id: "logistica", label: "Logística", icon: "🚚" },
    { id: "otro", label: "Otro", icon: "🔹" },
  ];

type CommunityReportFormProps = {
  point: [number, number];
  apiUrl: string;
  incidentCode: string;
  onClose: () => void;
  onSubmitted: (report: PublicCommunityReport) => void;
};

export function CommunityReportForm({
  point,
  apiUrl,
  incidentCode,
  onClose,
  onSubmitted,
}: CommunityReportFormProps) {
  const [reportType, setReportType] = useState<CommunityReportType>("pmu");
  const [category, setCategory] = useState<CommunityReportCategory>("agua");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (title.trim().length < 3) {
      setError("Escribe un título de al menos 3 caracteres.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/v1/public/incidents/${incidentCode}/community-reports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientMutationId: crypto.randomUUID(),
            reportType,
            category: reportType === "necesidad" ? category : null,
            title: title.trim(),
            description: description.trim() || null,
            location: { type: "Point", coordinates: point },
            contact: contact.trim() || null,
          }),
        },
      );
      if (!response.ok) {
        if (response.status === 429) {
          setError("Ya enviaste varios reportes seguidos. Espera unos minutos e intenta de nuevo.");
        } else {
          setError("No pudimos publicar el reporte. Intenta de nuevo.");
        }
        return;
      }
      const created = (await response.json()) as PublicCommunityReport;
      onSubmitted(created);
    } catch {
      setError("Sin conexión. El reporte no se pudo enviar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="communityReportForm" role="dialog" aria-label="Reportar en este punto">
      <div className="communityReportFormHeader">
        <strong>Reportar aquí</strong>
        <button type="button" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </div>

      <div className="communityReportTypeToggle" role="radiogroup" aria-label="Tipo de reporte">
        <button
          type="button"
          className={reportType === "pmu" ? "active" : ""}
          onClick={() => setReportType("pmu")}
        >
          🏳️ Puesto de mando (PMU)
        </button>
        <button
          type="button"
          className={reportType === "necesidad" ? "active" : ""}
          onClick={() => setReportType("necesidad")}
        >
          🆘 Necesidad
        </button>
      </div>

      {reportType === "necesidad" && (
        <div className="communityReportCategoryGrid">
          {categoryOptions.map((option) => (
            <button
              type="button"
              key={option.id}
              className={category === option.id ? "active" : ""}
              onClick={() => setCategory(option.id)}
            >
              <span aria-hidden="true">{option.icon}</span> {option.label}
            </button>
          ))}
        </div>
      )}

      <label>
        <span>Título</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={reportType === "pmu" ? "Ej. PMU Comuna 3" : "Ej. Falta agua potable"}
          maxLength={140}
        />
      </label>

      <label>
        <span>Descripción (opcional)</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={2000}
        />
      </label>

      <label>
        <span>Contacto (opcional, solo para seguimiento — no se publica)</span>
        <input
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder="Teléfono o WhatsApp"
          maxLength={160}
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
          {submitting ? "Publicando…" : "Publicar reporte"}
        </button>
      </div>
    </div>
  );
}
