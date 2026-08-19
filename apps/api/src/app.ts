import { createHash } from "node:crypto";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import {
  type AidDeliveryRepository,
  type RemoteDamageRepository,
  type AidTraceabilityRepository,
  AssessmentNotFoundError,
  type AssessmentRepository,
  type CensusCoverageRepository,
  type CommunityReportBoundingBox,
  CommunityReportNotFoundError,
  CommunityReportRateLimitError,
  type CommunityReportRepository,
  ContractNotFoundError,
  type DataControllerRepository,
  EvidenceAssessmentNotFoundError,
  EvidenceIntegrityError,
  type EvidenceRepository,
  FieldVisitConflictError,
  FieldVisitNotFoundError,
  type HouseholdRegistryRepository,
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
  aidDeliveryCoverageSchema,
  remoteDamageResponseSchema,
  aidTraceabilitySchema,
  assessmentSummarySchema,
  beginPasskeyAuthenticationSchema,
  censusCoverageRowSchema,
  censusCoverageSummarySchema,
  communityReportSchema,
  completeFieldVisitSchema,
  confirmDeliverySchema,
  coverageEventSchema,
  createActorEndorsementSchema,
  createActorSchema,
  createCommunityReportSchema,
  createCoverageEventSchema,
  createFieldAssignmentSchema,
  createFieldEvidenceSchema,
  createFieldVisitSchema,
  createHouseholdDeliverySchema,
  createHouseholdRegistrationSchema,
  createIdentityClaimSchema,
  createIncidentSchema,
  createMaterialSupplierSchema,
  createMissionInvitationSchema,
  createOperationalZoneSchema,
  createOperationsInvitationSchema,
  createOrganizationSchema,
  createProfessionalCredentialSchema,
  createRapidAssessmentSchema,
  createRegistrationEvidenceSchema,
  createTeamMembershipSchema,
  createTeamSchema,
  createWorkforceProfileSchema,
  dataControllerSchema,
  type EmergencyRelevance,
  fieldAssignmentSchema,
  fieldEvidenceSchema,
  fieldSessionSchema,
  fieldVisitSchema,
  householdDeliverySchema,
  householdRegistrationReceiptSchema,
  householdRegistryStatsSchema,
  identityClaimSchema,
  identityVerificationSchema,
  incidentListSchema,
  incidentSchema,
  issuedMissionInvitationSchema,
  issuedOperationsInvitationSchema,
  mapCommunityReportSchema,
  moveCommunityReportSchema,
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
  registrationQueueItemSchema,
  reviewCommunityReportSchema,
  reviewContractSchema,
  reviewRegistrationSchema,
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
import Fastify, { type FastifyServerOptions } from "fastify";
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
import { EmptyAidDeliveryRepository } from "./postgres-aid-delivery-repository.js";
import { EmptyRemoteDamageRepository } from "./empty-remote-damage-repository.js";
import { EmptyAidTraceabilityRepository } from "./postgres-aid-traceability-repository.js";
import { EmptyCensusCoverageRepository } from "./postgres-census-coverage-repository.js";
import { FallbackDataControllerRepository } from "./postgres-data-controller-repository.js";
import { EmptyHouseholdRegistryRepository } from "./postgres-household-registry-repository.js";
import { EmptySeismicShakingRepository } from "./postgres-seismic-shaking-repository.js";
import { PublicReadCache } from "./public-read-cache.js";
import { rescueAlertMessage } from "./rescue-alert.js";
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
  censusCoverageRepository?: CensusCoverageRepository;
  aidTraceabilityRepository?: AidTraceabilityRepository;
  aidDeliveryRepository?: AidDeliveryRepository;
  remoteDamageRepository?: RemoteDamageRepository;
  householdRegistryRepository?: HouseholdRegistryRepository;
  dataControllerRepository?: DataControllerRepository;
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
  /**
   * `true` para el registrador por omisión, o la configuración completa de Fastify — que es como se
   * pasa el tachado de los campos personales. Ver `server.ts`.
   */
  logger?: FastifyServerOptions["logger"];
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
  const censusCoverage = options.censusCoverageRepository ?? new EmptyCensusCoverageRepository();
  const aidTraceability = options.aidTraceabilityRepository ?? new EmptyAidTraceabilityRepository();
  const householdRegistry =
    options.householdRegistryRepository ?? new EmptyHouseholdRegistryRepository();
  const dataController = options.dataControllerRepository ?? new FallbackDataControllerRepository();
  const aidDeliveries = options.aidDeliveryRepository ?? new EmptyAidDeliveryRepository();
  const remoteDamage = options.remoteDamageRepository ?? new EmptyRemoteDamageRepository();
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

  /**
   * **Va antes de registrar el plugin, y el orden no es cosmético.** `@fastify/rate-limit` instala
   * su propio gancho `onRoute` al registrarse, y los ganchos corren en orden de registro: si este
   * se añade después, el plugin lee la configuración de la ruta antes de que exista y no aplica
   * nada. El síntoma es peor que un error — la API responde igual, sin límite y sin decirlo.
   */
  /**
   * Aplica el límite a **toda** ruta pública de lectura, presente y futura.
   *
   * Ponerlo ruta por ruta se ve más explícito y es peor: hay una docena de rutas públicas, y la
   * siguiente que alguien añada se quedaría fuera sin que nadie lo note. El gancho no se olvida.
   *
   * Solo `GET`. La creación de reportes tiene su propio límite y sumarle otro por encima podría
   * dejar sin avisar a alguien que está de pie al lado de un derrumbe.
   */
  app.addHook("onRoute", (routeOptions) => {
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    if (!routeOptions.url.startsWith("/v1/public/")) return;
    if (!methods.every((method) => method === "GET" || method === "HEAD")) return;
    routeOptions.config = {
      ...(routeOptions.config ?? {}),
      rateLimit: { max: 240, timeWindow: "1 minute" },
    };
  });

  /**
   * Límite de tasa en las rutas públicas de **lectura**. Cierra `PL-10`.
   *
   * **El número sale de medir, no de la intuición**, que es lo que pedía el ticket. Medido contra
   * producción el 18/08: una visita completa hace unas 4 peticiones y se lleva ~2,4 MB. 240 por
   * minuto deja unas 60 visitas por minuto desde una misma dirección — de sobra para un edificio,
   * una universidad o un barrio entero detrás del mismo NAT, que es el riesgo real de apretar de
   * más: dejar sin mapa a mucha gente por castigar a una.
   *
   * Frena lo que tiene que frenar —un raspador desde una IP— y no toca a nadie normal. Lo que de
   * verdad sostiene un pico de tráfico es la caché de más abajo, no esto.
   *
   * **La creación de reportes queda fuera a propósito.** Ya tiene su propio límite (5 cada 10
   * minutos, en `access_rate_limits`), y sumarle otro por encima significaría que alguien de pie al
   * lado de un derrumbe, en un barrio entero detrás de un mismo NAT, no puede avisar. Ahí el riesgo
   * de bloquear a una persona real supera al del abuso.
   */
  await app.register(rateLimit, {
    global: false,
    max: 240,
    timeWindow: "1 minute",
    // El mapa tiene que degradar con un mensaje, no quedarse en blanco.
    errorResponseBuilder: (_request, context) => ({
      error: "rate_limited",
      message: `Demasiadas peticiones. Vuelve a intentarlo en ${Math.ceil(context.ttl / 1000)} segundos.`,
      statusCode: 429,
    }),
  });

  /**
   * Caché de las lecturas públicas caras. Ver `public-read-cache.ts` para las mediciones.
   *
   * Quince segundos: bastante para colapsar un pico en una sola consulta, poco para que un rescate
   * recién enviado tarde en aparecer. Las ingestas escriben cada diez minutos; quince segundos no
   * cambian nada de lo que alguien vaya a ver.
   */
  const publicReads = new PublicReadCache(15_000);

  registerAdminRoutes(app, {
    admin: options.adminRepository ?? null,
    discord: options.discordClient ?? null,
    incidentCode: process.env.PULSO_INCIDENT_CODE ?? "colombia-2026",
    panelUrl: adminPanelUrl,
    secureCookies: process.env.NODE_ENV === "production",
    superuserDiscordIds: (process.env.ADMIN_SUPERUSER_DISCORD_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    // Un valor corto no es una credencial, es una invitación a probar combinaciones. Si está mal
    // puesto se ignora en silencio en vez de abrir una puerta débil creyendo que está cerrada.
    breakGlassToken:
      process.env.ADMIN_BREAK_GLASS_TOKEN && process.env.ADMIN_BREAK_GLASS_TOKEN.length >= 32
        ? process.env.ADMIN_BREAK_GLASS_TOKEN
        : null,
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

    // Un error que ya trae su propio código no es un fallo nuestro: es una respuesta que Fastify o
    // un plugin ya decidió. Convertirla en 500 la enmascara — se descubrió porque el 429 del límite
    // de tasa salía como «internal_error», y con él salía igual cualquier 400 o 404 del framework.
    const framework = error as { statusCode?: number; message?: string };
    if (
      typeof framework.statusCode === "number" &&
      framework.statusCode >= 400 &&
      framework.statusCode < 500
    ) {
      return reply.status(framework.statusCode).send({
        error: framework.statusCode === 429 ? "rate_limited" : "request_error",
        message: framework.message ?? "La solicitud no se pudo atender.",
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

      // El aviso se manda **después** de escribir y **sin esperarlo**.
      //
      // Después, porque un fallo al avisar nunca puede impedir que el reporte se guarde: sería la
      // peor forma posible de perder un rescate. Y sin esperarlo, porque quien reporta está de pie
      // al lado de un derrumbe con mala señal, y no tiene por qué mirar una pantalla girando
      // mientras hablamos con Discord. `alert()` se traga sus propios errores y tiene timeout, así
      // que esta promesa no puede romper nada ni quedarse colgada.
      const alertMessage = options.discordClient
        ? rescueAlertMessage(publicCommunityReportSchema.parse(report), siteUrl)
        : null;
      if (alertMessage) void options.discordClient?.alert(alertMessage);

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
      // La clave incluye la vista y el recorte: son respuestas distintas y mezclarlas serviría el
      // mapa entero a quien pidió un departamento, o al revés.
      const cacheKey = `reports:${incident.id}:${mapView ? "map" : "full"}:${request.query.bbox ?? ""}`;
      const body = await publicReads.get(cacheKey, async () => {
        const page = await communityReports.listPublicByIncident(incident.id, {
          ...(boundingBox ? { boundingBox } : {}),
          ...(mapView ? { view: "map" as const } : {}),
        });
        // Validar el lote con `.parse()` hacía que **una** fila mala dejara sin lista a las 2.300
        // buenas: un importador guardó una necesidad con un texto más largo del que admite el
        // esquema y la ruta entera pasó a devolver `validation_error`. En una emergencia, servir
        // 2.299 puntos vale más que servir cero, así que cada fila se valida sola. Lo que no se
        // hace es esconderlo: las descartadas se cuentan en `unavailable` y se registran con su
        // identificador, porque un punto que desaparece en silencio es peor que uno que falta.
        const schema = mapView ? mapCommunityReportSchema : publicCommunityReportSchema;
        const reports: unknown[] = [];
        let unavailable = 0;
        for (const report of page.reports) {
          const parsed = schema.safeParse(report);
          if (parsed.success) {
            reports.push(parsed.data);
            continue;
          }
          unavailable += 1;
          request.log.error(
            { reportId: (report as { id?: string }).id, issues: parsed.error.issues },
            "Reporte descartado de la lista pública por no pasar su propio esquema",
          );
        }
        return { reports, total: page.total, ...(unavailable > 0 ? { unavailable } : {}) };
      });

      return reply
        .header("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60")
        .type("application/json")
        .send(body);
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

  // Dónde falta censar.
  //
  // Es la pregunta que la Defensoría del Pueblo puso en público el 13 de agosto —«la falta de censo
  // impide saber cuántos son»— y la única parte del censo que Pulso puede responder sin convenio,
  // porque **no necesita el nombre de nadie**: cruza cuánto sacudió (USGS), cuánta señal ciudadana
  // llegó y qué dice la autoridad, todo agregado por municipio.
  //
  // Va por ruta pública y no detrás de sesión a propósito. Un ente de control que quiera verificar
  // esta cifra tiene que poder hacerlo sin pedirnos una cuenta.
  app.get<{
    Params: { incidentCode: string };
    Querystring: { limit?: string; municipality?: string; lat?: string; lon?: string };
  }>("/v1/public/incidents/:incidentCode/census-coverage", async (request, reply) => {
    const incident = await incidents.findByCode(request.params.incidentCode);
    if (!incident) {
      return reply
        .status(404)
        .send({ error: "incident_not_found", message: "La emergencia no existe." });
    }

    // Por coordenada: es la vía de un toque. La ubicación se usa para resolver el municipio y **no
    // se guarda**: entra por la cadena de consulta, sale un municipio, y ahí se acaba.
    const lat = Number.parseFloat(request.query.lat ?? "");
    const lon = Number.parseFloat(request.query.lon ?? "");
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const found = await censusCoverage.findByPoint(incident.id, lat, lon);
      return reply
        .header("Cache-Control", "no-store")
        .send({ municipality: found ? censusCoverageRowSchema.parse(found) : null });
    }

    // Consulta por municipio. La respuesta a «¿qué hago para que me censen?» depende de en cuál
    // estés: en uno con brigadas, esperar sirve; en uno de los que llevan ocho días sin que vaya
    // nadie, ese mismo consejo es decirle a una familia que espere indefinidamente.
    if (request.query.municipality) {
      const found = await censusCoverage.findMunicipality(incident.id, request.query.municipality);
      return reply
        .header("Cache-Control", "public, max-age=300, s-maxage=600")
        .send({ municipality: found ? censusCoverageRowSchema.parse(found) : null });
    }

    const limit = Number.parseInt(request.query.limit ?? "", 10);
    return reply
      .header("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=1800")
      .send(
        censusCoverageSummarySchema.parse(
          await censusCoverage.summaryByIncident(incident.id, request.params.incidentCode, {
            ...(Number.isFinite(limit) ? { limit } : {}),
          }),
        ),
      );
  });

  // Trazabilidad de la ayuda, para quien tenga que auditarla.
  //
  // Contraloría, Procuraduría y Defensoría coinciden en pedir la misma palabra: trazabilidad. Esta
  // ruta la responde eslabón por eslabón —necesidad, asignación, despacho, entrega— y **muestra los
  // eslabones que están en cero**, porque un ente de control necesita poder distinguir «no se
  // entregó ayuda» de «se entregó y no quedó registrada aquí». Un cero escondido convierte la
  // segunda cosa en la primera.
  //
  // Pública y sin sesión, igual que la cobertura del censo: quien audita no debería tener que
  // pedirnos una cuenta para verificar una cifra nuestra.
  app.get<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/aid-traceability",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      return reply
        .header("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=900")
        .send(
          aidTraceabilitySchema.parse(
            await aidTraceability.summaryByIncident(incident.id, request.params.incidentCode),
          ),
        );
    },
  );

  // ===========================================================================
  // Censo comunitario
  // ===========================================================================
  //
  // **Esto no es el Registro Único de Damnificados y no da derecho a ninguna ayuda.** El censo
  // oficial lo diligencia personal autorizado casa a casa. Lo que este registro permite es que un
  // hogar diga «aquí estamos y no ha venido nadie», para entregarle esa lista a su alcaldía.
  //
  // Tres reglas que se cumplen en el código y no solo en el texto de la página:
  // · el consentimiento viaja con la versión del texto que se mostró, y sin él no se inserta nada;
  // · nombre, teléfono y documento se guardan cifrados y **no salen por ninguna ruta pública**;
  // · quien se registra recibe un código con el que puede borrar lo suyo sin pedirle permiso a nadie.
  app.post<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/household-registry",
    {
      // Cinco por hora y por IP. Más bajo que el de reportes a propósito: un hogar se registra una
      // vez, no cada diez minutos, y este formulario guarda datos personales — un abuso aquí cuesta
      // más que un reporte de más en el mapa. Un albergue entero compartiendo una conexión sigue
      // cabiendo: cinco hogares por hora desde el mismo punto es un ritmo realista de digitación.
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      const input = createHouseholdRegistrationSchema.parse(request.body);
      const sourceIpHash = request.ip
        ? createHash("sha256").update(`household-registry:${request.ip}`).digest("hex")
        : null;
      const receipt = await householdRegistry.register(incident.id, input, { sourceIpHash });
      return reply.status(201).send(householdRegistrationReceiptSchema.parse(receipt));
    },
  );

  // El borrado no pide sesión ni identidad: el código **es** la credencial, y exigir una cuenta
  // para ejercer un derecho sobre los datos propios sería ponerle un peaje a ese derecho.
  app.delete<{ Params: { incidentCode: string; code: string } }>(
    "/v1/public/incidents/:incidentCode/household-registry/:code",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      const removed = await householdRegistry.redact(
        incident.id,
        request.params.code.trim().toUpperCase(),
      );
      if (!removed) {
        return reply.status(404).send({
          error: "registration_not_found",
          message: "No encontramos ese código, o sus datos ya fueron borrados.",
        });
      }
      return reply.status(200).send({
        removed: true,
        message:
          "Tus datos personales fueron borrados. El conteo de tu municipio se mantiene sin ellos.",
      });
    },
  );

  app.get<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/household-registry/stats",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      return reply
        .header("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=600")
        .send(
          householdRegistryStatsSchema.parse(
            await householdRegistry.stats(incident.id, request.params.incidentCode),
          ),
        );
    },
  );

  /**
   * Subir la foto del daño. **Sin sesión y sin cuenta**: el código público es la credencial.
   *
   * Quien tiene el código puede añadir evidencia a **su** registro y a ningún otro — son ocho
   * caracteres aleatorios, así que no se llega a un registro ajeno adivinando. Exigir una cuenta
   * para aportar la prueba de tu propio daño sería ponerle un peaje a lo que más nos sirve.
   *
   * La foto es la vía universal: funciona igual para propietario, arrendatario y ocupante, que es
   * por lo que la evidencia no se apoya en papeles de propiedad.
   */
  app.post<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/household-registry/evidence",
    {
      // Diez fotos por hora y por IP. Un hogar sube dos o tres; diez cabe de sobra para una familia
      // con varias viviendas afectadas y corta en seco a quien quiera llenar la base de imágenes.
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      const input = createRegistrationEvidenceSchema.parse(request.body);
      const result = await householdRegistry.addEvidence(incident.id, input);
      if (!result.stored) {
        return reply.status(404).send({
          error: "registration_not_found",
          message: "No encontramos ese código, o la imagen no se pudo leer.",
        });
      }
      return reply.status(201).send({
        stored: true,
        // Se devuelve si de verdad se pudieron quitar los metadatos. No se traga en silencio: una
        // foto sin limpiar es una foto que puede llevar la coordenada exacta de una casa.
        metadataRemoved: result.stripped,
      });
    },
  );

  // ===========================================================================
  // La cola de quien audita
  // ===========================================================================
  //
  // Cierra `censar → validar → auditar`. Lo automático produjo señales; aquí una persona
  // identificada decide y firma.
  app.get<{
    Params: { incidentId: string };
    Querystring: { signal?: string; limit?: string };
  }>("/v1/operations/incidents/:incidentId/registry-queue", async (request) => {
    const session = await operationsAccess.resolveSession(
      bearerToken(request.headers.authorization),
    );
    if (session.incidentId !== request.params.incidentId) {
      throw new MissionAccessDeniedError("La sesión pertenece a otra emergencia.");
    }
    // `auditor` entra aquí y no en las rutas que cambian datos: existe para mirar y dejar
    // constancia, que es exactamente lo que un ente de control necesita poder hacer.
    if (!["coordinator", "auditor", "incident_admin"].includes(session.role)) {
      throw new MissionAccessDeniedError("Este rol no puede ver la cola del censo comunitario.");
    }
    const limit = Number.parseInt(request.query.limit ?? "", 10);
    return registrationQueueItemSchema.array().parse(
      await householdRegistry.queue(request.params.incidentId, {
        ...(request.query.signal ? { signal: request.query.signal } : {}),
        ...(Number.isFinite(limit) ? { limit } : {}),
      }),
    );
  });

  app.post<{ Params: { incidentId: string; registrationId: string } }>(
    "/v1/operations/incidents/:incidentId/registry-queue/:registrationId/review",
    async (request, reply) => {
      const session = await operationsAccess.resolveSession(
        bearerToken(request.headers.authorization),
      );
      if (session.incidentId !== request.params.incidentId) {
        throw new MissionAccessDeniedError("La sesión pertenece a otra emergencia.");
      }
      if (!["coordinator", "auditor", "incident_admin"].includes(session.role)) {
        throw new MissionAccessDeniedError("Este rol no puede auditar registros.");
      }
      const input = reviewRegistrationSchema.parse(request.body);
      const done = await householdRegistry.review(
        request.params.incidentId,
        request.params.registrationId,
        session.actorId,
        input,
      );
      if (!done) {
        return reply.status(404).send({
          error: "registration_not_found",
          message: "Ese registro no existe o ya fue borrado a petición de la persona.",
        });
      }
      return reply.status(201).send({ reviewed: true });
    },
  );

  /**
   * Ver una foto del daño, siendo auditor.
   *
   * **El propósito es obligatorio y viaja en la consulta.** No es burocracia: sin él, el registro de
   * accesos diría quién miró la casa de una familia y no diría para qué, que es lo único que se
   * pregunta cuando alguien revisa esos accesos después.
   *
   * La lectura y la anotación ocurren en la misma transacción, así que no existe el caso de «la vio
   * pero no quedó registrado».
   */
  app.get<{
    Params: { incidentId: string; evidenceId: string };
    Querystring: { purpose?: string };
  }>(
    "/v1/operations/incidents/:incidentId/registry-evidence/:evidenceId",
    async (request, reply) => {
      const session = await operationsAccess.resolveSession(
        bearerToken(request.headers.authorization),
      );
      if (session.incidentId !== request.params.incidentId) {
        throw new MissionAccessDeniedError("La sesión pertenece a otra emergencia.");
      }
      if (!["coordinator", "auditor", "incident_admin"].includes(session.role)) {
        throw new MissionAccessDeniedError(
          "Este rol no puede ver evidencia del censo comunitario.",
        );
      }

      const purpose = (request.query.purpose ?? "").trim();
      if (purpose.length < 8) {
        return reply.status(400).send({
          error: "purpose_required",
          message:
            "Escribe para qué estás mirando esta foto. Queda registrado junto a tu nombre, con al menos 8 caracteres.",
        });
      }

      const found = await householdRegistry.readEvidence(
        request.params.incidentId,
        request.params.evidenceId,
        { actorId: session.actorId, actorRole: session.role, purpose },
      );
      if (!found) {
        return reply.status(404).send({
          error: "evidence_not_found",
          message: "Esa evidencia no existe o fue borrada a petición de la persona.",
        });
      }

      return (
        reply
          .header("Content-Type", found.contentType)
          // Nunca en caché de nadie: una foto de la casa de una familia no puede quedarse en un
          // proxy intermedio ni en el disco del navegador de quien la revisó.
          .header("Cache-Control", "no-store, private")
          .header("X-Pulso-Exif-Stripped", String(found.exifStripped))
          .send(Buffer.from(found.content))
      );
    },
  );

  /**
   * Quién responde por los datos personales, ahora mismo.
   *
   * Lo sirve la API y no una constante del sitio para que el día que entre la fundación no haya que
   * desplegar la web: es una fila nueva y la página la lee. Y es público a propósito — el art. 13
   * del Decreto 1377 obliga a poner la política en conocimiento de los titulares, y una política que
   * exige sesión para leerse no está en conocimiento de nadie.
   */
  app.get("/v1/public/data-controller", async (_request, reply) =>
    reply
      .header("Cache-Control", "public, max-age=300, s-maxage=900")
      .send(dataControllerSchema.parse(await dataController.current())),
  );

  // ===========================================================================
  // Donación → entrega real
  // ===========================================================================

  /** Registrar que a un hogar le llegó algo. Rol de coordinación. */
  app.post<{ Params: { incidentId: string } }>(
    "/v1/operations/incidents/:incidentId/household-deliveries",
    async (request, reply) => {
      const session = await operationsAccess.resolveSession(
        bearerToken(request.headers.authorization),
      );
      if (session.incidentId !== request.params.incidentId) {
        throw new MissionAccessDeniedError("La sesión pertenece a otra emergencia.");
      }
      if (!["coordinator", "incident_admin"].includes(session.role)) {
        throw new MissionAccessDeniedError("Este rol no puede registrar entregas.");
      }
      const input = createHouseholdDeliverySchema.parse(request.body);
      try {
        const id = await aidDeliveries.record(request.params.incidentId, input);
        if (!id) {
          return reply.status(404).send({
            error: "registration_not_found",
            message: "No encontramos ese código de hogar.",
          });
        }
        return reply.status(201).send({ id });
      } catch (error) {
        // El trigger de finalidad. Se traduce a algo que se entienda en vez de devolver un error de
        // Postgres: quien registra una entrega a las nueve de la noche necesita saber qué hacer.
        const message = error instanceof Error ? error.message : "";
        if (message.includes("entrega_ayuda")) {
          return reply.status(409).send({
            error: "purpose_not_authorized",
            message:
              "Ese hogar no autorizó ser contactado para recibir ayuda. No se puede registrar una entrega a su nombre.",
          });
        }
        throw error;
      }
    },
  );

  /**
   * Lo que un hogar ve con su código, y donde puede **desmentir** una entrega.
   *
   * Sin sesión: el código es la credencial. Y sin él no se toca la entrega de nadie más, porque la
   * comprobación va en el `WHERE` de la consulta y no en una condición del código.
   */
  app.get<{ Params: { incidentCode: string; code: string } }>(
    "/v1/public/incidents/:incidentCode/household-registry/:code/deliveries",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      return reply
        .header("Cache-Control", "no-store, private")
        .send(
          householdDeliverySchema
            .array()
            .parse(await aidDeliveries.listForHousehold(incident.id, request.params.code)),
        );
    },
  );

  app.post<{ Params: { incidentCode: string; code: string; deliveryId: string } }>(
    "/v1/public/incidents/:incidentCode/household-registry/:code/deliveries/:deliveryId/confirm",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      const input = confirmDeliverySchema.parse(request.body);
      const done = await aidDeliveries.confirm(
        incident.id,
        request.params.code,
        request.params.deliveryId,
        input,
      );
      if (!done) {
        return reply
          .status(404)
          .send({ error: "delivery_not_found", message: "No encontramos esa entrega." });
      }
      return reply.status(200).send({ recorded: true, received: input.received });
    },
  );

  app.get<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/aid-delivery-coverage",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      return reply
        .header("Cache-Control", "public, max-age=120, s-maxage=300")
        .send(
          aidDeliveryCoverageSchema.parse(
            await aidDeliveries.coverage(incident.id, request.params.incidentCode),
          ),
        );
    },
  );

  /*
   * Daño visto desde un satélite.
   *
   * Se cachea generoso —una hora— porque no es un flujo: UNOSAT y Microsoft publican una
   * evaluación y la revisan días después, no cada minuto. Y la respuesta trae su propia
   * atribución: CC BY y CC BY-SA la exigen, y quien reutilice esto no debería tener que buscarla
   * en otra página para cumplir la licencia.
   */
  app.get<{ Params: { incidentCode: string } }>(
    "/v1/public/incidents/:incidentCode/remote-damage",
    async (request, reply) => {
      const incident = await incidents.findByCode(request.params.incidentCode);
      if (!incident) {
        return reply
          .status(404)
          .send({ error: "incident_not_found", message: "La emergencia no existe." });
      }
      return reply
        .header("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400")
        .send(remoteDamageResponseSchema.parse(await remoteDamage.publicView(incident.id)));
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

  /**
   * Corregir dónde está un punto. Cierra la mitad durable de `PL-2`.
   *
   * Hasta ahora esto exigía un `psql` en producción, así que solo podía hacerlo quien tuviera acceso
   * al servidor. Con 3.249 puntos venidos de terceros —79 con la coordenada deducida de una
   * dirección escrita— corregir no es un caso raro, es rutina.
   *
   * **Mismo rol que revisar.** Mover un punto cambia a dónde va un equipo; es una decisión del mismo
   * peso que corroborar un reporte, y no tiene por qué poder hacerla cualquiera con sesión.
   */
  app.patch<{ Params: { incidentId: string; reportId: string } }>(
    "/v1/operations/incidents/:incidentId/community-reports/:reportId/location",
    async (request) => {
      const session = await operationsAccess.resolveSession(
        bearerToken(request.headers.authorization),
      );
      if (session.incidentId !== request.params.incidentId) {
        throw new MissionAccessDeniedError("La sesión pertenece a otra emergencia.");
      }
      if (!["coordinator", "incident_admin"].includes(session.role)) {
        throw new MissionAccessDeniedError("Este rol no puede corregir la ubicación de un punto.");
      }
      const input = moveCommunityReportSchema.parse(request.body);
      return communityReportSchema.parse(
        await communityReports.move(request.params.reportId, session.actorId, input),
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
