import cors from "@fastify/cors";
import {
  FieldVisitConflictError,
  FieldVisitNotFoundError,
  IncidentCodeAlreadyExistsError,
  IncidentNotFoundError,
  type IncidentRepository,
  MissionAccessDeniedError,
  type MissionAccessRepository,
  MissionInvitationConflictError,
  MissionRateLimitError,
  OperationalZoneNotFoundError,
  OperationsConflictError,
  type OperationsRepository,
  OperationsResourceNotFoundError,
  type TerritoryRepository,
} from "@pulso/domain";
import {
  acceptFieldAssignmentSchema,
  actorSchema,
  beginPasskeyAuthenticationSchema,
  completeFieldVisitSchema,
  coverageEventSchema,
  createActorSchema,
  createCoverageEventSchema,
  createFieldAssignmentSchema,
  createFieldVisitSchema,
  createIncidentSchema,
  createMissionInvitationSchema,
  createOperationalZoneSchema,
  createOrganizationSchema,
  createTeamMembershipSchema,
  createTeamSchema,
  fieldAssignmentSchema,
  fieldSessionSchema,
  fieldVisitSchema,
  incidentListSchema,
  incidentSchema,
  issuedMissionInvitationSchema,
  operationalZoneSchema,
  organizationSchema,
  passkeyRegistrationResponseSchema,
  passkeyVerificationResultSchema,
  redeemMissionInvitationSchema,
  teamMembershipSchema,
  teamSchema,
  territoryImportResultSchema,
  territoryImportSchema,
  territorySchema,
  verifyPasskeyAuthenticationSchema,
} from "@pulso/schemas";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import Fastify from "fastify";
import { ZodError } from "zod";
import { MemoryIncidentRepository } from "./memory-incident-repository.js";
import { MemoryOperationsRepository } from "./memory-operations-repository.js";
import { MemoryTerritoryRepository } from "./memory-territory-repository.js";
import { MemoryMissionAccessRepository } from "./mission-access-repositories.js";

