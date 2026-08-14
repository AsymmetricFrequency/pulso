import { describe, expect, it } from "vitest";
import { createFieldEvidenceSchema } from "./evidence.js";

describe("createFieldEvidenceSchema", () => {
  it("accepts bounded image evidence", () => {
    const result = createFieldEvidenceSchema.safeParse({
      clientMutationId: "0198a03d-c08f-7e4a-91ee-102c68bff301",
      assessmentClientMutationId: "0198a03d-c08f-7e4a-91ee-102c68bff201",
      fileName: "evidencia.jpg",
      contentType: "image/jpeg",
      byteSize: 4,
      sha256: "a".repeat(64),
      capturedAt: "2026-08-14T09:20:00-05:00",
      dataBase64: "/9j/2Q==",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unsupported content types", () => {
    const result = createFieldEvidenceSchema.safeParse({
      clientMutationId: "0198a03d-c08f-7e4a-91ee-102c68bff301",
      assessmentClientMutationId: "0198a03d-c08f-7e4a-91ee-102c68bff201",
      fileName: "evidencia.svg",
      contentType: "image/svg+xml",
      byteSize: 20,
      sha256: "a".repeat(64),
      capturedAt: "2026-08-14T09:20:00-05:00",
      dataBase64: "PHN2Zz48L3N2Zz4=",
    });
    expect(result.success).toBe(false);
  });
});
