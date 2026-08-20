import { describe, expect, it } from "vitest";
import { duplicateCandidateSchema, resolveDuplicateSchema } from "./duplicate-tray.js";

const side = {
  registrationId: "6f0c1a54-8e2b-4d31-9a77-1f3b0c2d4e51",
  publicCode: "ABCD-2345",
  neighborhood: "Siloé",
  territoryName: "CALI",
  peopleCount: 4,
  dwellingStatus: "inhabitable",
  shelteringAt: "familiares",
  officiallyCensused: "no",
  hasContact: true,
  createdAt: "2026-08-14T12:00:00Z",
};

describe("resolveDuplicateSchema", () => {
  // Confirmar sin decir cuál se queda dejaría la decisión a medias: alguien dijo que son el mismo
  // hogar y nadie dijo a qué puerta va la brigada.
  it("rejects a confirmation that does not say which registration stays", () => {
    const result = resolveDuplicateSchema.safeParse({
      decision: "confirmado",
      rationale: "Llamamos y es la misma familia.",
    });
    expect(result.success).toBe(false);
  });

  // Y descartar eligiendo uno es contradictorio: si no son el mismo hogar, no hay nada que
  // conservar en lugar de nada.
  it("rejects a dismissal that picks a survivor", () => {
    const result = resolveDuplicateSchema.safeParse({
      decision: "descartado",
      keepRegistrationId: side.registrationId,
      rationale: "Son dos familias distintas del mismo edificio.",
    });
    expect(result.success).toBe(false);
  });

  // El mínimo del motivo es el mismo que el de una auditoría, y por la misma razón: «ok» no se
  // puede revisar seis meses después.
  it("rejects a decision without a real reason", () => {
    expect(
      resolveDuplicateSchema.safeParse({ decision: "descartado", rationale: "ok" }).success,
    ).toBe(false);
  });

  it("accepts a signed confirmation", () => {
    const result = resolveDuplicateSchema.safeParse({
      decision: "confirmado",
      keepRegistrationId: side.registrationId,
      rationale: "El segundo trae la foto y el teléfono que sí contesta.",
    });
    expect(result.success).toBe(true);
  });
});

describe("duplicateCandidateSchema", () => {
  const candidate = {
    id: "1b7f6b8e-5a2c-4c6f-9d1a-8e3f2c1b0a99",
    signals: ["telefono"],
    strength: "fuerte",
    status: "propuesto",
    createdAt: "2026-08-20T09:00:00Z",
    resolvedAt: null,
    rationale: null,
    keepRegistrationId: null,
    a: side,
    b: { ...side, registrationId: "8d1f3a22-4b5c-4d6e-8f90-1a2b3c4d5e6f", publicCode: "EFGH-6789" },
  };

  it("carries the signal that matched the pair", () => {
    expect(duplicateCandidateSchema.parse(candidate).signals).toEqual(["telefono"]);
  });

  // Un par sin señal no es revisable: quien decide estaría aceptando la palabra de una consulta.
  it("refuses a pair with no signal at all", () => {
    expect(duplicateCandidateSchema.safeParse({ ...candidate, signals: [] }).success).toBe(false);
  });

  // La bandeja no lleva nombre ni teléfono, y el esquema es donde eso se sostiene: si mañana
  // alguien añade el campo al repositorio, este test no lo ve — pero el esquema lo descarta al
  // serializar, que es lo que impide que salga por la ruta.
  it("does not carry a contact name or phone", () => {
    const parsed = duplicateCandidateSchema.parse({
      ...candidate,
      a: { ...side, contactName: "María González", contactPhone: "3001234567" },
    });
    expect(parsed.a).not.toHaveProperty("contactName");
    expect(parsed.a).not.toHaveProperty("contactPhone");
  });
});
