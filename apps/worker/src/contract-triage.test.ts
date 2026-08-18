import { describe, expect, it } from "vitest";
import { buildContractText } from "./contract-triage.js";

const base = {
  externalId: "CO1.PCCNTR.9798979",
  entityName: "SECRETARIA DE EDUCACION DE CALI",
  object: "Remoción de escombros en la comuna 18",
  modality: "Contratación directa por urgencia manifiesta",
  contractType: "Obra",
  signedAt: "2026-08-13T00:00:00.000Z",
  totalValue: 2_756_911_880,
};

describe("buildContractText", () => {
  // El proyecto no manda datos personales de terceros a servicios externos, y una parte de los
  // contratos públicos los firman personas naturales. La prueba fija esa frontera: si alguien
  // agrega el proveedor al texto "porque da contexto", esto se cae.
  it("nunca incluye al proveedor, ni aunque venga en la entrada", () => {
    const text = buildContractText({
      ...base,
      // @ts-expect-error — se pasa a propósito un campo que el tipo no acepta.
      supplierName: "JUAN PÉREZ GÓMEZ",
    });
    expect(text).not.toContain("JUAN");
    expect(text).not.toContain("PÉREZ");
    expect(text).toContain("Remoción de escombros");
  });

  it("dice explícitamente cuándo un campo no se publicó", () => {
    const text = buildContractText({ ...base, object: null, modality: null });
    // Un objeto vacío y un objeto ausente llevan a lecturas distintas: sin esto, el modelo vería
    // "Objeto:" a secas y podría leerlo como un objeto en blanco en vez de como un dato que falta.
    expect(text).toContain("(sin objeto publicado)");
    expect(text).toContain("(no publicada)");
  });
});
