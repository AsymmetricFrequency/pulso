import { describe, expect, it } from "vitest";
import {
  mapAcopioArticle,
  parseAcopioFlightPayload,
  parseAcopioShareText,
} from "./redcaliayuda-acopio.js";

const REAL_SHARE_TEXT =
  "Punto de acopio Collab x Mindo:\n" +
  "📦 [ME] Casa de acopio para buenaventura\n" +
  "📍 Cra 36#26-30, Cali\n" +
  "🕐 24 horas\n" +
  "✅ Necesitan: Agua, Tapabocas, Linternas, Botiquín, Pañales, Colchonetas\n" +
  "🗺️ https://www.google.com/maps?q=3.4210944,-76.5197981\n\n" +
  "Mas info: https://redcaliayuda.vercel.app/acopio";

function shareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

describe("parseAcopioShareText", () => {
  it("parses name, address, hours, needs, and coordinates from a real share text", () => {
    const parsed = parseAcopioShareText(REAL_SHARE_TEXT);
    expect(parsed).toEqual({
      name: "[ME] Casa de acopio para buenaventura",
      address: "Cra 36#26-30, Cali",
      hours: "24 horas",
      needs: ["Agua", "Tapabocas", "Linternas", "Botiquín", "Pañales", "Colchonetas"],
      lat: 3.4210944,
      lng: -76.5197981,
    });
  });

  it("returns undefined when the map coordinates are missing", () => {
    const withoutCoords = REAL_SHARE_TEXT.replace(/🗺️.*\n/, "");
    expect(parseAcopioShareText(withoutCoords)).toBeUndefined();
  });

  // This is the actual failure mode this ingestion exists to defend against: the source's
  // "Responsable" field (a real name + phone number, glued together with no separator) is
  // rendered in the page markup but — verified across every point on the live site — never
  // appears in the wa.me share text this module reads. This guard exists in case that ever
  // changes, e.g. via a template update on their end.
  it("drops the record if the share text ever contains a long digit run outside the coordinates", () => {
    const withLeakedPhone = REAL_SHARE_TEXT.replace(
      "📍 Cra 36#26-30, Cali",
      "📍 Cra 36#26-30, Cali — Responsable: Luis Fernando Garzón 3168617288",
    );
    expect(parseAcopioShareText(withLeakedPhone)).toBeUndefined();
  });

  it("keeps short numbers like street addresses", () => {
    const parsed = parseAcopioShareText(REAL_SHARE_TEXT);
    expect(parsed?.address).toContain("36#26-30");
  });
});

describe("mapAcopioArticle", () => {
  it("maps a real article into a PMU-type community report", () => {
    const mapped = mapAcopioArticle("cmsukp4s8009604jomjllvrhh", shareHref(REAL_SHARE_TEXT));
    expect(mapped).toBeDefined();
    expect(mapped?.reportType).toBe("pmu");
    expect(mapped?.title).toBe("Casa de acopio para buenaventura");
    expect(mapped?.location.coordinates).toEqual([-76.5197981, 3.4210944]);
    expect(mapped?.externalKey).toBe("acopio:cmsukp4s8009604jomjllvrhh");
    expect(mapped?.metadata.needs).toContain("Agua");
  });

  it("never includes a name or phone in the mapped output, even if leaked upstream", () => {
    const withLeakedPhone = REAL_SHARE_TEXT.replace(
      "📍 Cra 36#26-30, Cali",
      "📍 Cra 36#26-30, Cali — Responsable: Luis Fernando Garzón 3168617288",
    );
    expect(mapAcopioArticle("key1", shareHref(withLeakedPhone))).toBeUndefined();
  });

  it("drops points outside Colombia", () => {
    const outsideColombia = REAL_SHARE_TEXT.replace(
      "https://www.google.com/maps?q=3.4210944,-76.5197981",
      "https://www.google.com/maps?q=10.5,-66.9",
    );
    expect(mapAcopioArticle("key1", shareHref(outsideColombia))).toBeUndefined();
  });
});

describe("parseAcopioFlightPayload", () => {
  it("pairs article keys with their wa.me share link in document order", () => {
    const href = shareHref(REAL_SHARE_TEXT);
    const body = [
      `16:["$","article","keyone1",{"children":["$","a",null,{"href":"${href}"}]}]`,
      `17:["$","article","keytwo2",{"children":["$","a",null,{"href":"${href}"}]}]`,
    ].join("\n");
    const pairs = parseAcopioFlightPayload(body);
    expect(pairs).toEqual([
      { key: "keyone1", href },
      { key: "keytwo2", href },
    ]);
  });

  it("returns an empty array when article and link counts don't match, rather than guessing pairs", () => {
    const href = shareHref(REAL_SHARE_TEXT);
    const body = [
      `16:["$","article","keyone1",{"children":["$","a",null,{"href":"${href}"}]}]`,
      '17:["$","article","keytwo2",{"children":[]}]',
    ].join("\n");
    expect(parseAcopioFlightPayload(body)).toEqual([]);
  });
});
