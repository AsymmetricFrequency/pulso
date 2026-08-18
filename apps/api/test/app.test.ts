import { createHash } from "node:crypto";
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

describe("public situation report API", () => {
  it("publishes a cacheable, privacy-safe demo snapshot", async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/public/incidents/colombia-2026/report",
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("stale-while-revalidate");
    expect(response.headers["x-pulso-data-mode"]).toBe("demo");
    expect(body).toMatchObject({
      schemaVersion: 1,
      incident: { code: "colombia-2026", dataMode: "demo" },
      integrity: { status: "pending", network: "none" },
    });
    expect(JSON.stringify(body)).not.toMatch(/phone|email|documentNumber|latitude|longitude/i);
  });

  it("returns 404 for an unpublished incident", async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/public/incidents/not-published/report",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "public_report_not_found" });
  });
});

describe("Cali official public source API", () => {
  it("exposes a fixed, privacy-safe projection", async () => {
    const app = await buildApp({
      caliPublicSourceRepository: {
        async findSnapshot() {
          return {
            source: {
              id: "cali-official-earthquake-repository",
              name: "Repositorio oficial de Cali",
              url: "https://www.cali.gov.co/",
              authority: "official",
            },
            fetchedAt: "2026-08-14T21:26:07.133Z",
            metrics: [
              {
                key: "injured",
                value: 1410,
                label: "Personas lesionadas",
                sourceUpdatedLabel: "Última actualización: 14 de agosto",
              },
            ],
            servicePoints: [],
          };
        },
      },
    });
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/v1/public/sources/cali-official-earthquake-repository/snapshot",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("stale-while-revalidate");
    expect(response.json()).toMatchObject({ source: { authority: "official" } });
    expect(JSON.stringify(response.json())).not.toMatch(/phone|document|displayName/i);
  });
});

