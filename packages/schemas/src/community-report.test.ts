import { describe, expect, it } from "vitest";
import {
  communityReportSchema,
  createCommunityReportSchema,
  mapCommunityReportSchema,
  publicCommunityReportSchema,
  reviewCommunityReportSchema,
} from "./community-report.js";

const point = { type: "Point" as const, coordinates: [-76.53, 3.43] as [number, number] };

describe("community report schemas", () => {
  it("accepts a valid PMU report without a category", () => {
    const result = createCommunityReportSchema.parse({
      clientMutationId: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
      reportType: "pmu",
      title: "PMU Comuna 3",
      location: point,
    });

    expect(result.category).toBeNull();
    expect(result.description).toBeNull();
  });

  it("requires a category when reportType is 'necesidad'", () => {
    const result = createCommunityReportSchema.safeParse({
      clientMutationId: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
      reportType: "necesidad",
      title: "Falta agua potable",
      location: point,
    });

    expect(result.success).toBe(false);
  });

  it("rejects coordinates out of range", () => {
    const result = createCommunityReportSchema.safeParse({
      clientMutationId: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
      reportType: "pmu",
      title: "PMU fuera de rango",
      location: { type: "Point", coordinates: [200, 3.43] },
    });

    expect(result.success).toBe(false);
  });

  it("strips contact and internal fields from the public shape", () => {
    const full = communityReportSchema.parse({
      id: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
      incidentId: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
      territoryId: null,
      reportType: "necesidad",
      category: "agua",
      title: "Falta agua potable",
      description: null,
      location: point,
      status: "reported",
      contact: "3001234567",
      externalSourceId: null,
      metadata: null,
      externalKey: null,
      reviewedByActorId: null,
      reviewedAt: null,
      reviewNotes: null,
      peopleReported: null,
      signsOfLife: null,
      respondersOnSite: null,
      routeStatus: null,
      damageSeverity: null,
      shelterCapacity: null,
      shelterOccupancy: null,
      locationPrecision: "approximate",
      createdAt: "2026-08-14T12:00:00Z",
      updatedAt: "2026-08-14T12:00:00Z",
    });

    const publicView = publicCommunityReportSchema.parse(full);

    expect(publicView).not.toHaveProperty("contact");
    expect(publicView).not.toHaveProperty("reviewedByActorId");
  });

  // Un rescate llega desde un teléfono, con una mano, al lado de un derrumbe. Si el esquema
  // exigiera saber cuánta gente hay o si se oye algo, el reporte que sí trae la ubicación —que es
  // la mitad del valor— se perdería por no poder responder lo demás.
  it("accepts a rescue report with nothing but a location and a title", () => {
    const result = createCommunityReportSchema.parse({
      clientMutationId: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
      reportType: "rescate",
      title: "Personas bajo escombros — señales sin confirmar",
      location: point,
    });

    expect(result.category).toBeNull();
    expect(result.peopleReported).toBeNull();
    expect(result.signsOfLife).toBeNull();
  });

  it("keeps the rescue fields out of the other report types", () => {
    const result = createCommunityReportSchema.safeParse({
      clientMutationId: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
      reportType: "necesidad",
      category: "escombros",
      title: "Remoción de escombros en la vía",
      location: point,
      signsOfLife: "yes",
    });

    expect(result.success).toBe(false);
  });

  // Una vía de la que no sabemos si está abierta o cerrada no le sirve a nadie: al contrario que
  // los campos de rescate, este sí se exige. Y al revés, no puede aparecer en otro tipo.
  it("requires the route status on a route report", () => {
    const withoutStatus = createCommunityReportSchema.safeParse({
      clientMutationId: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
      reportType: "via",
      title: "Cierre total por derrumbe",
      location: point,
    });

    expect(withoutStatus.success).toBe(false);

    const withStatus = createCommunityReportSchema.parse({
      clientMutationId: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
      reportType: "via",
      title: "Cierre total por derrumbe",
      location: point,
      routeStatus: "bloqueada",
    });

    expect(withStatus.routeStatus).toBe("bloqueada");
    expect(withStatus.category).toBeNull();
  });

  it("keeps the route status out of the other report types", () => {
    const result = createCommunityReportSchema.safeParse({
      clientMutationId: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
      reportType: "necesidad",
      category: "escombros",
      title: "Remoción de escombros en la vía",
      location: point,
      routeStatus: "bloqueada",
    });

    expect(result.success).toBe(false);
  });

  // El mapa decide el dibujo del marcador con la proyección ligera, que deja fuera metadata. Si
  // `routeStatus` no viajara ahí, una vía reabierta se pintaría igual que un cierre total.
  it("carries the route status in the light map projection", () => {
    const mapped = mapCommunityReportSchema.parse({
      id: "6f6b1a2c-1f6d-4c1e-9a1f-2b3c4d5e6f70",
      reportType: "via",
      category: null,
      title: "Aeropuerto cerrado — Buenaventura",
      location: point,
      status: "reported",
      peopleReported: null,
      signsOfLife: null,
      respondersOnSite: null,
      routeStatus: "bloqueada",
      damageSeverity: null,
      shelterCapacity: null,
      shelterOccupancy: null,
      locationPrecision: "approximate",
      createdAt: "2026-08-14T12:00:00Z",
    });

    expect(mapped.routeStatus).toBe("bloqueada");
    expect(mapped).not.toHaveProperty("metadata");
  });

  // Un edificio colapsado no puede dibujarse igual que una fachada agrietada, y el mapa decide el
  // marcador con la proyección ligera: si la severidad no viajara ahí, los ~100 colapsos quedarían
  // indistinguibles de los miles de daños leves.
  it("requires the damage severity on a damage report and carries it to the map", () => {
    expect(
      createCommunityReportSchema.safeParse({
        clientMutationId: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
        reportType: "dano",
        title: "Edificio Cantabria",
        location: point,
      }).success,
    ).toBe(false);

    const mapped = mapCommunityReportSchema.parse({
      id: "6f6b1a2c-1f6d-4c1e-9a1f-2b3c4d5e6f71",
      reportType: "dano",
      category: null,
      title: "Conjunto Torres del Limonar Capri",
      location: point,
      status: "corroborated",
      peopleReported: null,
      signsOfLife: null,
      respondersOnSite: null,
      routeStatus: null,
      damageSeverity: "colapso",
      shelterCapacity: null,
      shelterOccupancy: null,
      locationPrecision: "approximate",
      createdAt: "2026-08-14T12:00:00Z",
    });

    expect(mapped.damageSeverity).toBe("colapso");
  });

  it("keeps the damage severity out of the other report types", () => {
    expect(
      createCommunityReportSchema.safeParse({
        clientMutationId: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
        reportType: "pmu",
        title: "Puesto de mando",
        location: point,
        damageSeverity: "colapso",
      }).success,
    ).toBe(false);
  });

  // La capacidad de un albergue solo significa algo en un albergue. Un acopio con «capacidad 200»
  // se leería como que caben 200 personas ahí, que es justo la confusión que este ticket parte.
  it("keeps the shelter fields inside shelter reports", () => {
    const base = {
      clientMutationId: "5f0f3f2a-6d4b-4b3a-9f0e-2a2b3c4d5e6f",
      title: "Coliseo del barrio",
      location: point,
    };
    expect(
      createCommunityReportSchema.safeParse({
        ...base,
        reportType: "acopio",
        shelterCapacity: 200,
      }).success,
    ).toBe(false);

    const shelter = createCommunityReportSchema.parse({
      ...base,
      reportType: "albergue",
      shelterCapacity: 200,
      shelterOccupancy: 140,
    });
    expect(shelter.shelterCapacity).toBe(200);
    // Y son opcionales: quien reporta una carpa a las once de la noche no cuenta camas, y exigir
    // el número convertiría el dato que sí tenemos —que existe y dónde está— en uno que nadie envía.
    const sinCifras = createCommunityReportSchema.parse({ ...base, reportType: "albergue" });
    expect(sinCifras.shelterCapacity).toBeNull();
  });

  it("does not allow reviewing a report back into 'reported'", () => {
    const result = reviewCommunityReportSchema.safeParse({ status: "reported", notes: null });

    expect(result.success).toBe(false);
  });
});
