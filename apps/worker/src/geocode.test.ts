import { describe, expect, it } from "vitest";
import { extractStreet, normalizePlace } from "./geocode.js";

describe("extractStreet", () => {
  // Las fuentes escriben la dirección con todo dentro. Mandar esa cadena entera a Nominatim
  // devuelve cero resultados: 0 de 18 en la primera prueba, contra 20 de 22 al extraer la vía.
  it("pulls the road out of a descriptive address", () => {
    expect(extractStreet("Transversal 73A #82-61, barrio Minuto de Dios")).toBe(
      "Transversal 73A 82",
    );
    expect(
      extractStreet("Carrera 15 #31-110, barrio El Espinal, Centro Comercial San Lázaro"),
    ).toBe("Carrera 15 31");
    expect(extractStreet("Calle 73 con Carrera 7E, esquina, barrio El Bosque")).toBe("Calle 73 7E");
    expect(extractStreet("Cra. 47 con Calle 1A")).toBe("Cra. 47 1A");
  });

  it("returns null when there is no road to find", () => {
    expect(extractStreet("Centro Comercial El Tesoro")).toBeNull();
    expect(extractStreet("Casco urbano de Trujillo")).toBeNull();
    expect(extractStreet(null)).toBeNull();
  });
});

describe("normalizePlace", () => {
  // El guardarraíl compara el municipio que declaró la fuente con el que resolvió el geocodificador.
  // Sin normalizar, «Bogotá D.C.» contra «Bogotá» y «Cali» contra «Cali ciudad» se rechazarían
  // siendo correctos — pasó en la primera medición: 3 de 4 rechazos eran falsos.
  it("makes the same place compare equal across naming variants", () => {
    expect(normalizePlace("Bogotá D.C.")).toBe(normalizePlace("Bogotá"));
    expect(normalizePlace("Cali ciudad")).toContain(normalizePlace("Cali"));
    expect(normalizePlace("Alto Baudó (Pie de Pató)")).toBe(normalizePlace("Alto Baudó"));
    expect(normalizePlace("Quibdó")).toBe("quibdo");
  });

  // Y el par que obligó a comparar por igualdad y no por contención: «Medio Atrato» **contiene**
  // «Atrato», así que una comprobación por contención habría aceptado un punto a horas de camino
  // del municipio que declaró la fuente. Es el error real que se midió, no uno hipotético.
  it("keeps genuinely different municipalities apart", () => {
    expect(normalizePlace("Medio Atrato (Beté)")).not.toBe(normalizePlace("Atrato"));
    expect(normalizePlace("Medio Atrato (Beté)").includes(normalizePlace("Atrato"))).toBe(true);
  });
});