describe("SGC official public source API", () => {
  it("exposes only the fixed public seismic projection", async () => {
    const app = await buildApp({
      sgcPublicSourceRepository: {
        async findSnapshot() {
          return {
            source: {
              id: "sgc-realtime-earthquakes",
              name: "Servicio Geológico Colombiano",
              url: "https://archive.sgc.gov.co/feed/v1.0.1/summary/five_days_all.json",
              authority: "official",
            },
            fetchedAt: "2026-08-14T21:26:07.133Z",
            events: [
              {
                id: "SGC2026abcd",
                magnitude: 3.2,
                magnitudeType: "ML",
                depthKm: 12.4,
                latitude: 3.45,
                longitude: -76.53,
                localTime: "2026-08-14 10:30:00",
                utcTime: "2026-08-14 15:30:00",
                updatedAt: "2026-08-14 10:31:00",
                place: "Cali - Valle del Cauca",
                status: "manual",
                agency: "SGC",
                closerTowns: "Cali",
                feltReports: 2,
                instrumentalIntensity: 1,
                communityIntensity: 1,
              },
            ],
          };
        },
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/public/sources/sgc-realtime-earthquakes/snapshot",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("stale-while-revalidate");
    expect(response.json()).toMatchObject({
      source: { authority: "official" },
      events: [{ agency: "SGC", longitude: -76.53, latitude: 3.45 }],
    });
    expect(JSON.stringify(response.json())).not.toMatch(/phone|email|documentNumber|displayName/i);
  });
});

describe("territory and coverage API", () => {
  it("publishes imported DANE departments as a stable GeoJSON projection", async () => {
    const app = await buildApp();
    apps.push(app);
    const incident = await app.inject({
      method: "POST",
      url: "/v1/incidents",
      payload: {
        code: "public-dane",
        name: "Territorio público DANE",
        disasterType: "earthquake",
        countryCode: "CO",
        timezone: "America/Bogota",
        startedAt: "2026-08-10T07:34:00-05:00",
      },
    });
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [-77, 3],
          [-76, 3],
          [-76, 4],
          [-77, 3],
        ],
      ],
    };
    await app.inject({
      method: "POST",
      url: `/v1/incidents/${incident.json().id}/territories/import`,
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
              properties: { dpto_ccdgo: "76", dpto_cnmbre: "VALLE DEL CAUCA" },
              geometry,
            },
          ],
        },
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/public/incidents/public-dane/territories?level=department",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("stale-while-revalidate");
    expect(response.json()).toMatchObject({
      type: "FeatureCollection",
      source: "DANE MGN 2023",
      features: [
        {
          id: "76",
          properties: { dpto_ccdgo: "76", dpto_cnmbre: "VALLE DEL CAUCA" },
        },
      ],
    });
  });

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

  it("creates an idempotent field visit and closes it into coverage", async () => {
    const app = await buildApp();
    apps.push(app);
    const incident = await app.inject({
      method: "POST",
      url: "/v1/incidents",
      payload: {
        code: "field-offline",
        name: "Prueba de brigada offline",
        disasterType: "flood",
        countryCode: "CO",
        timezone: "America/Bogota",
        startedAt: "2026-08-13T08:00:00-05:00",
      },
    });
    const incidentId = incident.json().id as string;
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
    const zone = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/operational-zones`,
      payload: { name: "Zona de visita 01", geometry, priority: 5 },
    });
    const zoneId = zone.json().id as string;
    const mutationId = "0198a03d-c08f-7e4a-91ee-102c68bff001";
    const visitPayload = {
      deviceId: "brigada-tablet-01",
      clientMutationId: mutationId,
      startedAt: "2026-08-13T09:00:00-05:00",
      accessNotes: "Ingreso por vía secundaria.",
    };

    const first = await app.inject({
      method: "POST",
      url: `/v1/operational-zones/${zoneId}/field-visits`,
      payload: visitPayload,
    });
    const retried = await app.inject({
      method: "POST",
      url: `/v1/operational-zones/${zoneId}/field-visits`,
      payload: visitPayload,
    });
    expect(first.statusCode).toBe(201);
    expect(retried.json().id).toBe(first.json().id);

    const completed = await app.inject({
      method: "POST",
      url: `/v1/field-visits/${first.json().id}/complete`,
      payload: {
        clientMutationId: "0198a03d-c08f-7e4a-91ee-102c68bff002",
        result: "partial",
        completedAt: "2026-08-13T10:15:00-05:00",
        track: {
          type: "LineString",
          coordinates: [
            [-76.7, 5.7],
            [-76.65, 5.75],
          ],
        },
        accessNotes: "Dos viviendas requieren nueva evaluación.",
      },
    });
    expect(completed.json()).toMatchObject({ status: "completed", result: "partial", revision: 2 });

    const visits = await app.inject({
      method: "GET",
      url: `/v1/operational-zones/${zoneId}/field-visits`,
    });
    expect(visits.json()).toHaveLength(1);
    const coverage = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/coverage`,
    });
    expect(coverage.json()[0]).toMatchObject({ coverageStatus: "partial", revision: 3 });
  });
});

