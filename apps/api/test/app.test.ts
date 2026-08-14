import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("incident API", () => {
  it("reports service health", async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "pulso-api" });
  });

  it("creates and lists an incident", async () => {
    const app = await buildApp();
    apps.push(app);
    const payload = {
      code: "colombia-2026",
      name: "Respuesta Colombia 2026",
      disasterType: "earthquake",
      countryCode: "CO",
      timezone: "America/Bogota",
      startedAt: "2026-08-10T07:34:00-05:00",
    };

    const created = await app.inject({
      method: "POST",
      url: "/v1/incidents",
      payload,
    });
    const listed = await app.inject({ method: "GET", url: "/v1/incidents" });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ code: payload.code, status: "active" });
    expect(listed.json()).toHaveLength(1);
  });

  it("rejects a duplicate incident code", async () => {
    const app = await buildApp();
    apps.push(app);
    const payload = {
      code: "colombia-2026",
      name: "Respuesta Colombia 2026",
      disasterType: "earthquake",
      countryCode: "CO",
      timezone: "America/Bogota",
      startedAt: "2026-08-10T07:34:00-05:00",
    };

    await app.inject({ method: "POST", url: "/v1/incidents", payload });
    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/incidents",
      payload,
    });

    expect(duplicate.statusCode).toBe(409);
  });
});
