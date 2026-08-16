import { describe, expect, it } from "vitest";
import { assessEmergencyRelevance, mapSecopContract, supplierFingerprint } from "./secop.js";

// Fila real de SECOP II, recortada a los campos que el adaptador pide.
const professionalServicesRow = {
  id_contrato: "CO1.PCCNTR.9810910",
  referencia_del_contrato: "4143.010.26.1.1677.2026",
  nombre_entidad: "SECRETARIA DE EDUCACION DE CALI",
  nit_entidad: "890399011",
  orden: "Territorial",
  sector: "Educación Nacional",
  proveedor_adjudicado: "VALENTINA RENGIFO ARANGO",
  documento_proveedor: "1144106301",
  tipodocproveedor: "Cédula de Ciudadanía",
  objeto_del_contrato:
    "Prestación de servicios profesionales a favor de la Secretaría de Educación del Distrito",
  tipo_de_contrato: "Prestación de servicios",
  modalidad_de_contratacion: "Contratación directa",
  estado_contrato: "Aprobado",
  fecha_de_firma: "2026-08-14T00:00:00.000",
  valor_del_contrato: "19220000",
  valor_facturado: "0",
  valor_pagado: "0",
  departamento: "Valle del Cauca",
  ciudad: "Cali",
  proceso_de_compra: "CO1.BDOS.10669679",
  urlproceso: { url: "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index" },
};

describe("assessEmergencyRelevance", () => {
  it("does not treat ordinary municipal business as emergency spending", () => {
    // Es el caso mayoritario y el que hace toda la diferencia: 357 contratos firmados en Cali
    // después del sismo, y casi todos son la operación normal del municipio. Sumarlos como
    // "recursos de la emergencia" inventaría una relación que los datos no sostienen.
    const assessment = assessEmergencyRelevance({
      object: "Prestación de servicios profesionales en la Subdirección de Desarrollo Integral",
      modality: "Contratación directa",
    });
    expect(assessment.relevance).toBe("unreviewed");
    expect(assessment.signals.emergencyTerms).toEqual([]);
  });

  it("never confirms on its own, however many signals it finds", () => {
    // Confirmar es un acto humano. Ni dos términos del desastre ni la urgencia manifiesta bastan
    // para que una máquina declare que un contrato es de la emergencia.
    const assessment = assessEmergencyRelevance({
      object: "Remoción de escombros y demolición de estructuras afectadas por el sismo",
      modality: "Contratación directa",
      justification: "Urgencia manifiesta declarada mediante decreto",
    });
    expect(assessment.relevance).toBe("probable");
    expect(assessment.signals.strength).toBe("strong");
  });

  it("ranks a single ambiguous term below a clear one", () => {
    // El caso real que obligó a este diseño: "albergue y clínica acompañando los procesos de
    // adopción de animales" fue el único candidato de 357 contratos, y era un albergue de
    // animales. La fuerza ordena la cola de revisión; no decide.
    const animalShelter = assessEmergencyRelevance({
      object: "Servicios de apoyo en el área de albergue y clínica para adopción de animales",
      modality: "Contratación directa",
    });
    expect(animalShelter.relevance).toBe("probable");
    expect(animalShelter.signals.strength).toBe("weak");
  });

  it("promotes supporting terms only when urgency was declared", () => {
    const withoutUrgency = assessEmergencyRelevance({
      object: "Suministro de kits de mercado",
      modality: "Selección abreviada",
    });
    expect(withoutUrgency.relevance).toBe("unreviewed");

    const withUrgency = assessEmergencyRelevance({
      object: "Suministro de kits de mercado",
      modality: "Contratación directa",
      justification: "urgencia manifiesta",
    });
    expect(withUrgency.relevance).toBe("probable");
  });

  it("never concludes a contract is unrelated on its own", () => {
    // Descartar es una afirmación y le corresponde a una persona: la ausencia de señales sólo
    // significa que el clasificador no encontró evidencia.
    const assessment = assessEmergencyRelevance({ object: "Compra de papelería" });
    expect(assessment.relevance).toBe("unreviewed");
  });
});

describe("mapSecopContract", () => {
  it("keeps the accountability fields of a real contract", () => {
    const contract = mapSecopContract(professionalServicesRow, "colombia-2026");
    expect(contract).toBeDefined();
    expect(contract?.externalId).toBe("CO1.PCCNTR.9810910");
    expect(contract?.entityNit).toBe("890399011");
    expect(contract?.supplierName).toBe("VALENTINA RENGIFO ARANGO");
    expect(contract?.totalValue).toBe(19_220_000);
    expect(contract?.entityOrder).toBe("municipal");
    expect(contract?.sourceUrl).toContain("secop.gov.co");
  });

  it("never stores the national ID of an individual supplier", () => {
    // SECOP publica la cédula; que sea pública no obliga a Pulso a replicarla. La huella conserva
    // la capacidad de cruzar al mismo proveedor entre contratos sin guardar el número.
    const contract = mapSecopContract(professionalServicesRow, "colombia-2026");
    expect(contract?.supplierDocument).toBeNull();
    expect(contract?.supplierFingerprint).toBe(supplierFingerprint("1144106301", "colombia-2026"));
    expect(JSON.stringify(contract)).not.toContain("1144106301");
  });

  it("keeps the document when the supplier is a legal entity", () => {
    const contract = mapSecopContract(
      {
        ...professionalServicesRow,
        proveedor_adjudicado: "CONSTRUCTORA DEL VALLE S.A.S.",
        documento_proveedor: "900123456",
        tipodocproveedor: "NIT",
      },
      "colombia-2026",
    );
    expect(contract?.supplierDocument).toBe("900123456");
  });

  it("salts the supplier fingerprint per incident", () => {
    expect(supplierFingerprint("900123456", "colombia-2026")).not.toBe(
      supplierFingerprint("900123456", "otra-emergencia"),
    );
  });

  it("drops rows without a stable identifier or a counterparty", () => {
    expect(
      mapSecopContract({ ...professionalServicesRow, id_contrato: null }, "x"),
    ).toBeUndefined();
    expect(mapSecopContract({ ...professionalServicesRow, nit_entidad: "" }, "x")).toBeUndefined();
    expect(
      mapSecopContract({ ...professionalServicesRow, proveedor_adjudicado: null }, "x"),
    ).toBeUndefined();
  });

  it("treats malformed amounts as zero instead of NaN", () => {
    const contract = mapSecopContract(
      { ...professionalServicesRow, valor_del_contrato: "no aplica", valor_pagado: "-5" },
      "colombia-2026",
    );
    expect(contract?.totalValue).toBe(0);
    expect(contract?.paidValue).toBe(0);
  });
});
