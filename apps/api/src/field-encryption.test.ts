import { describe, expect, it } from "vitest";
import { decryptField, encryptField, maskDisplayName } from "./field-encryption.js";

describe("field encryption", () => {
  it("round-trips a plaintext value", () => {
    const secret = "test-secret-2026";
    const encrypted = encryptField(secret, "María González");
    expect(decryptField(secret, encrypted)).toBe("María González");
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const secret = "test-secret-2026";
    const a = encryptField(secret, "3001234567");
    const b = encryptField(secret, "3001234567");
    expect(a.equals(b)).toBe(false);
  });

  it("fails to decrypt with the wrong secret", () => {
    const encrypted = encryptField("secret-a", "3001234567");
    expect(() => decryptField("secret-b", encrypted)).toThrow();
  });
});

describe("maskDisplayName", () => {
  it("masks all but the first name and initials", () => {
    expect(maskDisplayName("María González")).toMatch(/^María G\*+$/);
    const juanPablo = maskDisplayName("Juan Pablo Restrepo");
    expect(juanPablo).toMatch(/^Juan P\*+ R\*+$/);
    expect(juanPablo).not.toContain("Pablo");
    expect(juanPablo).not.toContain("Restrepo");
  });

  it("leaves a single-word name unmasked", () => {
    expect(maskDisplayName("Camila")).toBe("Camila");
  });

  it("handles empty input", () => {
    expect(maskDisplayName("   ")).toBe("");
  });
});
