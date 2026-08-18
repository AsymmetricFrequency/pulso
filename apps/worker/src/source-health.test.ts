import { describe, expect, it } from "vitest";
import { healthChangeMessage } from "./source-health.js";

describe("healthChangeMessage", () => {
  it("says what broke and what it costs", () => {
    const message = healthChangeMessage(
      {
        kind: "cayo",
        sourceId: "cali-official-earthquake-repository",
        error: "Official source returned HTTP 403",
        httpStatus: 403,
      },
      "Repositorio oficial de Cali",
    );
    expect(message).toContain("dejó de responder");
    expect(message).toContain("HTTP 403");
    // Lo que importa no es que una petición fallara, sino que el mapa se queda viejo por ese lado.
    expect(message).toContain("se retiran solos a las 24 horas");
  });

  it("falls back to the error text when there is no status code", () => {
    const message = healthChangeMessage(
      { kind: "cayo", sourceId: "x", error: "feed has no 'registros' array", httpStatus: null },
      "contemos",
    );
    expect(message).toContain("feed has no 'registros' array");
  });

  // Que una fuente vuelva es tan accionable como que se caiga: dice que se puede dejar de buscarle
  // un sustituto.
  it("also announces the recovery, with how much it brought", () => {
    const message = healthChangeMessage(
      { kind: "volvio", sourceId: "x", recordsSeen: 1906 },
      "contemos",
    );
    expect(message).toContain("volvió a responder");
    expect(message).toContain("1.906");
  });
});
