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

describe("territory and coverage API", () => {
  it("imports territory, creates a zone, and records its coverage history", async () => {
    const app = await buildApp();
    apps.push(app);
    const incidentResponse = await app.inject({
      method: "POST",
      url: "/v1/incidents",
      payload: {
        code: "colombia-territorio",
        name: "Operación territorial Colombia",
        disasterType: "earthquake",
        countryCode: "CO",
        timezone: "America/Bogota",
        startedAt: "2026-08-10T07:34:00-05:00",
      },
    });
    const incidentId = incidentResponse.json().id as string;
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [-76.7, 5.7],
          [-76.6, 5.7],
          [-76.6, 5.8],
          [-76.7, 5.7],
        ],
      ],
    };

    const imported = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/territories/import`,
      payload: {
        source: "dane_departments",
        territoryType: "department",
        codeProperty: "dpto_ccdgo",
        nameProperty: "dpto_cnmbre",
        featureCollection: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { dpto_ccdgo: "27", dpto_cnmbre: "CHOCÓ" },
              geometry,
            },
          ],
        },
      },
    });
    expect(imported.statusCode).toBe(201);
    expect(imported.json()).toMatchObject({ imported: 1, skipped: 0 });

    const territories = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/territories`,
    });
    expect(territories.json()).toHaveLength(1);
    const territoryId = territories.json()[0].id as string;

    const createdZone = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/operational-zones`,
      payload: { name: "Zona Chocó 01", territoryId, geometry, priority: 5 },
    });
    expect(createdZone.statusCode).toBe(201);
    expect(createdZone.json()).toMatchObject({ coverageStatus: "unknown", revision: 1 });
    const zoneId = createdZone.json().id as string;

    const event = await app.inject({
      method: "POST",
      url: `/v1/operational-zones/${zoneId}/coverage-events`,
      payload: {
        status: "visited",
        occurredAt: "2026-08-13T11:00:00-05:00",
        notes: "Brigada confirmó acceso y completó evaluación rápida.",
      },
    });
    expect(event.statusCode).toBe(201);
    expect(event.json()).toMatchObject({ incidentId, zoneId, status: "visited" });

    const coverage = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/coverage`,
    });
    expect(coverage.json()[0]).toMatchObject({ coverageStatus: "visited", revision: 2 });

    const history = await app.inject({
      method: "GET",
      url: `/v1/operational-zones/${zoneId}/coverage-events`,
    });
    expect(history.json()).toHaveLength(1);
  });
});
