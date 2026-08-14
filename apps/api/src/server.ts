import { buildApp } from "./app.js";
import { createPostgresRepositories } from "./postgres-repositories.js";

const port = Number.parseInt(process.env.API_PORT ?? "3001", 10);
const host = process.env.API_HOST ?? "0.0.0.0";
const persistenceDriver = process.env.PERSISTENCE_DRIVER ?? "memory";
const databaseUrl = process.env.DATABASE_URL;
const missionInvitationSecret = process.env.MISSION_INVITATION_SECRET;
const identityFingerprintSecret = process.env.IDENTITY_FINGERPRINT_SECRET;
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
      )
    : undefined;
const app = await buildApp({
  logger: true,
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
        evidenceRepository: postgresRepositories.evidence,
        identityTrustRepository: postgresRepositories.identityTrust,
        missionAccessRepository: postgresRepositories.missionAccess,
        operationsRepository: postgresRepositories.operations,
        territoryRepository: postgresRepositories.territories,
      }
    : {}),
});

if (postgresRepositories) {
  app.addHook("onClose", async () => postgresRepositories.close());
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Stopping API");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host, port });
