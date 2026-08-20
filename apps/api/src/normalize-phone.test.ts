import { describe, expect, it } from "vitest";
import { normalizePhone } from "./postgres-household-registry-repository.js";

describe("normalizePhone", () => {
  // El caso que justifica la función: la misma familia escribiendo su número de dos formas. Si la
  // huella se calculara sobre el texto crudo, el emparejador no vería el duplicado más común.
  it("reduces the ways one Colombian mobile gets written to a single form", () => {
    for (const written of ["+57 300 123 4567", "300 123 4567", "0057-3001234567", "3001234567"]) {
      expect(normalizePhone(written)).toBe("3001234567");
    }
  });

  // Recortar el indicativo a ciegas convertiría un número extranjero en uno que no existe, y dos
  // números distintos podrían acabar con la misma huella.
  it("leaves a foreign number alone instead of amputating its country code", () => {
    expect(normalizePhone("+34 612 345 678")).toBe("34612345678");
  });

  it("keeps a landline as it is", () => {
    expect(normalizePhone("(602) 555 4433")).toBe("6025554433");
  });
});
