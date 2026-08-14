import { describe, expect, it } from "vitest";
import { createIncidentSchema } from "./incident.js";

describe("createIncidentSchema", () => {
  it("normalizes a valid incident", () => {
    const result = createIncidentSchema.parse({
      code: "colombia-2026",
      name: "Respuesta Colombia 2026",
      disasterType: "earthquake",
      countryCode: "co",
      timezone: "America/Bogota",
      startedAt: "2026-08-10T07:34:00-05:00",
    });

    expect(result.countryCode).toBe("CO");
  });

  it("rejects codes that are unsafe for URLs", () => {
    const result = createIncidentSchema.safeParse({
      code: "Colombia 2026",
      name: "Respuesta Colombia 2026",
      disasterType: "earthquake",
      countryCode: "CO",
      timezone: "America/Bogota",
      startedAt: "2026-08-10T07:34:00-05:00",
    });

    expect(result.success).toBe(false);
  });
});