describe("teams and field assignments API", () => {
  it("assigns a zone idempotently and only lets a team member accept it", async () => {
    const app = await buildApp();
    apps.push(app);
    const incident = await app.inject({
      method: "POST",
      url: "/v1/incidents",
      payload: {
        code: "mission-control",
        name: "Control de misiones de campo",
        disasterType: "landslide",
        countryCode: "CO",
        timezone: "America/Bogota",
        startedAt: "2026-08-13T07:00:00-05:00",
      },
    });
    const incidentId = incident.json().id as string;
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
    const zone = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/operational-zones`,
      payload: { name: "Zona misión 01", geometry, priority: 5 },
    });
    const organization = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/organizations`,
      payload: { name: "Brigadas Comunitarias", type: "volunteer_group", externalCode: "BC-01" },
    });
    const organizationId = organization.json().id as string;
    const leader = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/actors`,
      payload: { organizationId, displayName: "Líder de prueba", role: "field_worker" },
    });
    const outsider = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/actors`,
      payload: { organizationId, displayName: "Actor externo", role: "field_worker" },
    });
    const coordinator = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/actors`,
      payload: { organizationId, displayName: "Coordinadora de prueba", role: "coordinator" },
    });
    const team = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/teams`,
      payload: { organizationId, name: "Brigada Norte" },
    });
    const teamId = team.json().id as string;
    await app.inject({
      method: "POST",
      url: `/v1/teams/${teamId}/memberships`,
      payload: { actorId: leader.json().id, responsibility: "leader" },
    });

    const assignmentPayload = {
      zoneId: zone.json().id,
      teamId,
      objective: "Evaluar acceso y habitabilidad inicial.",
      startsAt: "2026-08-13T11:00:00-05:00",
      dueAt: "2026-08-13T17:00:00-05:00",
      clientMutationId: "0198a03d-c08f-7e4a-91ee-102c68bff101",
    };
    const assigned = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/assignments`,
      payload: assignmentPayload,
    });
    const retried = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/assignments`,
      payload: assignmentPayload,
    });
    expect(assigned.statusCode).toBe(201);
    expect(retried.json().id).toBe(assigned.json().id);

    const rejected = await app.inject({
      method: "POST",
      url: `/v1/assignments/${assigned.json().id}/accept`,
      payload: {
        actorId: outsider.json().id,
        occurredAt: "2026-08-13T10:55:00-05:00",
        clientMutationId: "0198a03d-c08f-7e4a-91ee-102c68bff102",
      },
    });
    expect(rejected.statusCode).toBe(409);

    const accepted = await app.inject({
      method: "POST",
      url: `/v1/assignments/${assigned.json().id}/accept`,
      payload: {
        actorId: leader.json().id,
        occurredAt: "2026-08-13T10:56:00-05:00",
        clientMutationId: "0198a03d-c08f-7e4a-91ee-102c68bff103",
      },
    });
    expect(accepted.json()).toMatchObject({
      status: "accepted",
      acceptedBy: leader.json().id,
      revision: 2,
    });

    const unauthorizedInvitation = await app.inject({
      method: "POST",
      url: `/v1/assignments/${assigned.json().id}/invitations`,
      payload: { actorId: leader.json().id, expiresInMinutes: 60 },
    });
    expect(unauthorizedInvitation.statusCode).toBe(401);

    const unauthorizedRole = await app.inject({
      method: "POST",
      url: `/v1/assignments/${assigned.json().id}/invitations`,
      headers: {
        "x-pulso-admin-key": "pulso-local-admin",
        "x-pulso-actor-id": outsider.json().id,
      },
      payload: { actorId: leader.json().id, expiresInMinutes: 60 },
    });
    expect(unauthorizedRole.statusCode).toBe(401);

    const invitation = await app.inject({
      method: "POST",
      url: `/v1/assignments/${assigned.json().id}/invitations`,
      headers: {
        "x-pulso-admin-key": "pulso-local-admin",
        "x-pulso-actor-id": coordinator.json().id,
      },
      payload: { actorId: leader.json().id, expiresInMinutes: 60 },
    });
    expect(invitation.statusCode).toBe(201);
    expect(invitation.json()).toMatchObject({
      assignmentId: assigned.json().id,
      actorId: leader.json().id,
    });
    expect(invitation.json().code).toHaveLength(10);
    expect(invitation.json().link).toContain(`/field?code=${invitation.json().code}`);

    const redeemed = await app.inject({
      method: "POST",
      url: "/v1/field-access/redeem",
      payload: { code: invitation.json().code, deviceId: "field-device-001" },
    });
    expect(redeemed.statusCode).toBe(201);
    expect(redeemed.json()).toMatchObject({
      passkeyRegistered: false,
      mission: {
        assignmentId: assigned.json().id,
        actorId: leader.json().id,
        teamName: "Brigada Norte",
        zoneReference: "Zona misión 01",
      },
    });
    expect(redeemed.json().sessionToken.length).toBeGreaterThanOrEqual(32);

    const assessmentPayload = {
      clientMutationId: "0198a03d-c08f-7e4a-91ee-102c68bff201",
      deviceId: "field-device-001",
      observedAt: "2026-08-13T12:15:00-05:00",
      damageTypes: ["housing", "utilities"],
      severity: "high",
      needTypes: ["shelter", "construction_materials"],
      urgency: "urgent",
      affectedHouseholds: 4,
      affectedPeople: 13,
      notes: "Cubiertas colapsadas y servicio eléctrico interrumpido.",
    };
    const unauthorizedAssessment = await app.inject({
      method: "POST",
      url: "/v1/field-assessments",
      payload: assessmentPayload,
    });
    expect(unauthorizedAssessment.statusCode).toBe(401);

    const recordedAssessment = await app.inject({
      method: "POST",
      url: "/v1/field-assessments",
      headers: { authorization: `Bearer ${redeemed.json().sessionToken}` },
      payload: assessmentPayload,
    });
    const retriedAssessment = await app.inject({
      method: "POST",
      url: "/v1/field-assessments",
      headers: { authorization: `Bearer ${redeemed.json().sessionToken}` },
      payload: assessmentPayload,
    });
    expect(recordedAssessment.statusCode).toBe(201);
    expect(recordedAssessment.json()).toMatchObject({
      actorId: leader.json().id,
      assignmentId: assigned.json().id,
      damageTypes: ["housing", "utilities"],
      urgency: "urgent",
      affectedPeople: 13,
    });
    expect(retriedAssessment.json().id).toBe(recordedAssessment.json().id);

    const assignmentAssessments = await app.inject({
      method: "GET",
      url: "/v1/field-assessments",
      headers: { authorization: `Bearer ${redeemed.json().sessionToken}` },
    });
    expect(assignmentAssessments.json()).toHaveLength(1);

    const unauthorizedSummary = await app.inject({
      method: "GET",
      url: "/v1/field-assessment-summary",
    });
    expect(unauthorizedSummary.statusCode).toBe(401);
    const missionSummary = await app.inject({
      method: "GET",
      url: "/v1/field-assessment-summary",
      headers: { authorization: `Bearer ${redeemed.json().sessionToken}` },
    });
    expect(missionSummary.json()).toMatchObject({
      totalAssessments: 1,
      affectedHouseholds: 4,
      affectedPeople: 13,
      severity: { high: 1 },
      urgency: { urgent: 1 },
      damages: [
        { type: "housing", count: 1 },
        { type: "utilities", count: 1 },
      ],
      needs: [
        { type: "shelter", count: 1 },
        { type: "construction_materials", count: 1 },
      ],
    });

    const unauthorizedOperationsInvitation = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/operations-access/invitations`,
      payload: { actorId: coordinator.json().id, expiresInMinutes: 30 },
    });
    expect(unauthorizedOperationsInvitation.statusCode).toBe(401);
    const invalidOperationsActor = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/operations-access/invitations`,
      headers: {
        "x-pulso-admin-key": "pulso-local-admin",
        "x-pulso-actor-id": coordinator.json().id,
      },
      payload: { actorId: outsider.json().id, expiresInMinutes: 30 },
    });
    expect(invalidOperationsActor.statusCode).toBe(409);
    const operationsInvitation = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/operations-access/invitations`,
      headers: {
        "x-pulso-admin-key": "pulso-local-admin",
        "x-pulso-actor-id": coordinator.json().id,
      },
      payload: { actorId: coordinator.json().id, expiresInMinutes: 30 },
    });
    expect(operationsInvitation.statusCode).toBe(201);
    const operationsSession = await app.inject({
      method: "POST",
      url: "/v1/operations-access/redeem",
      payload: { code: operationsInvitation.json().code, deviceId: "operations-browser-01" },
    });
    expect(operationsSession.statusCode).toBe(201);
    expect(operationsSession.json()).toMatchObject({
      actor: { id: coordinator.json().id, role: "coordinator" },
      incident: { id: incidentId, code: "mission-control" },
    });
    const reusedOperationsInvitation = await app.inject({
      method: "POST",
      url: "/v1/operations-access/redeem",
      payload: { code: operationsInvitation.json().code, deviceId: "operations-browser-02" },
    });
    expect(reusedOperationsInvitation.statusCode).toBe(401);
    const unauthorizedIncidentSummary = await app.inject({
      method: "GET",
      url: `/v1/operations/incidents/${incidentId}/assessment-summary`,
    });
    expect(unauthorizedIncidentSummary.statusCode).toBe(401);
    const incidentSummary = await app.inject({
      method: "GET",
      url: `/v1/operations/incidents/${incidentId}/assessment-summary`,
      headers: { authorization: `Bearer ${operationsSession.json().sessionToken}` },
    });
    expect(incidentSummary.statusCode).toBe(200);
    expect(incidentSummary.json()).toMatchObject({
      incidentId,
      totalAssessments: 1,
      affectedHouseholds: 4,
      affectedPeople: 13,
    });
    const otherIncident = await app.inject({
      method: "POST",
      url: "/v1/incidents",
      payload: {
        code: "other-incident",
        name: "Otra emergencia",
        disasterType: "flood",
        countryCode: "CO",
        timezone: "America/Bogota",
        startedAt: "2026-08-13T09:00:00-05:00",
      },
    });
    const crossIncidentSummary = await app.inject({
      method: "GET",
      url: `/v1/operations/incidents/${otherIncident.json().id}/assessment-summary`,
      headers: { authorization: `Bearer ${operationsSession.json().sessionToken}` },
    });
    expect(crossIncidentSummary.statusCode).toBe(401);

    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const evidencePayload = {
      clientMutationId: "0198a03d-c08f-7e4a-91ee-102c68bff301",
      assessmentClientMutationId: assessmentPayload.clientMutationId,
      fileName: "evidencia-campo.jpg",
      contentType: "image/jpeg",
      byteSize: jpegBytes.byteLength,
      sha256: createHash("sha256").update(jpegBytes).digest("hex"),
      capturedAt: "2026-08-13T12:20:00-05:00",
      dataBase64: jpegBytes.toString("base64"),
    };
    const storedEvidence = await app.inject({
      method: "POST",
      url: "/v1/field-evidence",
      headers: { authorization: `Bearer ${redeemed.json().sessionToken}` },
      payload: evidencePayload,
    });
    const retriedEvidence = await app.inject({
      method: "POST",
      url: "/v1/field-evidence",
      headers: { authorization: `Bearer ${redeemed.json().sessionToken}` },
      payload: evidencePayload,
    });
    expect(storedEvidence.statusCode).toBe(201);
    expect(storedEvidence.json()).toMatchObject({
      assessmentId: recordedAssessment.json().id,
      byteSize: 4,
      status: "stored",
    });
    expect(storedEvidence.body).not.toContain(evidencePayload.dataBase64);
    expect(retriedEvidence.json().id).toBe(storedEvidence.json().id);

    const corruptedEvidence = await app.inject({
      method: "POST",
      url: "/v1/field-evidence",
      headers: { authorization: `Bearer ${redeemed.json().sessionToken}` },
      payload: {
        ...evidencePayload,
        clientMutationId: "0198a03d-c08f-7e4a-91ee-102c68bff302",
        sha256: "0".repeat(64),
      },
    });
    expect(corruptedEvidence.statusCode).toBe(400);

    const assignmentEvidence = await app.inject({
      method: "GET",
      url: "/v1/field-evidence",
      headers: { authorization: `Bearer ${redeemed.json().sessionToken}` },
    });
    expect(assignmentEvidence.json()).toHaveLength(1);

    const reused = await app.inject({
      method: "POST",
      url: "/v1/field-access/redeem",
      payload: { code: invitation.json().code, deviceId: "field-device-002" },
    });
    expect(reused.statusCode).toBe(401);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invalid = await app.inject({
        method: "POST",
        url: "/v1/field-access/redeem",
        payload: { code: "AAAAAAAAAA", deviceId: "field-device-rate-limit" },
      });
      expect(invalid.statusCode).toBe(401);
    }
    const limited = await app.inject({
      method: "POST",
      url: "/v1/field-access/redeem",
      payload: { code: "AAAAAAAAAA", deviceId: "field-device-rate-limit" },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();

    const noPasskeyRecovery = await app.inject({
      method: "POST",
      url: "/v1/field-access/passkeys/authentication/options",
      payload: {
        actorId: leader.json().id,
        assignmentId: assigned.json().id,
        deviceId: "field-device-recovery",
      },
    });
    expect(noPasskeyRecovery.statusCode).toBe(401);

    const coverage = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/coverage`,
    });
    expect(coverage.json()[0]).toMatchObject({ coverageStatus: "assigned", revision: 2 });
  });
});

