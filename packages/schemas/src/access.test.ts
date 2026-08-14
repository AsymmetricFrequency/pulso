import { describe, expect, it } from "vitest";
import { operationsSessionSchema, redeemOperationsInvitationSchema } from "./access.js";

describe("operations access schemas", () => {
  it("normalizes a one-time operations code", () => {
    expect(
      redeemOperationsInvitationSchema.parse({
        code: " 7KDM4PX9QH ",
        deviceId: "browser-device-01",
      }),
    ).toEqual({ code: "7KDM4PX9QH", deviceId: "browser-device-01" });
  });

  it("rejects a non-operational actor role", () => {
    const result = operationsSessionSchema.safeParse({
      sessionToken: "x".repeat(32),
      sessionExpiresAt: "2026-08-14T20:00:00-05:00",
      actor: {
        id: "0198b69a-1df0-7e4a-91ee-102c68bff301",
        incidentId: "0198b69a-1df0-7e4a-91ee-102c68bff302",
        displayName: "Persona de campo",
        role: "field_worker",
      },
      incident: {
        id: "0198b69a-1df0-7e4a-91ee-102c68bff302",
        code: "emergency-01",
        name: "Emergencia de prueba",
      },
    });
    expect(result.success).toBe(false);
  });
});
