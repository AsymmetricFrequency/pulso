import cors from "@fastify/cors";
import {
  IncidentCodeAlreadyExistsError,
  IncidentNotFoundError,
  type IncidentRepository,
  OperationalZoneNotFoundError,
  type TerritoryRepository,
} from "@pulso/domain";
import {
  coverageEventSchema,
  createCoverageEventSchema,
  createIncidentSchema,
  createOperationalZoneSchema,
  incidentListSchema,
  incidentSchema,
  operationalZoneSchema,
  territoryImportResultSchema,
  territoryImportSchema,
  territorySchema,
} from "@pulso/schemas";
import Fastify from "fastify";
import { ZodError } from "zod";
import { MemoryIncidentRepository } from "./memory-incident-repository.js";
import { MemoryTerritoryRepository } from "./memory-territory-repository.js";

export type BuildAppOptions = {
  incidentRepository?: IncidentRepository;
  territoryRepository?: TerritoryRepository;
  logger?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 15 * 1024 * 1024 });
  const incidents = options.incidentRepository ?? new MemoryIncidentRepository();
  const territories = options.territoryRepository ?? new MemoryTerritoryRepository(incidents);

  await app.register(cors, {
    origin: process.env.NODE_ENV !== "production",
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "validation_error",
        message: "La solicitud contiene datos inválidos.",
        issues: error.issues,
      });
    }

    if (error instanceof IncidentCodeAlreadyExistsError) {
      return reply.status(409).send({
        error: "incident_code_conflict",
        message: error.message,
      });
    }

    if (error instanceof IncidentNotFoundError || error instanceof OperationalZoneNotFoundError) {
      return reply.status(404).send({
        error: "resource_not_found",
        message: error.message,
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: "internal_error",
      message: "No fue posible procesar la solicitud.",
    });
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "pulso-api",
    timestamp: new Date().toISOString(),
    persistence: "memory",
  }));

  app.get("/v1/incidents", async () => incidentListSchema.parse(await incidents.list()));

  app.get<{ Params: { id: string } }>("/v1/incidents/:id", async (request, reply) => {
    const incident = await incidents.findById(request.params.id);
    if (!incident) {
      return reply.status(404).send({
        error: "incident_not_found",
        message: "La emergencia no existe.",
      });
    }

    return incidentSchema.parse(incident);
  });

  app.post("/v1/incidents", async (request, reply) => {
    const input = createIncidentSchema.parse(request.body);
    const incident = incidentSchema.parse(await incidents.create(input));
    return reply.status(201).send(incident);
  });

  app.post<{ Params: { incidentId: string } }>(
    "/v1/incidents/:incidentId/territories/import",
    async (request, reply) => {
      const input = territoryImportSchema.parse(request.body);
      const result = territoryImportResultSchema.parse(
        await territories.importTerritories(request.params.incidentId, input),
      );
      return reply.status(201).send(result);
    },
  );

  app.get<{ Params: { incidentId: string } }>(
    "/v1/incidents/:incidentId/territories",
    async (request) =>
      territorySchema.array().parse(await territories.listTerritories(request.params.incidentId)),
  );

  app.post<{ Params: { incidentId: string } }>(
    "/v1/incidents/:incidentId/operational-zones",
    async (request, reply) => {
      const input = createOperationalZoneSchema.parse(request.body);
      const zone = operationalZoneSchema.parse(
        await territories.createOperationalZone(request.params.incidentId, input),
      );
      return reply.status(201).send(zone);
    },
  );

  app.get<{ Params: { incidentId: string } }>(
    "/v1/incidents/:incidentId/operational-zones",
    async (request) =>
      operationalZoneSchema
        .array()
        .parse(await territories.listOperationalZones(request.params.incidentId)),
  );

  app.get<{ Params: { incidentId: string } }>(
    "/v1/incidents/:incidentId/coverage",
    async (request) =>
      operationalZoneSchema
        .array()
        .parse(await territories.listOperationalZones(request.params.incidentId)),
  );

  app.post<{ Params: { zoneId: string } }>(
    "/v1/operational-zones/:zoneId/coverage-events",
    async (request, reply) => {
      const input = createCoverageEventSchema.parse(request.body);
      const event = coverageEventSchema.parse(
        await territories.addCoverageEvent(request.params.zoneId, input),
      );
      return reply.status(201).send(event);
    },
  );

  app.get<{ Params: { zoneId: string } }>(
    "/v1/operational-zones/:zoneId/coverage-events",
    async (request) =>
      coverageEventSchema
        .array()
        .parse(await territories.listCoverageEvents(request.params.zoneId)),
  );

  return app;
}
