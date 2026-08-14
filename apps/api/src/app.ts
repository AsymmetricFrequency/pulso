import cors from "@fastify/cors";
import { IncidentCodeAlreadyExistsError, type IncidentRepository } from "@pulso/domain";
import { createIncidentSchema, incidentListSchema, incidentSchema } from "@pulso/schemas";
import Fastify from "fastify";
import { ZodError } from "zod";
import { MemoryIncidentRepository } from "./memory-incident-repository.js";

export type BuildAppOptions = {
  incidentRepository?: IncidentRepository;
  logger?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false });
  const incidents = options.incidentRepository ?? new MemoryIncidentRepository();

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

  return app;
}
