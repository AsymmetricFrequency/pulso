import { CommunityReportNotFoundError } from "@pulso/domain";
import { moveCommunityReportSchema } from "@pulso/schemas";
import { describe, expect, it } from "vitest";
import { MemoryCommunityReportRepository } from "./memory-community-report-repository.js";
import { MemoryIncidentRepository } from "./memory-incident-repository.js";

const point = { type: "Point" as const, coordinates: [-76.53, 3.43] as [number, number] };
const corregido = { type: "Point" as const, coordinates: [-76.5296, 3.4026] as [number, number] };

async function conUnReporte() {
  const incidents = new MemoryIncidentRepository();
  const incident = await incidents.create({
    code: "colombia-2026",
    name: "Sismo",
    countryCode: "CO",
    disasterType: "earthquake",
    startedAt: "2026-08-10T12:34:00Z",
    timezone: "America/Bogota",
  });
  const reports = new MemoryCommunityReportRepository(incidents);
  const report = await reports.create(incident.id, moveFixture(), { sourceIpHash: null });
  return { reports, reportId: report.id };
}

function moveFixture() {
  return {
    clientMutationId: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
    reportType: "pmu" as const,
    category: null,
    title: "Acopio mal ubicado",
    description: null,
    location: point,
    contact: null,
    peopleReported: null,
    signsOfLife: null,
    respondersOnSite: null,
    routeStatus: null,
    damageSeverity: null,
    shelterCapacity: null,
    shelterOccupancy: null,
  };
}

describe("mover un punto", () => {
  it("guarda de dónde venía, no solo a dónde va", async () => {
    const { reports, reportId } = await conUnReporte();

    await reports.move(reportId, "01a00a6a-261a-7126-96f0-a5dd3e65abba", {
      location: corregido,
      reason: "La dirección real es dos cuadras al sur, confirmado por teléfono",
    });

    // Sin la coordenada anterior nadie puede responder después «¿esto lo movimos nosotros o vino
    // así?», que es justo la pregunta que se hace cuando algo salió mal.
    expect(reports.moves).toHaveLength(1);
    expect(reports.moves[0]?.from).toEqual(point);
    expect(reports.moves[0]?.to).toEqual(corregido);
    expect(reports.moves[0]?.reason).toContain("dos cuadras");
  });

  // Quien mueve un punto estuvo mirando. Dejarlo marcado como aproximado diría que sigue siendo una
  // deducción de una máquina cuando ya no lo es.
  it("deja de ser aproximado cuando una persona lo corrige", async () => {
    const { reports, reportId } = await conUnReporte();
    const movido = await reports.move(reportId, "01a00a6a-261a-7126-96f0-a5dd3e65abba", {
      location: corregido,
      reason: "Corregido contra la dirección publicada por la fuente",
    });
    expect(movido.locationPrecision).toBe("approximate");
    expect(movido.location).toEqual(corregido);
  });

  it("falla si el punto no existe, en vez de crear uno", async () => {
    const { reports } = await conUnReporte();
    await expect(
      reports.move("01a01094-fa7c-756a-a7d4-e7f1cd00dab2", "01a00a6a-261a-7126-96f0-a5dd3e65abba", {
        location: corregido,
        reason: "no debería llegar aquí",
      }),
    ).rejects.toBeInstanceOf(CommunityReportNotFoundError);
  });
});

describe("moveCommunityReportSchema", () => {
  // Un historial que responde «quién» y no «por qué» deja sin contestar lo que de verdad se
  // pregunta después. Por eso el motivo no es opcional ni admite un «ok».
  it("exige un motivo con contenido", () => {
    expect(moveCommunityReportSchema.safeParse({ location: point }).success).toBe(false);
    expect(moveCommunityReportSchema.safeParse({ location: point, reason: "" }).success).toBe(
      false,
    );
    expect(moveCommunityReportSchema.safeParse({ location: point, reason: "  " }).success).toBe(
      false,
    );
    expect(
      moveCommunityReportSchema.safeParse({ location: point, reason: "dirección corregida" })
        .success,
    ).toBe(true);
  });

  it("rechaza una coordenada fuera de rango", () => {
    const fuera = { type: "Point" as const, coordinates: [200, 3.43] };
    expect(moveCommunityReportSchema.safeParse({ location: fuera, reason: "x y z" }).success).toBe(
      false,
    );
  });
});
