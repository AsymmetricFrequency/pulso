import { createHash } from "node:crypto";
import { WorkforceProfileRateLimitError, type WorkforceProfileRepository } from "@pulso/domain";
import type {
  CreateWorkforceProfileInput,
  OperationsWorkforceProfileDto,
  PublicWorkforceProfileDto,
} from "@pulso/schemas";
import type postgres from "postgres";
import { v7 as uuidv7 } from "uuid";
import { decryptField, encryptField, maskDisplayName } from "./field-encryption.js";

type DbRow = Record<string, unknown>;

const RATE_LIMIT_MAX_ATTEMPTS = 5;

export class PostgresWorkforceProfileRepository implements WorkforceProfileRepository {
  constructor(
    private readonly fieldEncryptionSecret: string,
    private readonly sql: postgres.Sql,
  ) {}

  async create(
    incidentId: string,
    input: CreateWorkforceProfileInput,
    context: { sourceIpHash: string | null },
  ): Promise<PublicWorkforceProfileDto> {
    if (context.sourceIpHash) await this.#consumeRateLimit(context.sourceIpHash);

    const [territory] = await this.sql<DbRow[]>`
      SELECT id FROM territories
      WHERE incident_id = ${incidentId} AND external_code = ${input.territoryCode}
        AND deleted_at IS NULL
      LIMIT 1
    `;
    const territoryId = territory?.id ? String(territory.id) : null;

    const displayNameEncrypted = encryptField(this.fieldEncryptionSecret, input.displayName);
    const contactEncrypted = input.contact
      ? encryptField(this.fieldEncryptionSecret, input.contact)
      : null;

    const [row] = await this.sql<DbRow[]>`
      INSERT INTO workforce_profiles (
        id, incident_id, territory_id, role, headcount, notes,
        display_name_encrypted, contact_encrypted,
        client_mutation_id, source_ip_hash
      ) VALUES (
        ${uuidv7()}, ${incidentId}, ${territoryId}, ${input.role}, ${input.headcount},
        ${input.notes}, ${displayNameEncrypted}, ${contactEncrypted},
        ${input.clientMutationId}, ${context.sourceIpHash}
      )
      ON CONFLICT (incident_id, client_mutation_id) DO UPDATE SET incident_id = EXCLUDED.incident_id
      RETURNING *
    `;
    if (!row) throw new Error("PostgreSQL did not return the created workforce profile");
    return this.#toPublic(row, input.territoryCode);
  }

  async listPublicByIncident(incidentId: string): Promise<PublicWorkforceProfileDto[]> {
    const rows = await this.sql<DbRow[]>`
      SELECT w.*, t.external_code AS territory_code
      FROM workforce_profiles w
      LEFT JOIN territories t ON t.id = w.territory_id
      WHERE w.incident_id = ${incidentId} AND w.status = 'active'
      ORDER BY w.created_at DESC
      LIMIT 500
    `;
    return rows.map((row) =>
      this.#toPublic(row, row.territory_code ? String(row.territory_code) : null),
    );
  }

  async listByIncident(incidentId: string): Promise<OperationsWorkforceProfileDto[]> {
    const rows = await this.sql<DbRow[]>`
      SELECT w.*, t.external_code AS territory_code
      FROM workforce_profiles w
      LEFT JOIN territories t ON t.id = w.territory_id
      WHERE w.incident_id = ${incidentId}
      ORDER BY w.created_at DESC
      LIMIT 500
    `;
    return rows.map((row) =>
      this.#toOperations(row, row.territory_code ? String(row.territory_code) : null),
    );
  }

  #decryptName(row: DbRow): string {
    return decryptField(this.fieldEncryptionSecret, row.display_name_encrypted as Buffer);
  }

  #decryptContact(row: DbRow): string | null {
    return row.contact_encrypted
      ? decryptField(this.fieldEncryptionSecret, row.contact_encrypted as Buffer)
      : null;
  }

  #toPublic(row: DbRow, territoryCode: string | null): PublicWorkforceProfileDto {
    return {
      id: String(row.id),
      territoryCode,
      maskedDisplayName: maskDisplayName(this.#decryptName(row)),
      role: row.role as PublicWorkforceProfileDto["role"],
      headcount: Number(row.headcount),
      availability: row.availability as PublicWorkforceProfileDto["availability"],
      verificationLevel: row.verification_level as PublicWorkforceProfileDto["verificationLevel"],
      notes: row.notes ? String(row.notes) : null,
      createdAt: new Date(String(row.created_at)).toISOString(),
    };
  }

  #toOperations(row: DbRow, territoryCode: string | null): OperationsWorkforceProfileDto {
    return {
      ...this.#toPublic(row, territoryCode),
      displayName: this.#decryptName(row),
      contact: this.#decryptContact(row),
    };
  }

  async #consumeRateLimit(sourceIpHash: string) {
    const key = createHash("sha256").update(`workforce-profile:${sourceIpHash}`).digest("hex");
    const [row] = await this.sql<DbRow[]>`
      INSERT INTO access_rate_limits (key_hash, attempts, reset_at)
      VALUES (${key}, 1, now() + interval '10 minutes')
      ON CONFLICT (key_hash) DO UPDATE SET
        attempts = CASE WHEN access_rate_limits.reset_at <= now() THEN 1
          ELSE access_rate_limits.attempts + 1 END,
        reset_at = CASE WHEN access_rate_limits.reset_at <= now()
          THEN now() + interval '10 minutes' ELSE access_rate_limits.reset_at END
      RETURNING attempts, reset_at
    `;
    if (Number(row?.attempts) > RATE_LIMIT_MAX_ATTEMPTS) {
      const retryAfter = Math.max(
        1,
        Math.ceil((new Date(String(row?.reset_at)).getTime() - Date.now()) / 1_000),
      );
      throw new WorkforceProfileRateLimitError(retryAfter);
    }
  }
}
