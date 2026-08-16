import { describe, expect, it } from "vitest";
import { mmiLabel, parseMmiCoverage, parseUsgsEvent } from "./usgs.js";

describe("parseUsgsEvent", () => {
  it("resolves the ShakeMap coverage URL from the event, not from a hardcoded path", () => {
    // El USGS revisa el modelo durante días y la URL lleva la marca de la versión. Fijarla en el
    // código dejaría a Pulso publicando una versión vieja sin enterarse.
    const event = parseUsgsEvent("us6000tjl2", {
      properties: {
        mag: 7.4,
        place: "5 km S of San José del Palmar, Colombia",
        time: 1786365268125,
        products: {
          shakemap: [
            {
              contents: {
                "download/coverage_mmi_low_res.covjson": { url: "https://usgs/low.covjson" },
                "download/cont_mmi.json": { url: "https://usgs/cont.json" },
              },
            },
          ],
        },
      },
      geometry: { coordinates: [-76.291741, 4.990935, 103] },
    });

    expect(event.magnitude).toBe(7.4);
    expect(event.depthKm).toBe(103);
    expect(event.latitude).toBeCloseTo(4.990935);
    expect(event.coverageUrl).toBe("https://usgs/low.covjson");
    expect(event.occurredAt).toBe(new Date(1786365268125).toISOString());
  });

  it("falls back to the medium resolution grid when there is no low resolution one", () => {
    const event = parseUsgsEvent("x", {
      properties: {
        products: {
          shakemap: [
            {
              contents: {
                "download/coverage_mmi_medium_res.covjson": { url: "https://usgs/med.covjson" },
              },
            },
          ],
        },
      },
    });
    expect(event.coverageUrl).toBe("https://usgs/med.covjson");
  });

  it("reports no coverage instead of guessing when ShakeMap is not published yet", () => {
    const event = parseUsgsEvent("x", { properties: {} });
    expect(event.coverageUrl).toBeNull();
    expect(event.magnitude).toBeNull();
  });
});

describe("parseMmiCoverage", () => {
  // Malla 2x3 con los ejes comprimidos como start/stop/num, igual que la publica el USGS.
  const coverage = {
    domain: {
      axes: {
        x: { start: -79, stop: -77, num: 3 },
        y: { start: 1, stop: 2, num: 2 },
      },
    },
    ranges: {
      MMI: { shape: [2, 3], axisNames: ["y", "x"], values: [4, 5, 6, 7, 8, 9] },
    },
  };

  it("expands the compressed axes into real coordinates", () => {
    const cells = parseMmiCoverage(coverage);
    expect(cells).toHaveLength(6);
    expect(cells[0]).toEqual({ lon: -79, lat: 1, mmi: 4 });
    expect(cells[2]).toEqual({ lon: -77, lat: 1, mmi: 6 });
  });

  it("honours the declared axis order so the grid is not mirrored", () => {
    // Leer los valores en el orden equivocado asignaría la sacudida del Pacífico a los Llanos:
    // la malla saldría espejada y el error sería invisible en los totales.
    const cells = parseMmiCoverage(coverage);
    const strongest = cells.reduce((max, cell) => (cell.mmi > max.mmi ? cell : max));
    expect(strongest).toEqual({ lon: -77, lat: 2, mmi: 9 });
  });

  it("skips cells with no value instead of turning them into zeros", () => {
    // Un hueco de la malla es ausencia de dato, no ausencia de sacudida.
    const cells = parseMmiCoverage({
      ...coverage,
      ranges: { MMI: { axisNames: ["y", "x"], values: [4, null, 6, null, 8, 9] } },
    });
    expect(cells).toHaveLength(4);
    expect(cells.every((cell) => cell.mmi > 0)).toBe(true);
  });

  it("returns nothing when the payload is not a grid", () => {
    expect(parseMmiCoverage({})).toEqual([]);
    expect(parseMmiCoverage({ domain: { axes: {} }, ranges: {} })).toEqual([]);
  });
});

describe("mmiLabel", () => {
  it("uses the Mercalli wording for each degree", () => {
    expect(mmiLabel(3.4)).toBe("Débil");
    expect(mmiLabel(5.0)).toBe("Moderado");
    expect(mmiLabel(6.6)).toBe("Muy fuerte");
    expect(mmiLabel(7.8)).toBe("Severo");
    expect(mmiLabel(11)).toBe("Extremo");
  });
});
