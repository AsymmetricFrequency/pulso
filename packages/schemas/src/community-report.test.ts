import { describe, expect, it } from "vitest";
import {
  communityReportSchema,
  createCommunityReportSchema,
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

  it("does not allow reviewing a report back into 'reported'", () => {
    const result = reviewCommunityReportSchema.safeParse({ status: "reported", notes: null });

    expect(result.success).toBe(false);
  });
});
