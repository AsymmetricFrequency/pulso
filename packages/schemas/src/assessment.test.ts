import { describe, expect, it } from "vitest";
import { createRapidAssessmentSchema } from "./assessment.js";

const baseAssessment = {
  clientMutationId: "0198a03d-c08f-7e4a-91ee-102c68bff201",
  deviceId: "field-device-001",
  observedAt: "2026-08-14T09:15:00-05:00",
  severity: "high",
  urgency: "urgent",
};

describe("createRapidAssessmentSchema", () => {
  it("accepts a minimal damage and need report", () => {
    const result = createRapidAssessmentSchema.parse({
      ...baseAssessment,
      damageTypes: ["housing"],
      needTypes: ["shelter", "construction_materials"],
      affectedHouseholds: 4,
      affectedPeople: 13,
    });

    expect(result).toMatchObject({ severity: "high", urgency: "urgent", notes: null });
  });

  it("rejects an empty report", () => {
    const result = createRapidAssessmentSchema.safeParse({
      ...baseAssessment,
      damageTypes: [],
      needTypes: [],
    });

    expect(result.success).toBe(false);
  });
});
