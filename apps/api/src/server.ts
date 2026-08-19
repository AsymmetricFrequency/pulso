import postgres from "postgres";
import { buildApp } from "./app.js";
import { DiscordClient, discordConfigFromEnv } from "./discord.js";
import { PostgresAdminRepository } from "./postgres-admin-repository.js";
import { createPostgresRepositories } from "./postgres-repositories.js";

const port = Number.parseInt(process.env.API_PORT ?? "3001", 10);
const host = process.env.API_HOST ?? "0.0.0.0";
const persistenceDriver = process.env.PERSISTENCE_DRIVER ?? "memory";
const databaseUrl = process.env.DATABASE_URL;
const missionInvitationSecret = process.env.MISSION_INVITATION_SECRET;
const identityFingerprintSecret = process.env.IDENTITY_FINGERPRINT_SECRET;

/**
 * Clave dedicada al cifrado de datos personales del censo comunitario.
 *
 * Si falta, se cae al secreto de invitaciones —para que un despliegue sin la variable siga
 * funcionando— pero se avisa en el arranque. Una degradación silenciosa de seguridad es peor que
 * una ruidosa: la ruidosa se arregla.
 */
const piiEncryptionKey = process.env.PII_ENCRYPTION_KEY;
if (!piiEncryptionKey && process.env.NODE_ENV === "production") {
  console.warn(
    "[pulso] PII_ENCRYPTION_KEY no está definida: los datos personales del censo se están " +
      "cifrando con la clave de invitaciones. Funciona, pero une dos sistemas que no deberían " +
      "caer juntos. Genera una con: openssl rand -base64 48",
  );
}
const missionAdminKey = process.env.MISSION_ADMIN_KEY;
if (
  process.env.NODE_ENV === "production" &&
  (!missionInvitationSecret || !identityFingerprintSecret || !missionAdminKey)
) {
  throw new Error(
    "MISSION_INVITATION_SECRET, IDENTITY_FINGERPRINT_SECRET and MISSION_ADMIN_KEY are required in production",
  );
}
if (persistenceDriver === "postgres" && !databaseUrl) {
  throw new Error("DATABASE_URL is required when PERSISTENCE_DRIVER=postgres");
}

const postgresRepositories =
  persistenceDriver === "postgres" && databaseUrl
    ? createPostgresRepositories(
        databaseUrl,
        missionInvitationSecret ?? "pulso-local-invitation-secret-change-me-2026",
        identityFingerprintSecret ?? "pulso-local-identity-fingerprint-secret-2026",
        piiEncryptionKey ??
          missionInvitationSecret ??
          "pulso-local-invitation-secret-change-me-2026",
      )
    : undefined;
/**
 * Panel administrativo.
 *
 * Es opcional en los tres frentes y a propósito: sin Postgres, sin credenciales de Discord, o sin
 * secreto de sesión, la API arranca igual y `/v1/admin/*` responde 503 diciendo qué falta. En una
 * emergencia, una herramienta interna a medio configurar no puede impedir que la API pública
 * levante — el panel sirve para mirar la operación, no para que la operación exista.
 */
const discordConfig = discordConfigFromEnv();
const adminSessionSecret = process.env.ADMIN_SESSION_SECRET;
const adminSql =
  databaseUrl && adminSessionSecret && adminSessionSecret.length >= 32
    ? postgres(databaseUrl, { max: 4 })
    : null;
const adminRepository =
  adminSql && adminSessionSecret ? new PostgresAdminRepository(adminSql, adminSessionSecret) : null;
const discordClient = discordConfig ? new DiscordClient(discordConfig) : null;

const app = await buildApp({
  /**
   * El registrador **tacha** los campos personales antes de escribirlos.
   *
   * Hoy Fastify no registra los cuerpos de las peticiones, así que nada se está filtrando. Esto no
   * arregla una fuga: impide la que llegaría el día que alguien suba el nivel de detalle del
   * registro para depurar algo y se lleve por delante los teléfonos de doscientas familias sin
   * enterarse. Una protección que depende de que nadie toque una opción no es una protección.
   *
   * `censor` dice qué se tachó en vez de borrar la clave: un registro con huecos silenciosos se
   * lee como si el dato no hubiera venido.
   */
  logger: {
    redact: {
      paths: [
        "req.body.contactName",
        "req.body.contactPhone",
        "req.body.document",
        "req.body.contact",
        "req.headers.authorization",
        "req.headers.cookie",
        'req.headers["x-admin-key"]',
      ],
      censor: "[tachado: dato personal]",
    },
  },
  adminPanelUrl: process.env.ADMIN_PANEL_URL ?? "http://localhost:3000",
  ...(adminRepository ? { adminRepository } : {}),
  ...(discordClient ? { discordClient } : {}),
  persistence: postgresRepositories ? "postgres" : "memory",
  missionInvitationSecret:
    missionInvitationSecret ?? "pulso-local-invitation-secret-change-me-2026",
  missionAdminKey: missionAdminKey ?? "pulso-local-admin",
  identityFingerprintSecret:
    identityFingerprintSecret ?? "pulso-local-identity-fingerprint-secret-2026",
  siteUrl: process.env.SITE_URL ?? "http://localhost:3000",
  webauthnRpId: process.env.WEBAUTHN_RP_ID ?? "localhost",
  webauthnOrigin: process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000",
  ...(postgresRepositories
    ? {
        incidentRepository: postgresRepositories.incidents,
        assessmentRepository: postgresRepositories.assessments,
        communityReportRepository: postgresRepositories.communityReports,
        evidenceRepository: postgresRepositories.evidence,
        identityTrustRepository: postgresRepositories.identityTrust,
        materialSupplierRepository: postgresRepositories.materialSuppliers,
        missionAccessRepository: postgresRepositories.missionAccess,
        operationsAccessRepository: postgresRepositories.operationsAccess,
        operationsRepository: postgresRepositories.operations,
        publicFundsRepository: postgresRepositories.publicFunds,
        seismicShakingRepository: postgresRepositories.seismicShaking,
        censusCoverageRepository: postgresRepositories.censusCoverage,
        aidTraceabilityRepository: postgresRepositories.aidTraceability,
        householdRegistryRepository: postgresRepositories.householdRegistry,
        dataControllerRepository: postgresRepositories.dataController,
        aidDeliveryRepository: postgresRepositories.aidDeliveries,
        remoteDamageRepository: postgresRepositories.remoteDamage,
        publicReportRepository: postgresRepositories.publicReports,
        caliPublicSourceRepository: postgresRepositories.caliPublicSource,
        reconstructionProgressRepository: postgresRepositories.reconstructionProgress,
        sgcPublicSourceRepository: postgresRepositories.sgcPublicSource,
        territoryRepository: postgresRepositories.territories,
        workforceProfileRepository: postgresRepositories.workforceProfiles,
      }
    : {}),
});

if (postgresRepositories) {
  app.addHook("onClose", async () => postgresRepositories.close());
}
if (adminSql) {
  app.addHook("onClose", async () => adminSql.end());
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Stopping API");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host, port });
