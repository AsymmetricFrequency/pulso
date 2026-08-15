import { describe, expect, it } from "vitest";
import { mapRedCaliAyudaRecord, parseRedCaliAyudaFlightPayload } from "./redcaliayuda.js";

const baseRecord = {
  id: "cmsrj9iol00c0jwem6w0pr33m",
  codigo: "NEC-ME-35aamz5n",
  categoria: "EVACUACION",
  prioridad: "P1",
  descripcion: "Paraíso Cali",
  cantidad: "",
  personasAfectadas: 1,
  ninos: 0,
  adultosMayores: 0,
  zona: "Paraíso Cali",
  ciudad: "Cali",
  lat: 3.4317853,
  lng: -76.5065682,
  createdAt: "2026-08-13T13:07:39.093Z",
};

describe("mapRedCaliAyudaRecord", () => {
  it("maps a normal citizen-submitted need", () => {
    const mapped = mapRedCaliAyudaRecord(baseRecord);
    expect(mapped).toBeDefined();
    expect(mapped?.reportType).toBe("necesidad");
    expect(mapped?.category).toBe("otro");
    expect(mapped?.location.coordinates).toEqual([-76.5065682, 3.4317853]);
    expect(mapped?.externalKey).toBe(`necesidad:${baseRecord.id}`);
  });

  it("maps known category codes to Pulso's taxonomy", () => {
    expect(mapRedCaliAyudaRecord({ ...baseRecord, categoria: "ALIMENTOS" })?.category).toBe(
      "alimentos",
    );
    expect(mapRedCaliAyudaRecord({ ...baseRecord, categoria: "ATENCION_MEDICA" })?.category).toBe(
      "salud",
    );
  });

  it("drops points outside Colombia", () => {
    expect(mapRedCaliAyudaRecord({ ...baseRecord, lat: 10.5, lng: -66.9 })).toBeUndefined();
  });

  // Real snapshot observed a citizen typing a full name + two phone numbers directly into
  // free-text fields ("Se necesita Deylin Aponza Guaza 3174219573, 3183682587") — the source
  // has no structured name/phone columns, but free text can still leak PII, so any record
  // whose text contains a long digit run must be dropped entirely rather than partially
  // redacted (a name could remain even after stripping digits).
  it("drops records with a phone number embedded in free text", () => {
    const withPhone = {
      ...baseRecord,
      descripcion: "Se necesita Deylin Aponza Guaza 3174219573, 3183682587",
      cantidad: "Deylin Aponza Guaza 3174219573, 3183682587",
    };
    expect(mapRedCaliAyudaRecord(withPhone)).toBeUndefined();
  });

  it("drops records with a long digit run (e.g. a cédula) in the zona field", () => {
    expect(mapRedCaliAyudaRecord({ ...baseRecord, zona: "CC 1234567890" })).toBeUndefined();
  });

  it("keeps short numbers like street addresses", () => {
    const withAddress = { ...baseRecord, zona: "Cra 56 #14-32" };
    expect(mapRedCaliAyudaRecord(withAddress)).toBeDefined();
  });
});

describe("parseRedCaliAyudaFlightPayload", () => {
  it("extracts the necesidades array from an RSC flight payload line", () => {
    const payload = [
      '1:I[123,["chunk.js"],"default"]',
      `5:["$","div",null,{"necesidades":[${JSON.stringify(baseRecord)}]}]`,
    ].join("\n");
    const records = parseRedCaliAyudaFlightPayload(payload);
    expect(records).toHaveLength(1);
    expect(records[0]?.codigo).toBe(baseRecord.codigo);
  });

  it("returns an empty array when no necesidades data is present", () => {
    const payload = '1:I[123,["chunk.js"],"default"]\n2:"$Sreact.fragment"';
    expect(parseRedCaliAyudaFlightPayload(payload)).toEqual([]);
  });
});
