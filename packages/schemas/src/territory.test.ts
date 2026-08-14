import { describe, expect, it } from "vitest";
import { createCoverageEventSchema, territoryImportSchema } from "./territory.js";

const square = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-76, 4],
      [-75, 4],
      [-75, 5],
      [-76, 4],
    ],
  ],
};

describe("territory schemas", () => {
  it("accepts an official feature collection import", () => {
    const result = territoryImportSchema.parse({
      source: "dane_departments",
      territoryType: "department",
      codeProperty: "dpto_ccdgo",
      nameProperty: "dpto_cnmbre",
      featureCollection: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { dpto_ccdgo: "27", dpto_cnmbre: "CHOCÓ" },
            geometry: square,
          },
        ],
      },
    });

    expect(result.featureCollection.features).toHaveLength(1);
    expect(result.parentId).toBeNull();
  });

  it("requires an explicit timestamp for coverage", () => {
    const result = createCoverageEventSchema.safeParse({ status: "visited" });
    expect(result.success).toBe(false);
  });
});
