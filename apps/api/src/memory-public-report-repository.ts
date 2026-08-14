import type { PublicReportRepository } from "@pulso/domain";
import { type PublicSituationReportDto, publicSituationReportSchema } from "@pulso/schemas";

const demoReport = publicSituationReportSchema.parse({
  schemaVersion: 1,
  incident: {
    code: "colombia-2026",
    name: "Respuesta Colombia 2026",
    countryCode: "CO",
    dataMode: "demo",
    cutoffAt: "2026-08-14T11:30:00-05:00",
    publishedAt: "2026-08-14T11:35:00-05:00",
  },
  metrics: [
    { id: "reports", label: "Reportes recibidos", value: "184", note: "161 con evidencia" },
    {
      id: "damaged-homes",
      label: "Viviendas afectadas",
      value: "73",
      note: "28 requieren inspección",
    },
    {
      id: "open-needs",
      label: "Necesidades abiertas",
      value: "46",
      note: "12 de prioridad alta",
    },
    {
      id: "donations",
      label: "Donaciones registradas",
      value: "$428 M",
      note: "COP · dinero y especie",
    },
    {
      id: "deliveries",
      label: "Entregas verificadas",
      value: "31",
      note: "Con receptor y evidencia",
    },
    {
      id: "active-teams",
      label: "Equipos activos",
      value: "14",
      note: "67 personas desplegadas",
    },
  ],
  territories: [
    {
      code: "27",
      name: "Chocó",
      municipalities: [
        {
          code: "27001",
          name: "Quibdó",
          localities: ["Cabecera municipal", "Zona rural norte"],
        },
        {
          code: "27361",
          name: "Istmina",
          localities: ["Cabecera municipal", "Corregimientos priorizados"],
        },
      ],
      updatedAt: "2026-08-14T11:12:00-05:00",
      confidence: "reported",
      confidenceLabel: "Validación parcial",
      coverage: "9 de 14 zonas visitadas",
      damage: "21 reportes · 13 validados",
      supplies: "8 brechas abiertas",
      donations: "6 entregas verificadas",
      teams: "4 equipos activos",
    },
    {
      code: "76",
      name: "Valle del Cauca",
      municipalities: [
        {
          code: "76001",
          name: "Cali",
          localities: ["Comuna priorizada", "Zona de ladera"],
        },
        {
          code: "76109",
          name: "Buenaventura",
          localities: ["Cabecera distrital", "Zona rural"],
        },
      ],
      updatedAt: "2026-08-14T11:04:00-05:00",
      confidence: "corroborated",
      confidenceLabel: "Datos corroborados",
      coverage: "12 de 16 zonas visitadas",
      damage: "34 reportes · 29 validados",
      supplies: "11 brechas abiertas",
      donations: "9 entregas verificadas",
      teams: "5 equipos activos",
    },
    {
      code: "63",
      name: "Quindío",
      municipalities: [
        {
          code: "63001",
          name: "Armenia",
          localities: ["Cabecera municipal", "Periferia"],
        },
        {
          code: "63130",
          name: "Calarcá",
          localities: ["Cabecera municipal", "Zona rural"],
        },
      ],
      updatedAt: "2026-08-14T10:49:00-05:00",
      confidence: "validated",
      confidenceLabel: "Datos validados",
      coverage: "10 de 10 zonas visitadas",
      damage: "12 reportes · 12 validados",
      supplies: "2 brechas abiertas",
      donations: "11 entregas verificadas",
      teams: "2 equipos activos",
    },
  ],
  updates: [
    {
      id: "demo-housing-quibdo",
      title: "Evaluación de vivienda",
      territory: "Quibdó · zona rural norte",
      detail: "13 viviendas requieren inspección técnica prioritaria.",
      verificationLabel: "Validado por profesional",
      observedAt: "2026-08-14T11:12:00-05:00",
    },
    {
      id: "demo-water-buenaventura",
      title: "Agua y almacenamiento",
      territory: "Buenaventura · zona rural",
      detail: "Brecha estimada de 42 kits familiares y 18 tanques.",
      verificationLabel: "Corroborado en campo",
      observedAt: "2026-08-14T11:04:00-05:00",
    },
    {
      id: "demo-access-cauca",
      title: "Acceso territorial",
      territory: "Cauca · corredor priorizado",
      detail: "Dos zonas continúan sin verificación presencial.",
      verificationLabel: "Requiere segunda fuente",
      observedAt: "2026-08-14T10:30:00-05:00",
    },
  ],
  aidBalances: [
    {
      catalogCode: "construction-materials",
      label: "Materiales de construcción",
      unit: "unidades equivalentes publicables",
      validatedNeed: 1240,
      inTransit: 180,
      deliveredUsable: 620,
      rejected: 24,
      openGap: 440,
    },
    {
      catalogCode: "water-sanitation",
      label: "Agua y saneamiento",
      unit: "unidades",
      validatedNeed: 780,
      inTransit: 84,
      deliveredUsable: 546,
      rejected: 0,
      openGap: 150,
    },
    {
      catalogCode: "food-rations",
      label: "Alimentos",
      unit: "raciones",
      validatedNeed: 1800,
      inTransit: 200,
      deliveredUsable: 1350,
      rejected: 15,
      openGap: 250,
    },
    {
      catalogCode: "temporary-shelter",
      label: "Refugio temporal",
      unit: "kits",
      validatedNeed: 310,
      inTransit: 48,
      deliveredUsable: 124,
      rejected: 2,
      openGap: 138,
    },
  ],
  donationFlow: {
    currency: "COP",
    registered: 428_000_000,
    reconciled: 391_000_000,
    allocated: 276_000_000,
    delivered: 184_000_000,
  },
  integrity: {
    status: "pending",
    network: "none",
    merkleRoot: null,
    transactionSignature: null,
  },
});

export class MemoryPublicReportRepository implements PublicReportRepository {
  async findPublishedByIncidentCode(
    incidentCode: string,
  ): Promise<PublicSituationReportDto | undefined> {
    return incidentCode === demoReport.incident.code ? structuredClone(demoReport) : undefined;
  }
}
