import { createHash } from "node:crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import {
  AssessmentNotFoundError,
  type AssessmentRepository,
  type CommunityReportBoundingBox,
  CommunityReportNotFoundError,
  CommunityReportRateLimitError,
  type CommunityReportRepository,
  ContractNotFoundError,
  EvidenceAssessmentNotFoundError,
  EvidenceIntegrityError,
  type EvidenceRepository,
  FieldVisitConflictError,
  FieldVisitNotFoundError,
  IdentityTrustConflictError,
  IdentityTrustNotFoundError,
  type IdentityTrustRepository,
  IncidentCodeAlreadyExistsError,
  IncidentNotFoundError,
  type IncidentRepository,
  MaterialSupplierRateLimitError,
  type MaterialSupplierRepository,
  MissionAccessDeniedError,
  type MissionAccessRepository,
  MissionInvitationConflictError,
  MissionRateLimitError,
  OperationalZoneNotFoundError,
  type OperationsAccessRepository,
  OperationsConflictError,
  type OperationsRepository,
  OperationsResourceNotFoundError,
  type PublicFundsRepository,
  type PublicReportRepository,
  type ReconstructionProgressRepository,
  type SeismicShakingRepository,
  type TerritoryRepository,
  WorkforceProfileRateLimitError,
  type WorkforceProfileRepository,
} from "@pulso/domain";
import {
  acceptFieldAssignmentSchema,
  actorEndorsementSchema,
  actorSchema,
  actorTrustProfileSchema,
  assessmentSummarySchema,
  beginPasskeyAuthenticationSchema,
  communityReportSchema,
  completeFieldVisitSchema,
  coverageEventSchema,
  createActorEndorsementSchema,
  createActorSchema,
  createCommunityReportSchema,
  createCoverageEventSchema,
  createFieldAssignmentSchema,
  createFieldEvidenceSchema,
  createFieldVisitSchema,
  createIdentityClaimSchema,
  createIncidentSchema,
  createMaterialSupplierSchema,
  createMissionInvitationSchema,
  createOperationalZoneSchema,
  createOperationsInvitationSchema,
  createOrganizationSchema,
  createProfessionalCredentialSchema,
  createRapidAssessmentSchema,
  createTeamMembershipSchema,
  createTeamSchema,
  createWorkforceProfileSchema,
  type EmergencyRelevance,
  fieldAssignmentSchema,
  fieldEvidenceSchema,
  fieldSessionSchema,
  fieldVisitSchema,
  identityClaimSchema,
  identityVerificationSchema,
  incidentListSchema,
  incidentSchema,
  issuedMissionInvitationSchema,
  issuedOperationsInvitationSchema,
  mapCommunityReportSchema,
  operationalZoneSchema,
  operationsContractSchema,
  operationsSessionSchema,
  operationsWorkforceProfileSchema,
  organizationSchema,
  passkeyRegistrationResponseSchema,
  passkeyVerificationResultSchema,
  professionalCredentialSchema,
  publicCommunityReportSchema,
  publicContractSchema,
  publicFundsSummarySchema,
  publicMaterialSupplierSchema,
  publicSituationReportSchema,
  publicWorkforceProfileSchema,
  rapidAssessmentSchema,
  reconstructionProgressSchema,
  redeemMissionInvitationSchema,
  redeemOperationsInvitationSchema,
  reviewCommunityReportSchema,
  reviewContractSchema,
  teamMembershipSchema,
  teamSchema,
  territoryImportResultSchema,
  territoryImportSchema,
  territorySchema,
  territoryShakingSchema,
  verifyIdentityClaimSchema,
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
import { registerAdminRoutes } from "./admin-routes.js";
import { MemoryAssessmentRepository } from "./assessment-repositories.js";
import {
  type CaliPublicSourceRepository,
  EmptyCaliPublicSourceRepository,
} from "./cali-public-source-repositories.js";
import type { DiscordClient } from "./discord.js";
import { EmptyPublicFundsRepository } from "./empty-public-funds-repository.js";
import { MemoryEvidenceRepository } from "./evidence-repositories.js";
import { MemoryCommunityReportRepository } from "./memory-community-report-repository.js";
import { MemoryIdentityTrustRepository } from "./memory-identity-trust-repository.js";
import { MemoryIncidentRepository } from "./memory-incident-repository.js";
import { MemoryMaterialSupplierRepository } from "./memory-material-supplier-repository.js";
import { MemoryOperationsRepository } from "./memory-operations-repository.js";
import { MemoryPublicReportRepository } from "./memory-public-report-repository.js";
import { MemoryReconstructionProgressRepository } from "./memory-reconstruction-progress-repository.js";
import { MemoryTerritoryRepository } from "./memory-territory-repository.js";
import { MemoryWorkforceProfileRepository } from "./memory-workforce-profile-repository.js";
import { MemoryMissionAccessRepository } from "./mission-access-repositories.js";
import { MemoryOperationsAccessRepository } from "./operations-access-repositories.js";
import type { PostgresAdminRepository } from "./postgres-admin-repository.js";
import { EmptySeismicShakingRepository } from "./postgres-seismic-shaking-repository.js";
import {
  EmptySgcPublicSourceRepository,
  type SgcPublicSourceRepository,
} from "./sgc-public-source-repositories.js";

/**
 * Lee `bbox=oesteLng,surLat,esteLng,norteLat`. Devuelve `null` ante cualquier cosa que no sea una
 * caja válida —incluida una invertida— para que la ruta responda 400 en vez de aceptar en silencio
 * un rectángulo vacío y dejar al mapa sin puntos sin explicar por qué.
 */
function parseBoundingBox(raw: string | undefined): CommunityReportBoundingBox | null {
  if (!raw) return null;
  const parts = raw.split(",").map((value) => Number.parseFloat(value.trim()));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  const [west, south, east, north] = parts as CommunityReportBoundingBox;
  if (west < -180 || east > 180 || south < -90 || north > 90) return null;
  if (west >= east || south >= north) return null;
  return [west, south, east, north];
}

export type BuildAppOptions = {
  incidentRepository?: IncidentRepository;
  territoryRepository?: TerritoryRepository;
  operationsRepository?: OperationsRepository;
  missionAccessRepository?: MissionAccessRepository;
  operationsAccessRepository?: OperationsAccessRepository;
  identityTrustRepository?: IdentityTrustRepository;
  assessmentRepository?: AssessmentRepository;
  evidenceRepository?: EvidenceRepository;
  communityReportRepository?: CommunityReportRepository;
  publicFundsRepository?: PublicFundsRepository;
  seismicShakingRepository?: SeismicShakingRepository;
  publicReportRepository?: PublicReportRepository;
  caliPublicSourceRepository?: CaliPublicSourceRepository;
  sgcPublicSourceRepository?: SgcPublicSourceRepository;
  materialSupplierRepository?: MaterialSupplierRepository;
  workforceProfileRepository?: WorkforceProfileRepository;
  reconstructionProgressRepository?: ReconstructionProgressRepository;
  /** Panel administrativo. Sin esto las rutas `/v1/admin/*` responden 503 explicando qué falta. */
  adminRepository?: PostgresAdminRepository;
  discordClient?: DiscordClient;
  adminPanelUrl?: string;
  persistence?: "memory" | "postgres";
  logger?: boolean;
  missionInvitationSecret?: string;
  operationsAccessSecret?: string;
  identityFingerprintSecret?: string;
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
  const operationsAccess =
    options.operationsAccessRepository ??
    new MemoryOperationsAccessRepository(
      options.operationsAccessSecret ??
        options.missionInvitationSecret ??
        "pulso-test-operations-access-secret-2026",
      incidents,
      operations,
    );
  const identityTrust =
    options.identityTrustRepository ??
    new MemoryIdentityTrustRepository(
      options.identityFingerprintSecret ??
        options.missionInvitationSecret ??
        "pulso-test-identity-fingerprint-secret-2026",
      operations,
    );
  const assessments = options.assessmentRepository ?? new MemoryAssessmentRepository(territories);
  const evidence = options.evidenceRepository ?? new MemoryEvidenceRepository(assessments);
  const communityReports =
    options.communityReportRepository ?? new MemoryCommunityReportRepository(incidents);
  const materialSuppliers =
    options.materialSupplierRepository ?? new MemoryMaterialSupplierRepository(incidents);
  const workforceProfiles =
    options.workforceProfileRepository ?? new MemoryWorkforceProfileRepository(incidents);
  const reconstructionProgress =
    options.reconstructionProgressRepository ??
    new MemoryReconstructionProgressRepository(incidents, materialSuppliers, workforceProfiles);
  const publicFunds = options.publicFundsRepository ?? new EmptyPublicFundsRepository();
  const seismicShaking = options.seismicShakingRepository ?? new EmptySeismicShakingRepository();
  const publicReports = options.publicReportRepository ?? new MemoryPublicReportRepository();
  const caliPublicSource =
    options.caliPublicSourceRepository ?? new EmptyCaliPublicSourceRepository();
  const sgcPublicSource = options.sgcPublicSourceRepository ?? new EmptySgcPublicSourceRepository();
  const siteUrl = options.siteUrl ?? "http://localhost:3000";
  const adminPanelUrl = options.adminPanelUrl ?? siteUrl;
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

  const requireOperationsIssuer = async (
    incidentId: string,
    providedAdminKey: string | string[] | undefined,
    providedActorId: string | string[] | undefined,
  ) => {
    requireAdmin(providedAdminKey);
    if (typeof providedActorId !== "string") {
      throw new MissionAccessDeniedError("Falta identificar a la persona administradora.");
    }
    const actor = await operations.findActor(providedActorId);
    if (
      !actor ||
      actor.incidentId !== incidentId ||
      actor.status !== "active" ||
      !["coordinator", "incident_admin"].includes(actor.role)
    ) {
      throw new MissionAccessDeniedError("Esta persona no puede habilitar acceso operacional.");
    }
    return actor.id;
  };

  const bearerToken = (authorization: string | undefined) => {
    const [scheme, token] = authorization?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) throw new MissionAccessDeniedError();
    return token;
  };

  const requireTrustOfficer = async (
    subjectActorId: string,
    providedAdminKey: string | string[] | undefined,
    providedActorId: string | string[] | undefined,
  ) => {
    requireAdmin(providedAdminKey);
    if (typeof providedActorId !== "string") {
      throw new MissionAccessDeniedError("Falta identificar a la persona verificadora.");
    }
    const [subject, verifier] = await Promise.all([
      operations.findActor(subjectActorId),
      operations.findActor(providedActorId),
    ]);
    if (
      !subject ||
      !verifier ||
      subject.incidentId !== verifier.incidentId ||
      verifier.status !== "active" ||
      !["coordinator", "auditor", "incident_admin"].includes(verifier.role)
    ) {
      throw new MissionAccessDeniedError("Esta persona no puede verificar identidad.");
    }
    return verifier.id;
  };

  const requireSelfOrTrustOfficer = async (
    subjectActorId: string,
    authorization: string | undefined,
    providedAdminKey: string | string[] | undefined,
    providedActorId: string | string[] | undefined,
  ) => {
    if (authorization) {
      const session = await missionAccess.resolveSession(bearerToken(authorization));
      if (session.actorId !== subjectActorId) throw new MissionAccessDeniedError();
      return session.actorId;
    }
    return requireTrustOfficer(subjectActorId, providedAdminKey, providedActorId);
  };

  await app.register(cors, {
    // El panel vive en otro subdominio (`admin.pulso.my`) y manda la cookie de sesión, así que
    // necesita estar en la lista y `credentials`. Sin `credentials` el navegador descarta la cookie
    // en silencio y la sesión parece no crearse nunca.
    origin: process.env.NODE_ENV === "production" ? [siteUrl, adminPanelUrl].filter(Boolean) : true,
    credentials: true,
  });
  await app.register(cookie);

  registerAdminRoutes(app, {
    admin: options.adminRepository ?? null,
    discord: options.discordClient ?? null,
    incidentCode: process.env.PULSO_INCIDENT_CODE ?? "colombia-2026",
    panelUrl: adminPanelUrl,
    secureCookies: process.env.NODE_ENV === "production",
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "validation_error",
        message: "La solicitud contiene datos inválidos.",
        issues: error.issues,
      });
    }

    if (error instanceof EvidenceIntegrityError) {
      return reply.status(400).send({ error: "evidence_integrity_error", message: error.message });
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
      error instanceof AssessmentNotFoundError ||
      error instanceof EvidenceAssessmentNotFoundError ||
      error instanceof IdentityTrustNotFoundError ||
      error instanceof OperationsResourceNotFoundError ||
      error instanceof CommunityReportNotFoundError ||
      error instanceof ContractNotFoundError
    ) {
      return reply.status(404).send({
        error: "resource_not_found",
        message: error.message,
      });
    }

    if (
      error instanceof FieldVisitConflictError ||
      error instanceof OperationsConflictError ||
      error instanceof IdentityTrustConflictError
    ) {
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

    if (error instanceof CommunityReportRateLimitError) {
      return reply
        .header("Retry-After", String(error.retryAfterSeconds))
        .status(429)
        .send({ error: "community_report_rate_limited", message: error.message });
    }

    if (error instanceof MaterialSupplierRateLimitError) {
      return reply
        .header("Retry-After", String(error.retryAfterSeconds))
        .status(429)
        .send({ error: "material_supplier_rate_limited", message: error.message });
    }

    if (error instanceof WorkforceProfileRateLimitError) {
      return reply
        .header("Retry-After", String(error.retryAfterSeconds))
        .status(429)
        .send({ error: "workforce_profile_rate_limited", message: error.message });
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

  app.get<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/report",
    async (request, reply) => {
      const report = await publicReports.findPublishedByIncidentCode(request.params.incidentCode);
      if (!report) {
        return reply.status(404).send({
          error: "public_report_not_found",
          message: "No existe un informe público para esta emergencia.",
        });
      }

      return reply
        .header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=900")
        .header("X-Pulso-Data-Mode", report.incident.dataMode)
        .send(publicSituationReportSchema.parse(report));
    },
  );

  app.get(
    "/v1/public/sources/cali-official-earthquake-repository/snapshot",
    async (_request, reply) => {
      const snapshot = await caliPublicSource.findSnapshot();
      if (!snapshot) {
        return reply.status(404).send({
          error: "public_source_not_found",
          message: "La fuente oficial todavía no tiene datos importados.",
        });
      }
      return reply
        .header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=900")
        .send(snapshot);
    },
  );

  app.get("/v1/public/sources/sgc-realtime-earthquakes/snapshot", async (_request, reply) => {
    const snapshot = await sgcPublicSource.findSnapshot();
    if (!snapshot) {
      return reply.status(404).send({
        error: "public_source_not_found",
        message: "La fuente SGC todavía no tiene datos importados.",
      });
    }
    return reply
      .header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=900")
      .send(snapshot);
  });

  app.get<{
    Params: { incidentCode: string };
    Querystring: { level?: string; departmentCode?: string };
  }>("/v1/public/incidents/:incidentCode/territories", async (request, reply) => {
    const incident = await incidents.findByCode(request.params.incidentCode);
    if (!incident) {
      return reply
        .status(404)
        .send({ error: "incident_not_found", message: "La emergencia no existe." });
    }
    const level = request.query.level ?? "department";
    if (level !== "department" && level !== "municipality") {
      return reply
        .status(400)
        .send({ error: "validation_error", message: "Nivel territorial inválido." });
    }
    const all = await territories.listTerritories(incident.id);
    const byId = new Map(all.map((territory) => [territory.id, territory]));
    const filtered = all.filter((territory) => {
      if (territory.type !== level) return false;
      if (level === "department") return true;
      if (!request.query.departmentCode) return false;
      return territory.parentId
        ? byId.get(territory.parentId)?.externalCode === request.query.departmentCode
        : false;
    });
    return reply
      .header(
        "Cache-Control",
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      )
      .send({
        type: "FeatureCollection",
        source: "DANE MGN 2023",
        features: filtered.map((territory) => {
          const parent = territory.parentId ? byId.get(territory.parentId) : undefined;
          return {
            type: "Feature",
            id: territory.externalCode,
            geometry: territory.geometry,
            properties: {
              dpto_ccdgo:
                territory.type === "department" ? territory.externalCode : parent?.externalCode,
              dpto_cnmbre: territory.type === "department" ? territory.name : parent?.name,
              mpio_cdpmp: territory.type === "municipality" ? territory.externalCode : null,
              mpio_cnmbre: territory.type === "municipality" ? territory.name : null,
              source_version: 2023,
            },
          };
        }),
      });
  });

  app.post<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/community-reports",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      const input = createCommunityReportSchema.parse(request.body);
      const sourceIpHash = request.ip
        ? createHash("sha256").update(`community-report:${request.ip}`).digest("hex")
        : null;
      const report = await communityReports.create(incident.id, input, { sourceIpHash });
      return reply.status(201).send(publicCommunityReportSchema.parse(report));
    },
  );

  app.get<{ Params: { incidentCode: string }; Querystring: { bbox?: string; view?: string } }>(
    "/v1/public/incidents/:incidentCode/community-reports",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      const boundingBox = parseBoundingBox(request.query.bbox);
      if (request.query.bbox !== undefined && !boundingBox) {
        return reply.status(400).send({
          error: "invalid_bbox",
          message: "bbox debe ser 'oesteLng,surLat,esteLng,norteLat' con valores válidos.",
        });
      }
      // `view=map` entrega la proyección ligera y, con ella, **todos** los reportes. El recorte
      // por recencia era lo que hacía desaparecer puntos del mapa cada vez que entraba una
      // ingesta; sin descripción ni metadata caben enteros.
      const mapView = request.query.view === "map";
      const page = await communityReports.listPublicByIncident(incident.id, {
        ...(boundingBox ? { boundingBox } : {}),
        ...(mapView ? { view: "map" as const } : {}),
      });
      return reply
        .header("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60")
        .send({
          reports: mapView
            ? mapCommunityReportSchema.array().parse(page.reports)
            : publicCommunityReportSchema.array().parse(page.reports),
          total: page.total,
        });
    },
  );

  app.get<{ Params: { incidentCode: string; reportId: string } }>(
    "/v1/public/incidents/:incidentCode/community-reports/:reportId",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      const report = await communityReports.findPublicById(incident.id, request.params.reportId);
      if (!report) {
        return reply
          .status(404)
          .send({ error: "resource_not_found", message: "El reporte no existe." });
      }
      return reply
        .header("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300")
        .send(publicCommunityReportSchema.parse(report));
    },
  );

  app.post<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/material-suppliers",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      const input = createMaterialSupplierSchema.parse(request.body);
      const sourceIpHash = request.ip
        ? createHash("sha256").update(`material-supplier:${request.ip}`).digest("hex")
        : null;
      const supplier = await materialSuppliers.create(incident.id, input, { sourceIpHash });
      return reply.status(201).send(publicMaterialSupplierSchema.parse(supplier));
    },
  );

  app.get<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/material-suppliers",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      return reply
        .header("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120")
        .send(
          publicMaterialSupplierSchema
            .array()
            .parse(await materialSuppliers.listPublicByIncident(incident.id)),
        );
    },
  );

  app.post<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/workforce-profiles",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      const input = createWorkforceProfileSchema.parse(request.body);
      const sourceIpHash = request.ip
        ? createHash("sha256").update(`workforce-profile:${request.ip}`).digest("hex")
        : null;
      const profile = await workforceProfiles.create(incident.id, input, { sourceIpHash });
      return reply.status(201).send(publicWorkforceProfileSchema.parse(profile));
    },
  );

  app.get<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/workforce-profiles",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      return reply
        .header("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120")
        .send(
          publicWorkforceProfileSchema
            .array()
            .parse(await workforceProfiles.listPublicByIncident(incident.id)),
        );
    },
  );

  app.get<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/reconstruction-progress",
    async (request, reply) => {
      return reply
        .header("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300")
        .send(
          reconstructionProgressSchema.parse(
            await reconstructionProgress.getByIncidentCode(request.params.incidentCode),
          ),
        );
    },
  );

  // Trazabilidad de recursos públicos (P0).
  //
  // El resumen solo suma contratos cuya relación con la emergencia confirmó una persona, y publica
  // cuántos quedan por revisar. La lista, en cambio, no filtra por defecto: esconder lo no revisado
  // lo volvería invisible y nadie podría revisarlo.
  app.get<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/funds",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      return reply
        .header("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300")
        .send(publicFundsSummarySchema.parse(await publicFunds.summarizeByIncident(incident.id)));
    },
  );

  app.get<{
    Params: { incidentCode: string };
    Querystring: { relevance?: string; territoryCode?: string; limit?: string };
  }>("/v1/public/incidents/:incidentCode/contracts", async (request, reply) => {
    const incident = await incidents.findByCode(request.params.incidentCode);
    if (!incident) {
      return reply
        .status(404)
        .send({ error: "incident_not_found", message: "La emergencia no existe." });
    }
    const relevance = request.query.relevance
      ?.split(",")
      .map((value) => value.trim())
      .filter((value): value is EmergencyRelevance =>
        ["confirmed", "probable", "unrelated", "unreviewed"].includes(value),
      );
    const limit = Number.parseInt(request.query.limit ?? "", 10);
    return reply
      .header("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300")
      .send(
        publicContractSchema.array().parse(
          await publicFunds.listContractsByIncident(incident.id, {
            ...(relevance?.length ? { relevance } : {}),
            ...(request.query.territoryCode ? { territoryCode: request.query.territoryCode } : {}),
            ...(Number.isFinite(limit) ? { limit } : {}),
          }),
        ),
      );
  });

  // Intensidad sísmica por territorio. Va en su propia ruta y no dentro de la capa de daños a
  // propósito: la sacudida modelada no es afectación observada, y mezclarlas haría que un
  // municipio apareciera "con daño severo" sin que nadie haya ido a mirar.
  app.get<{ Params: { incidentCode: string }; Querystring: { level?: string } }>(
    "/v1/public/incidents/:incidentCode/shaking",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      const level = request.query.level === "municipality" ? "municipality" : "department";
      return reply
        .header("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=1800")
        .send(
          territoryShakingSchema
            .array()
            .parse(await seismicShaking.listByIncident(incident.id, { level })),
        );
    },
  );

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

  app.get<{ Params: { actorId: string } }>("/v1/actors/:actorId/trust-profile", async (request) => {
    await requireSelfOrTrustOfficer(
      request.params.actorId,
      request.headers.authorization,
      request.headers["x-pulso-admin-key"],
      request.headers["x-pulso-actor-id"],
    );
    return actorTrustProfileSchema.parse(
      await identityTrust.getTrustProfile(request.params.actorId),
    );
  });

  app.get<{ Params: { actorId: string } }>(
    "/v1/actors/:actorId/identity-claims",
    async (request) => {
      await requireSelfOrTrustOfficer(
        request.params.actorId,
        request.headers.authorization,
        request.headers["x-pulso-admin-key"],
        request.headers["x-pulso-actor-id"],
      );
      return identityClaimSchema
        .array()
        .parse(await identityTrust.listClaims(request.params.actorId));
    },
  );

  app.post<{ Params: { actorId: string } }>(
    "/v1/actors/:actorId/identity-claims",
    async (request, reply) => {
      await requireSelfOrTrustOfficer(
        request.params.actorId,
        request.headers.authorization,
        request.headers["x-pulso-admin-key"],
        request.headers["x-pulso-actor-id"],
      );
      const input = createIdentityClaimSchema.parse(request.body);
      return reply
        .status(201)
        .send(
          identityClaimSchema.parse(await identityTrust.createClaim(request.params.actorId, input)),
        );
    },
  );

  app.get<{ Params: { actorId: string } }>(
    "/v1/actors/:actorId/identity-verifications",
    async (request) => {
      await requireSelfOrTrustOfficer(
        request.params.actorId,
        request.headers.authorization,
        request.headers["x-pulso-admin-key"],
        request.headers["x-pulso-actor-id"],
      );
      return identityVerificationSchema
        .array()
        .parse(await identityTrust.listVerifications(request.params.actorId));
    },
  );

  app.post<{ Params: { actorId: string; claimId: string } }>(
    "/v1/actors/:actorId/identity-claims/:claimId/verifications",
    async (request, reply) => {
      const verifierId = await requireTrustOfficer(
        request.params.actorId,
        request.headers["x-pulso-admin-key"],
        request.headers["x-pulso-actor-id"],
      );
      const input = verifyIdentityClaimSchema.parse(request.body);
      return reply
        .status(201)
        .send(
          identityVerificationSchema.parse(
            await identityTrust.verifyClaim(
              request.params.actorId,
              request.params.claimId,
              verifierId,
              input,
            ),
          ),
        );
    },
  );

  app.get<{ Params: { actorId: string } }>("/v1/actors/:actorId/endorsements", async (request) => {
    await requireSelfOrTrustOfficer(
      request.params.actorId,
      request.headers.authorization,
      request.headers["x-pulso-admin-key"],
      request.headers["x-pulso-actor-id"],
    );
    return actorEndorsementSchema
      .array()
      .parse(await identityTrust.listEndorsements(request.params.actorId));
  });

  app.post<{ Params: { actorId: string } }>(
    "/v1/actors/:actorId/endorsements",
    async (request, reply) => {
      const issuerId = await requireTrustOfficer(
        request.params.actorId,
        request.headers["x-pulso-admin-key"],
        request.headers["x-pulso-actor-id"],
      );
      const input = createActorEndorsementSchema.parse(request.body);
      return reply
        .status(201)
        .send(
          actorEndorsementSchema.parse(
            await identityTrust.createEndorsement(request.params.actorId, issuerId, input),
          ),
        );
    },
  );

  app.get<{ Params: { actorId: string } }>(
    "/v1/actors/:actorId/professional-credentials",
    async (request) => {
      await requireSelfOrTrustOfficer(
        request.params.actorId,
        request.headers.authorization,
        request.headers["x-pulso-admin-key"],
        request.headers["x-pulso-actor-id"],
      );
      return professionalCredentialSchema
        .array()
        .parse(await identityTrust.listProfessionalCredentials(request.params.actorId));
    },
  );

  app.post<{ Params: { actorId: string } }>(
    "/v1/actors/:actorId/professional-credentials",
    async (request, reply) => {
      const verifierId = await requireTrustOfficer(
        request.params.actorId,
        request.headers["x-pulso-admin-key"],
        request.headers["x-pulso-actor-id"],
      );
      const input = createProfessionalCredentialSchema.parse(request.body);
      return reply
        .status(201)
        .send(
          professionalCredentialSchema.parse(
            await identityTrust.addProfessionalCredential(
              request.params.actorId,
              verifierId,
              input,
            ),
          ),
        );
    },
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

  app.post<{ Params: { incidentId: string } }>(
    "/v1/incidents/:incidentId/operations-access/invitations",
    async (request, reply) => {
      const issuedBy = await requireOperationsIssuer(
        request.params.incidentId,
        request.headers["x-pulso-admin-key"],
        request.headers["x-pulso-actor-id"],
      );
      const input = createOperationsInvitationSchema.parse(request.body);
      return reply
        .status(201)
        .send(
          issuedOperationsInvitationSchema.parse(
            await operationsAccess.issueInvitation(
              request.params.incidentId,
              input,
              siteUrl,
              issuedBy,
            ),
          ),
        );
    },
  );

  app.post("/v1/operations-access/redeem", async (request, reply) => {
    const input = redeemOperationsInvitationSchema.parse(request.body);
    return reply
      .status(201)
      .send(
        operationsSessionSchema.parse(await operationsAccess.redeemInvitation(input, request.ip)),
      );
  });

  app.get<{ Params: { incidentId: string } }>(
    "/v1/operations/incidents/:incidentId/assessment-summary",
    async (request) => {
      const session = await operationsAccess.resolveSession(
        bearerToken(request.headers.authorization),
      );
      if (session.incidentId !== request.params.incidentId) {
        throw new MissionAccessDeniedError("La sesión pertenece a otra emergencia.");
      }
      return assessmentSummarySchema.parse(
        await assessments.summarizeIncident(request.params.incidentId),
      );
    },
  );

  app.get<{ Params: { incidentId: string } }>(
    "/v1/operations/incidents/:incidentId/community-reports",
    async (request) => {
      const session = await operationsAccess.resolveSession(
        bearerToken(request.headers.authorization),
      );
      if (session.incidentId !== request.params.incidentId) {
        throw new MissionAccessDeniedError("La sesión pertenece a otra emergencia.");
      }
      return communityReportSchema
        .array()
        .parse(await communityReports.listByIncident(request.params.incidentId));
    },
  );

  app.get<{ Params: { incidentId: string } }>(
    "/v1/operations/incidents/:incidentId/workforce-profiles",
    async (request) => {
      const session = await operationsAccess.resolveSession(
        bearerToken(request.headers.authorization),
      );
      if (session.incidentId !== request.params.incidentId) {
        throw new MissionAccessDeniedError("La sesión pertenece a otra emergencia.");
      }
      return operationsWorkforceProfileSchema
        .array()
        .parse(await workforceProfiles.listByIncident(request.params.incidentId));
    },
  );

  // Cola de revisión de contratos.
  //
  // Es la pieza que le falta al resumen público para dejar de mostrar ceros: el clasificador
  // automático nunca confirma, así que sin una persona que decida aquí, ningún peso llega a
  // publicarse como gasto de emergencia.
  app.get<{ Params: { incidentId: string }; Querystring: { all?: string; limit?: string } }>(
    "/v1/operations/incidents/:incidentId/contracts",
    async (request) => {
      const session = await operationsAccess.resolveSession(
        bearerToken(request.headers.authorization),
      );
      if (session.incidentId !== request.params.incidentId) {
        throw new MissionAccessDeniedError("La sesión pertenece a otra emergencia.");
      }
      const limit = Number.parseInt(request.query.limit ?? "", 10);
      return operationsContractSchema.array().parse(
        await publicFunds.listContractsForReview(request.params.incidentId, {
          pendingOnly: request.query.all !== "true",
          ...(Number.isFinite(limit) ? { limit } : {}),
        }),
      );
    },
  );

  app.post<{ Params: { incidentId: string; contractId: string } }>(
    "/v1/operations/incidents/:incidentId/contracts/:contractId/review",
    async (request) => {
      const session = await operationsAccess.resolveSession(
        bearerToken(request.headers.authorization),
      );
      if (session.incidentId !== request.params.incidentId) {
        throw new MissionAccessDeniedError("La sesión pertenece a otra emergencia.");
      }
      if (!["coordinator", "incident_admin"].includes(session.role)) {
        throw new MissionAccessDeniedError(
          "Este rol no puede decidir la relevancia de un contrato.",
        );
      }
      const input = reviewContractSchema.parse(request.body);
      return operationsContractSchema.parse(
        await publicFunds.reviewContract(request.params.contractId, session.actorId, input),
      );
    },
  );

  app.post<{ Params: { incidentId: string; reportId: string } }>(
    "/v1/operations/incidents/:incidentId/community-reports/:reportId/review",
    async (request) => {
      const session = await operationsAccess.resolveSession(
        bearerToken(request.headers.authorization),
      );
      if (session.incidentId !== request.params.incidentId) {
        throw new MissionAccessDeniedError("La sesión pertenece a otra emergencia.");
      }
      if (!["coordinator", "incident_admin"].includes(session.role)) {
        throw new MissionAccessDeniedError("Este rol no puede corroborar reportes ciudadanos.");
      }
      const input = reviewCommunityReportSchema.parse(request.body);
      return communityReportSchema.parse(
        await communityReports.review(request.params.reportId, session.actorId, input),
      );
    },
  );

  app.post("/v1/field-access/redeem", async (request, reply) => {
    const input = redeemMissionInvitationSchema.parse(request.body);
    const session = fieldSessionSchema.parse(
      await missionAccess.redeemInvitation(input, request.ip),
    );
    return reply.status(201).send(session);
  });

  app.post("/v1/field-assessments", async (request, reply) => {
    const session = await missionAccess.resolveSession(bearerToken(request.headers.authorization));
    const input = createRapidAssessmentSchema.parse(request.body);
    const assessment = await assessments.create(
      {
        incidentId: session.mission.incidentId,
        assignmentId: session.mission.assignmentId,
        zoneId: session.mission.zoneId,
        teamId: session.mission.teamId,
        actorId: session.actorId,
      },
      input,
    );
    return reply.status(201).send(rapidAssessmentSchema.parse(assessment));
  });

  app.get("/v1/field-assessments", async (request) => {
    const session = await missionAccess.resolveSession(bearerToken(request.headers.authorization));
    return rapidAssessmentSchema
      .array()
      .parse(await assessments.listByAssignment(session.mission.assignmentId));
  });

  app.get("/v1/field-assessment-summary", async (request) => {
    const session = await missionAccess.resolveSession(bearerToken(request.headers.authorization));
    return assessmentSummarySchema.parse(
      await assessments.summarizeAssignment(
        session.mission.incidentId,
        session.mission.assignmentId,
      ),
    );
  });

  app.post("/v1/field-evidence", async (request, reply) => {
    const session = await missionAccess.resolveSession(bearerToken(request.headers.authorization));
    const input = createFieldEvidenceSchema.parse(request.body);
    const stored = await evidence.create(
      {
        incidentId: session.mission.incidentId,
        assignmentId: session.mission.assignmentId,
        zoneId: session.mission.zoneId,
        teamId: session.mission.teamId,
        actorId: session.actorId,
      },
      input,
    );
    return reply.status(201).send(fieldEvidenceSchema.parse(stored));
  });

  app.get("/v1/field-evidence", async (request) => {
    const session = await missionAccess.resolveSession(bearerToken(request.headers.authorization));
    return fieldEvidenceSchema
      .array()
      .parse(await evidence.listByAssignment(session.mission.assignmentId));
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
