import { describe, expect, it } from "vitest";
import { parseSgcEarthquakes } from "./sgc-earthquakes.js";

describe("parseSgcEarthquakes", () => {
  it("normalizes the SGC latitude-longitude order", () => {
    const events = parseSgcEarthquakes(
      {
        features: [
          {
            type: "Feature",
            id: "SGC2026test",
            geometry: { type: "Point", coordinates: [4.49, -76.68, 40] },
            properties: {
              agency: "SGC",
              type: "earthquake",
              mag: 2.3,
              magType: "MLr_1",
              localTime: "2026-08-14 12:17",
              utcTime: "2026-08-14 17:17",
              updated: "2026-08-14 16:37:06",
              place: "Istmina - Chocó, Colombia",
              status: "manual",
              closerTowns: "Sipí a 18 km",
              felt: 0,
              mmi: 0,
              cdi: 0,
            },
          },
        ],
      },
      "2026-08-10T00:00:00-05:00",
    );
    expect(events[0]).toMatchObject({
      latitude: 4.49,
      longitude: -76.68,
      depthKm: 40,
      agency: "SGC",
    });
  });
});
