import { describe, expect, it } from "vitest";
import { parseDaneTerritories } from "./dane-territories.js";

const polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-76, 3],
      [-75, 3],
      [-75, 4],
      [-76, 3],
    ],
  ],
};

describe("parseDaneTerritories", () => {
  it("rejects incomplete national datasets", () => {
    expect(() =>
      parseDaneTerritories(
        {
          features: [
            {
              geometry: polygon,
              properties: { DPTO_CCDGO: "76", DPTO_CNMBRE: "VALLE", DPTO_NAREA: 1 },
            },
          ],
        },
        {
          features: [
            {
              geometry: polygon,
              properties: {
                DPTO_CCDGO: "76",
                MPIO_CDPMP: "76001",
                MPIO_CNMBRE: "CALI",
                MPIO_NAREA: 1,
              },
            },
          ],
        },
      ),
    ).toThrow(/Expected 33/);
  });
});
