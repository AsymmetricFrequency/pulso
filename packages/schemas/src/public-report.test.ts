import { describe, expect, it } from "vitest";
import { publicSituationReportSchema } from "./public-report.js";

describe("public situation report schema", () => {
  it("rejects incomplete or non-canonical aid balances", () => {
    const result = publicSituationReportSchema.safeParse({
      schemaVersion: 1,
      incident: { code: "colombia-2026" },
      metrics: [],
      territories: [],
      updates: [],
      aidBalances: [{ label: "Cemento", unit: "más o menos" }],
    });

    expect(result.success).toBe(false);
  });
});
