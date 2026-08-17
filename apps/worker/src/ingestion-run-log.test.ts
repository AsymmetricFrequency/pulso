import { describe, expect, it } from "vitest";
import {
  httpStatusFromError,
  outcomeFromResult,
  recordsSeenFromResult,
  retireUnseenPoints,
} from "./ingestion-run-log.js";

describe("recordsSeenFromResult", () => {
  it("reads whichever count each source happens to publish", () => {
    expect(recordsSeenFromResult({ status: "stored", seen: 123, mapped: 122 })).toBe(123);
    expect(recordsSeenFromResult({ status: "unchanged", count: 0 })).toBe(0);
    expect(recordsSeenFromResult({ status: "stored", upserted: 181 })).toBe(181);
  });

  it("prefers what the source saw over what it managed to store", () => {
    // Un recorte entre lo visto y lo guardado es justamente la señal interesante —filtro de PII,
    // registros descartados—, así que la corrida anota lo que llegó de la fuente.
    expect(recordsSeenFromResult({ seen: 200, upserted: 181 })).toBe(200);
  });

  it("falls back to zero for shapes it does not recognise", () => {
    expect(recordsSeenFromResult(undefined)).toBe(0);
    expect(recordsSeenFromResult(null)).toBe(0);
    expect(recordsSeenFromResult("stored")).toBe(0);
    expect(recordsSeenFromResult({ status: "stored" })).toBe(0);
    expect(recordsSeenFromResult({ seen: Number.NaN })).toBe(0);
  });
});

describe("outcomeFromResult", () => {
  it("treats a 304 as its own outcome, not as a success nor a failure", () => {
    expect(outcomeFromResult({ status: "unchanged", count: 0 })).toBe("unchanged");
  });

  it("counts anything else that returned normally as a success", () => {
    expect(outcomeFromResult({ status: "stored", seen: 5 })).toBe("succeeded");
    expect(outcomeFromResult({ status: "preview" })).toBe("succeeded");
    expect(outcomeFromResult(undefined)).toBe("succeeded");
  });
});

describe("httpStatusFromError", () => {
  it("recovers the status code each source embeds in its own error text", () => {
    // Este es el caso que motivó todo: veinte corridas de Cali con 403 y ninguna consulta que
    // lo mostrara.
    expect(httpStatusFromError(new Error("Official source returned HTTP 403"))).toBe(403);
    expect(httpStatusFromError(new Error("contemos feed returned HTTP 404"))).toBe(404);
    expect(httpStatusFromError(new Error("Gravitas feed returned HTTP 500"))).toBe(500);
  });

  it("returns null when the failure was not an HTTP status", () => {
    expect(httpStatusFromError(new Error("Gravitas feed has no 'features' array"))).toBeNull();
    expect(httpStatusFromError(new Error("HTTP 40"))).toBeNull();
    expect(httpStatusFromError("timeout")).toBeNull();
  });
});

describe("retireUnseenPoints", () => {
  // El periodo de gracia es la pieza que hace segura toda la retirada: sin él, una corrida que
  // falla a medias vacía el mapa. Con 24 horas hacen falta muchas corridas malas seguidas.
  it("asks for points older than the grace period, and never touches a judged one", async () => {
    const consultas: string[] = [];
    const sql = ((strings: TemplateStringsArray) => {
      consultas.push(strings.join("?"));
      return Promise.resolve([{ id: "a" }, { id: "b" }]);
    }) as unknown as Parameters<typeof retireUnseenPoints>[0];

    expect(await retireUnseenPoints(sql, "contemos-mapa-situacion")).toBe(2);

    const sql_ = consultas.join(" ");
    expect(sql_).toContain("status = 'superseded'");
    expect(sql_).toContain("NOT IN ('rejected', 'superseded')");
    expect(sql_).toContain("interval");
    // No se borra nada: el punto se queda en la base con su historial.
    expect(sql_).not.toContain("DELETE");
  });
});
