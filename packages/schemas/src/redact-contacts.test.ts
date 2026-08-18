import { describe, expect, it } from "vitest";
import { redactContacts } from "./redact-contacts.js";

/**
 * Los casos salen de registros reales que ya estaban en la base, no de ejemplos inventados: 43
 * descripciones importadas traían un móvil visible y se sirvieron por la API pública antes de que
 * nadie lo notara. Fijarlos aquí es lo que impide que vuelvan a entrar.
 */
describe("redactContacts", () => {
  it("tapa un móvil colombiano dentro de una frase", () => {
    const text =
      "Se hace necesario estufa, hay una persona que lo perdió todo. contacto 3147121140";
    const clean = redactContacts(text);

    expect(clean).not.toMatch(/3147121140/);
    // Lo demás se conserva: que necesitan una estufa es información real y útil.
    expect(clean).toContain("Se hace necesario estufa");
  });

  it("tapa números escritos con separadores", () => {
    for (const raw of ["300 123 4567", "300-123-4567", "300.123.4567"]) {
      expect(redactContacts(`Llamar al ${raw}`)).not.toMatch(/\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/);
    }
  });

  it("tapa un fijo cuando va anunciado como contacto", () => {
    expect(redactContacts("Teléfono: 6024851234")).not.toMatch(/6024851234/);
  });

  /**
   * El caso que separa esto de enmascarar todo número largo. Una cifra de dinero o una cantidad no
   * es un dato personal, y perderla no gana privacidad: destruye información que sirve para decidir.
   */
  it("no toca cifras de dinero ni cantidades", () => {
    const text = "Se necesitan 1500 litros de agua. Presupuesto estimado 2500000 pesos.";

    expect(redactContacts(text)).toBe(text);
  });

  it("devuelve null cuando no hay texto", () => {
    expect(redactContacts(null)).toBeNull();
    expect(redactContacts(undefined)).toBeNull();
  });
});
