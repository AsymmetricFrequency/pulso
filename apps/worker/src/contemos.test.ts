import { describe, expect, it } from "vitest";
import { mapContemosRecord } from "./contemos.js";

const baseRecord = {
  id: "ctm-0001",
  clase: "necesidad",
  categoria: "agua",
  titulo: "Agua potable para 20 familias",
  items: "Bidones de 20L | Purificador",
  direccion: "Comuna 18",
  municipio: "Cali",
  departamento: "Valle del Cauca",
  urgencia: "alta",
  estado: "abierta",
  lat: 3.4,
  lng: -76.55,
} as Parameters<typeof mapContemosRecord>[0];

describe("mapContemosRecord", () => {
  it("maps a need with a known category", () => {
    const mapped = mapContemosRecord(baseRecord);
    expect(mapped?.reportType).toBe("necesidad");
    expect(mapped?.category).toBe("agua");
    expect(mapped?.location.coordinates).toEqual([-76.55, 3.4]);
  });

  // `otro` es una categoría real de community_reports y contemos la usa: faltaba en el mapa
  // de categorías, así que 166 necesidades reales se caían por su propia categoría válida.
  it("keeps needs whose category is 'otro'", () => {
    const mapped = mapContemosRecord({ ...baseRecord, categoria: "otro" });
    expect(mapped?.category).toBe("otro");
  });

  it("still drops needs with a category Pulso does not know", () => {
    expect(mapContemosRecord({ ...baseRecord, categoria: "categoria_inventada" })).toBeUndefined();
  });

  // Los puntos de la diáspora (Chile, Perú, Venezuela) son legítimos en contemos, pero el mapa
  // de Pulso es territorio colombiano: se descartan a propósito, no por un fallo de mapeo.
  it("drops diaspora collection points outside Colombia", () => {
    expect(mapContemosRecord({ ...baseRecord, lat: -33.44, lng: -70.65 })).toBeUndefined();
  });
});
