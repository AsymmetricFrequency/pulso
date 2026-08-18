import { describe, expect, it } from "vitest";
import { normalizeNeeds, toNeedsList } from "./needs-list.js";

describe("toNeedsList", () => {
  it("splits, trims and drops empties", () => {
    expect(toNeedsList(" Agua | Pañales |  | Colchonetas ", "|")).toEqual([
      "Agua",
      "Pañales",
      "Colchonetas",
    ]);
  });

  it("returns undefined when there is nothing to list", () => {
    expect(toNeedsList("", "|")).toBeUndefined();
    expect(toNeedsList(null, "|")).toBeUndefined();
    expect(toNeedsList("   |  ", "|")).toBeUndefined();
  });

  // El caso que tumbó la lista pública: una persona escribió un párrafo largo sin separadores,
  // el elemento pasaba de 400 caracteres y `publicCommunityReportSchema` rechazaba la fila —
  // y con `.parse()` sobre el lote, la ruta entera dejaba de responder.
  it("caps an item at the length the schema accepts", () => {
    const [item] = toNeedsList("a".repeat(900), "|") ?? [];
    expect(item).toHaveLength(400);
    expect(item?.endsWith("…")).toBe(true);
  });

  it("caps the number of items", () => {
    expect(
      toNeedsList(Array.from({ length: 60 }, (_, i) => `item ${i}`).join("|"), "|"),
    ).toHaveLength(40);
  });
});

describe("normalizeNeeds", () => {
  it("applies the same limits to lists that arrive already split", () => {
    const items = normalizeNeeds(["Agua", null, "  ", "b".repeat(900)]);
    expect(items[0]).toBe("Agua");
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveLength(400);
  });
});