export type BuildAppOptions = {
  incidentRepository?: IncidentRepository;
  territoryRepository?: TerritoryRepository;
  operationsRepository?: OperationsRepository;
  missionAccessRepository?: MissionAccessRepository;
  persistence?: "memory" | "postgres";
  logger?: boolean;
  missionInvitationSecret?: string;
  missionAdminKey?: string;
  siteUrl?: string;
  webauthnRpId?: string;
  webauthnOrigin?: string;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 15 * 1024 * 1024 });
  const incidents = options.incidentRepository ?? new MemoryIncidentRepository();
  const territories = options.territoryRepository ?? new MemoryTerritoryRepository(incidents);
  const operations =
    options.operationsRepository ?? new MemoryOperationsRepository(incidents, territories);
  const missionAccess =
    options.missionAccessRepository ??
    new MemoryMissionAccessRepository(
      options.missionInvitationSecret ?? "pulso-test-invitation-secret-change-me-2026",
      operations,
      territories,
    );
  const siteUrl = options.siteUrl ?? "http://localhost:3000";
  const rpID = options.webauthnRpId ?? "localhost";
  const origin = options.webauthnOrigin ?? "http://localhost:3000";
  const adminKey = options.missionAdminKey ?? "pulso-local-admin";

  const requireAdmin = (provided: string | string[] | undefined) => {
    if (provided !== adminKey) throw new MissionAccessDeniedError("No puedes emitir invitaciones.");
  };

  const requireCoordinator = async (
    assignmentId: string,
    providedAdminKey: string | string[] | undefined,
    providedActorId: string | string[] | undefined,
  ) => {
    requireAdmin(providedAdminKey);
    if (typeof providedActorId !== "string") {
      throw new MissionAccessDeniedError("Falta identificar a la persona coordinadora.");
    }
    const [actor, assignment] = await Promise.all([
      operations.findActor(providedActorId),
      operations.findFieldAssignment(assignmentId),
    ]);
    if (
      !actor ||
      !assignment ||
      actor.incidentId !== assignment.incidentId ||
      !["coordinator", "incident_admin"].includes(actor.role) ||
      actor.status !== "active"
    ) {
      throw new MissionAccessDeniedError("Esta persona no puede coordinar la misión.");
    }
    return actor.id;
  };

  const bearerToken = (authorization: string | undefined) => {
    const [scheme, token] = authorization?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) throw new MissionAccessDeniedError();
    return token;
  };

  await app.register(cors, {
    origin: process.env.NODE_ENV === "production" ? siteUrl : true,
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

    if (
      error instanceof IncidentNotFoundError ||
      error instanceof OperationalZoneNotFoundError ||
      error instanceof FieldVisitNotFoundError ||
      error instanceof OperationsResourceNotFoundError
    ) {
      return reply.status(404).send({
        error: "resource_not_found",
        message: error.message,
      });
    }

    if (error instanceof FieldVisitConflictError || error instanceof OperationsConflictError) {
      return reply.status(409).send({
        error: "operation_conflict",
        message: error.message,
      });
    }

    if (error instanceof MissionInvitationConflictError) {
      return reply
        .status(409)
        .send({ error: "mission_invitation_conflict", message: error.message });
    }

    if (error instanceof MissionAccessDeniedError) {
      return reply.status(401).send({ error: "mission_access_denied", message: error.message });
    }

    if (error instanceof MissionRateLimitError) {
      return reply
        .header("Retry-After", String(error.retryAfterSeconds))
        .status(429)
        .send({ error: "mission_rate_limited", message: error.message });
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
    persistence: options.persistence ?? "memory",
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
    "/v1/incidents/:incidentId/organizations",
    async (request, reply) => {
      const input = createOrganizationSchema.parse(request.body);
      return reply
        .status(201)
        .send(
          organizationSchema.parse(
            await operations.createOrganization(request.params.incidentId, input),
          ),
        );
    },
  );

  app.get<{ Params: { incidentId: string } }>(
    "/v1/incidents/:incidentId/organizations",
    async (request) =>
      organizationSchema
        .array()
        .parse(await operations.listOrganizations(request.params.incidentId)),
  );

  app.post<{ Params: { incidentId: string } }>(
    "/v1/incidents/:incidentId/actors",
    async (request, reply) => {
      const input = createActorSchema.parse(request.body);
      return reply
        .status(201)
        .send(actorSchema.parse(await operations.createActor(request.params.incidentId, input)));
    },
  );

  app.get<{ Params: { incidentId: string } }>("/v1/incidents/:incidentId/actors", async (request) =>
    actorSchema.array().parse(await operations.listActors(request.params.incidentId)),
  );

  app.post<{ Params: { incidentId: string } }>(
    "/v1/incidents/:incidentId/teams",
    async (request, reply) => {
      const input = createTeamSchema.parse(request.body);
      return reply
        .status(201)
        .send(teamSchema.parse(await operations.createTeam(request.params.incidentId, input)));
    },
  );

  app.get<{ Params: { incidentId: string } }>("/v1/incidents/:incidentId/teams", async (request) =>
    teamSchema.array().parse(await operations.listTeams(request.params.incidentId)),
  );

  app.post<{ Params: { teamId: string } }>(
    "/v1/teams/:teamId/memberships",
    async (request, reply) => {
      const input = createTeamMembershipSchema.parse(request.body);
      return reply
        .status(201)
        .send(
          teamMembershipSchema.parse(
            await operations.addTeamMembership(request.params.teamId, input),
          ),
        );
    },
  );

  app.get<{ Params: { teamId: string } }>("/v1/teams/:teamId/memberships", async (request) =>
    teamMembershipSchema.array().parse(await operations.listTeamMemberships(request.params.teamId)),
  );

  app.post<{ Params: { incidentId: string } }>(
    "/v1/incidents/:incidentId/assignments",
    async (request, reply) => {
      const input = createFieldAssignmentSchema.parse(request.body);
      return reply
        .status(201)
        .send(
          fieldAssignmentSchema.parse(
            await operations.createFieldAssignment(request.params.incidentId, input),
          ),
        );
    },
  );

  app.get<{ Params: { incidentId: string } }>(
    "/v1/incidents/:incidentId/assignments",
    async (request) =>
      fieldAssignmentSchema
        .array()
        .parse(await operations.listFieldAssignments(request.params.incidentId)),
  );

  app.post<{ Params: { assignmentId: string } }>(
    "/v1/assignments/:assignmentId/accept",
    async (request) => {
      const input = acceptFieldAssignmentSchema.parse(request.body);
      return fieldAssignmentSchema.parse(
        await operations.acceptFieldAssignment(request.params.assignmentId, input),
      );
    },
  );

  app.post<{ Params: { assignmentId: string } }>(
    "/v1/assignments/:assignmentId/invitations",
    async (request, reply) => {
      const coordinatorId = await requireCoordinator(
        request.params.assignmentId,
        request.headers["x-pulso-admin-key"],
        request.headers["x-pulso-actor-id"],
      );
      const input = createMissionInvitationSchema.parse(request.body);
      const invitation = issuedMissionInvitationSchema.parse(
        await missionAccess.issueInvitation(
          request.params.assignmentId,
          input,
          siteUrl,
          coordinatorId,
        ),
      );
      return reply.status(201).send(invitation);
    },
  );

  app.post("/v1/field-access/redeem", async (request, reply) => {
    const input = redeemMissionInvitationSchema.parse(request.body);
    const session = fieldSessionSchema.parse(
      await missionAccess.redeemInvitation(input, request.ip),
    );
    return reply.status(201).send(session);
  });

  app.post("/v1/field-access/passkeys/authentication/options", async (request) => {
    const input = beginPasskeyAuthenticationSchema.parse(request.body);
    const passkeys = await missionAccess.listPasskeys(input.actorId);
    if (passkeys.length === 0) throw new MissionAccessDeniedError();
    const authentication = await generateAuthenticationOptions({
      rpID,
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports as never,
      })),
      userVerification: "required",
    });
    const attemptId = await missionAccess.createAuthenticationAttempt(
      input,
      authentication.challenge,
      new Date(Date.now() + 5 * 60_000).toISOString(),
    );
    return { attemptId, options: authentication };
  });

  app.post("/v1/field-access/passkeys/authentication/verify", async (request, reply) => {
    const input = verifyPasskeyAuthenticationSchema.parse(request.body);
    const attempt = await missionAccess.consumeAuthenticationAttempt(input.attemptId);
    const passkey = await missionAccess.findPasskey(input.response.id);
    if (!passkey || passkey.actorId !== attempt.actorId) {
      throw new MissionAccessDeniedError();
    }
    try {
      const verification = await verifyAuthenticationResponse({
        response: input.response as AuthenticationResponseJSON,
        expectedChallenge: attempt.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports as never,
        },
        requireUserVerification: true,
      });
      if (!verification.verified) throw new Error("Passkey verification failed");
      await missionAccess.updatePasskeyCounter(
        passkey.credentialId,
        verification.authenticationInfo.newCounter,
      );
      return fieldSessionSchema.parse(
        await missionAccess.issueFieldSession(
          attempt.actorId,
          attempt.assignmentId,
          attempt.deviceId,
        ),
      );
    } catch {
      return reply.status(401).send({
        error: "passkey_authentication_failed",
        message: "No pudimos validar este acceso.",
      });
    }
  });

  app.post("/v1/field-access/passkeys/registration/options", async (request) => {
    const session = await missionAccess.resolveSession(bearerToken(request.headers.authorization));
    const passkeys = await missionAccess.listPasskeys(session.actorId);
    const registration = await generateRegistrationOptions({
      rpName: "PULSO",
      rpID,
      userID: new TextEncoder().encode(session.actorId),
      userName: session.actorId,
      userDisplayName: session.mission.actorName,
      attestationType: "none",
      excludeCredentials: passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports as never,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
      preferredAuthenticatorType: "localDevice",
    });
    await missionAccess.saveRegistrationChallenge(
      session.id,
      registration.challenge,
      new Date(Date.now() + 5 * 60_000).toISOString(),
    );
    return registration;
  });

  app.post("/v1/field-access/passkeys/registration/verify", async (request, reply) => {
    const session = await missionAccess.resolveSession(bearerToken(request.headers.authorization));
    const response = passkeyRegistrationResponseSchema.parse(
      request.body,
    ) as RegistrationResponseJSON;
    const expectedChallenge = await missionAccess.consumeRegistrationChallenge(session.id);
    try {
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!verification.verified || !verification.registrationInfo) {
        return reply.status(400).send({ verified: false });
      }
      const { credential, credentialDeviceType, credentialBackedUp } =
        verification.registrationInfo;
      await missionAccess.savePasskey({
        id: crypto.randomUUID(),
        actorId: session.actorId,
        credentialId: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      });
      return passkeyVerificationResultSchema.parse({ verified: true });
    } catch {
      return reply.status(400).send({
        error: "passkey_verification_failed",
        message: "No pudimos verificar la protección del dispositivo.",
        verified: false,
      });
    }
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

  app.post<{ Params: { zoneId: string } }>(
    "/v1/operational-zones/:zoneId/field-visits",
    async (request, reply) => {
      const input = createFieldVisitSchema.parse(request.body);
      const visit = fieldVisitSchema.parse(
        await territories.createFieldVisit(request.params.zoneId, input),
      );
      return reply.status(201).send(visit);
    },
  );

  app.get<{ Params: { zoneId: string } }>(
    "/v1/operational-zones/:zoneId/field-visits",
    async (request) =>
      fieldVisitSchema.array().parse(await territories.listFieldVisits(request.params.zoneId)),
  );

  app.post<{ Params: { visitId: string } }>(
    "/v1/field-visits/:visitId/complete",
    async (request) => {
      const input = completeFieldVisitSchema.parse(request.body);
      return fieldVisitSchema.parse(
        await territories.completeFieldVisit(request.params.visitId, input),
      );
    },
  );

  return app;
}