describe("identity and trust API", () => {
  it("deduplicates identities and reaches A3 without exposing raw identifiers", async () => {
    const app = await buildApp();
    apps.push(app);
    const incident = await app.inject({
      method: "POST",
      url: "/v1/incidents",
      payload: {
        code: "identity-trust",
        name: "Confianza operacional",
        disasterType: "earthquake",
        countryCode: "CO",
        timezone: "America/Bogota",
        startedAt: "2026-08-14T08:00:00-05:00",
      },
    });
    const incidentId = incident.json().id as string;
    const organization = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/organizations`,
      payload: { name: "Ingeniería Solidaria", type: "ngo" },
    });
    const organizationId = organization.json().id as string;
    const professional = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/actors`,
      payload: { organizationId, displayName: "Profesional de campo", role: "professional" },
    });
    const other = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/actors`,
      payload: { organizationId, displayName: "Persona duplicada", role: "field_worker" },
    });
    const coordinator = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/actors`,
      payload: { organizationId, displayName: "Coordinación", role: "coordinator" },
    });
    const actorId = professional.json().id as string;
    const coordinatorId = coordinator.json().id as string;
    const headers = {
      "x-pulso-admin-key": "pulso-local-admin",
      "x-pulso-actor-id": coordinatorId,
    };
    const documentNumber = "1.234.567.890";

    const claim = await app.inject({
      method: "POST",
      url: `/v1/actors/${actorId}/identity-claims`,
      headers,
      payload: {
        type: "government_id",
        value: documentNumber,
        documentType: "CC",
        countryCode: "CO",
      },
    });
    expect(claim.statusCode).toBe(201);
    expect(claim.json()).toMatchObject({ displayHint: "***7890", status: "asserted" });
    expect(claim.body).not.toContain(documentNumber);

    const duplicate = await app.inject({
      method: "POST",
      url: `/v1/actors/${other.json().id}/identity-claims`,
      headers,
      payload: {
        type: "government_id",
        value: "1234567890",
        documentType: "CC",
        countryCode: "CO",
      },
    });
    expect(duplicate.statusCode).toBe(409);

    const unauthorizedVerification = await app.inject({
      method: "POST",
      url: `/v1/actors/${actorId}/identity-claims/${claim.json().id}/verifications`,
      payload: {
        method: "document_review",
        provider: "Coordinación PULSO",
        result: "passed",
        checkedAt: "2026-08-14T09:00:00-05:00",
      },
    });
    expect(unauthorizedVerification.statusCode).toBe(401);

    const verification = await app.inject({
      method: "POST",
      url: `/v1/actors/${actorId}/identity-claims/${claim.json().id}/verifications`,
      headers,
      payload: {
        method: "document_review",
        provider: "Coordinación PULSO",
        result: "passed",
        checkedAt: "2026-08-14T09:00:00-05:00",
      },
    });
    expect(verification.statusCode).toBe(201);

    const endorsement = await app.inject({
      method: "POST",
      url: `/v1/actors/${actorId}/endorsements`,
      headers,
      payload: { scope: "professional", notes: "Miembro activo de la brigada." },
    });
    expect(endorsement.statusCode).toBe(201);

    const credential = await app.inject({
      method: "POST",
      url: `/v1/actors/${actorId}/professional-credentials`,
      headers,
      payload: {
        registry: "COPNIA",
        profession: "Ingeniería civil",
        registrationNumber: "COPNIA-123456",
        status: "active",
        checkedAt: "2026-08-14T09:05:00-05:00",
        sourceUrl:
          "https://tramites.copnia.gov.co/copnia_microsite/certificateofgoodstanding/certificateofgoodstandingstart",
      },
    });
    expect(credential.statusCode).toBe(201);
    expect(credential.json()).toMatchObject({ registry: "COPNIA", registrationHint: "***3456" });
    expect(credential.body).not.toContain("COPNIA-123456");

    const privateIdentityResponses = await Promise.all(
      [
        "trust-profile",
        "identity-claims",
        "identity-verifications",
        "endorsements",
        "professional-credentials",
      ].map((resource) => app.inject({ method: "GET", url: `/v1/actors/${actorId}/${resource}` })),
    );
    expect(privateIdentityResponses.every((response) => response.statusCode === 401)).toBe(true);

    const profile = await app.inject({
      method: "GET",
      url: `/v1/actors/${actorId}/trust-profile`,
      headers,
    });
    expect(profile.json()).toMatchObject({
      assuranceLevel: "A3",
      identityVerified: true,
      activeEndorsements: 1,
      validProfessionalCredentials: 1,
    });
  });

  /**
   * El orden de la cola pública es una decisión de producto, no un detalle del adaptador.
   *
   * La lista va recortada (800 en vista de país sobre más de 2.288 reportes) y antes se ordenaba
   * por estado de revisión: un rescate recién enviado, que por definición nadie ha validado
   * todavía, quedaba detrás de cada necesidad ya validada y podía no entrar en la respuesta.
   * Esperar a que alguien lo valide es exactamente el tiempo que no hay.
   */
  it("puts a fresh rescue report above everything else in the public queue", async () => {
    const app = await buildApp();
    apps.push(app);

    await app.inject({
      method: "POST",
      url: "/v1/incidents",
      payload: {
        code: "colombia-2026",
        name: "Respuesta Colombia 2026",
        disasterType: "earthquake",
        countryCode: "CO",
        timezone: "America/Bogota",
        startedAt: "2026-08-10T07:34:00-05:00",
      },
    });

    const post = (payload: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: "/v1/public/incidents/colombia-2026/community-reports",
        payload: {
          clientMutationId: crypto.randomUUID(),
          location: { type: "Point", coordinates: [-76.53, 3.43] },
          ...payload,
        },
      });

    await post({ reportType: "necesidad", category: "agua", title: "Falta agua potable" });
    await post({ reportType: "pmu", title: "PMU Comuna 3" });
    const rescue = await post({
      reportType: "rescate",
      title: "2 personas bajo escombros — se oyen señales de vida",
      peopleReported: 2,
      signsOfLife: "yes",
      respondersOnSite: false,
    });

    expect(rescue.statusCode).toBe(201);

    const listed = await app.inject({
      method: "GET",
      url: "/v1/public/incidents/colombia-2026/community-reports",
    });
    const [first] = listed.json().reports as Array<{ reportType: string; signsOfLife: string }>;

    expect(first).toMatchObject({ reportType: "rescate", signsOfLife: "yes" });
  });
});
