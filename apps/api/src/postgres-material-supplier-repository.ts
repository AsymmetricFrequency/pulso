import { createHash } from "node:crypto";
import { MaterialSupplierRateLimitError, type MaterialSupplierRepository } from "@pulso/domain";
import type { CreateMaterialSupplierInput, PublicMaterialSupplierDto } from "@pulso/schemas";
import type postgres from "postgres";
import { v7 as uuidv7 } from "uuid";

type DbRow = Record<string, unknown>;

const RATE_LIMIT_MAX_ATTEMPTS = 5;

const supplierFromRow = (row: DbRow): PublicMaterialSupplierDto => ({
  id: String(row.id),
  name: String(row.name),
  location: typeof row.location === "string" ? JSON.parse(row.location) : (row.location as never),
  address: row.address ? String(row.address) : null,
  publicContact: row.public_contact ? String(row.public_contact) : null,
  verificationLevel: row.verification_level as PublicMaterialSupplierDto["verificationLevel"],
  offers: (row.offers as PublicMaterialSupplierDto["offers"] | null) ?? [],
  createdAt: new Date(String(row.created_at)).toISOString(),
});

export class PostgresMaterialSupplierRepository implements MaterialSupplierRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async create(
    incidentId: string,
    input: CreateMaterialSupplierInput,
    context: { sourceIpHash: string | null },
  ): Promise<PublicMaterialSupplierDto> {
    if (context.sourceIpHash) await this.#consumeRateLimit(context.sourceIpHash);

    return this.sql.begin(async (transaction) => {
      const [existing] = await transaction<DbRow[]>`
        SELECT id FROM material_suppliers
        WHERE incident_id = ${incidentId} AND client_mutation_id = ${input.clientMutationId}
        LIMIT 1
      `;
      const supplierId = existing?.id ? String(existing.id) : uuidv7();

      if (!existing) {
        const [territory] = await transaction<DbRow[]>`
          SELECT id FROM territories
          WHERE incident_id = ${incidentId} AND territory_type = 'department'
            AND deleted_at IS NULL
            AND ST_Within(
              ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(input.location)}), 4326),
              geometry
            )
          LIMIT 1
        `;
        const territoryId = territory?.id ? String(territory.id) : null;
        await transaction<DbRow[]>`
          INSERT INTO material_suppliers (
            id, incident_id, territory_id, name, location, address, public_contact,
            client_mutation_id, source_ip_hash
          ) VALUES (
            ${supplierId}, ${incidentId}, ${territoryId}, ${input.name},
            ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(input.location)}), 4326),
            ${input.address}, ${input.publicContact}, ${input.clientMutationId},
            ${context.sourceIpHash}
          )
        `;
        for (const offer of input.offers) {
          const [catalogItem] = await transaction<DbRow[]>`
            SELECT id FROM material_catalog_items WHERE code = ${offer.catalogItemCode} LIMIT 1
          `;
          if (!catalogItem) continue;
          const catalogItemId = String(catalogItem.id);
          await transaction<DbRow[]>`
            INSERT INTO supplier_catalog_offers (
              id, supplier_id, catalog_item_id, unit, unit_price, currency, available_quantity
            ) VALUES (
              ${uuidv7()}, ${supplierId}, ${catalogItemId}, ${offer.unit}, ${offer.unitPrice},
              ${offer.currency}, ${offer.availableQuantity}
            )
          `;
        }
      }

      const [row] = await transaction<DbRow[]>`
        SELECT s.*, ST_AsGeoJSON(s.location)::json AS location,
          coalesce(json_agg(
            json_build_object(
              'catalogItemCode', mci.code,
              'catalogItemName', mci.name,
              'unit', o.unit,
              'unitPrice', o.unit_price,
              'currency', o.currency,
              'availableQuantity', o.available_quantity,
              'status', o.status
            )
          ) FILTER (WHERE o.id IS NOT NULL), '[]') AS offers
        FROM material_suppliers s
        LEFT JOIN supplier_catalog_offers o ON o.supplier_id = s.id
        LEFT JOIN material_catalog_items mci ON mci.id = o.catalog_item_id
        WHERE s.id = ${supplierId}
        GROUP BY s.id
      `;
      if (!row) throw new Error("PostgreSQL did not return the created supplier");
      return supplierFromRow(row);
    });
  }

  async listPublicByIncident(incidentId: string): Promise<PublicMaterialSupplierDto[]> {
    const rows = await this.sql<DbRow[]>`
      SELECT s.*, ST_AsGeoJSON(s.location)::json AS location,
        coalesce(json_agg(
          json_build_object(
            'catalogItemCode', mci.code,
            'catalogItemName', mci.name,
            'unit', o.unit,
            'unitPrice', o.unit_price,
            'currency', o.currency,
            'availableQuantity', o.available_quantity,
            'status', o.status
          )
        ) FILTER (WHERE o.id IS NOT NULL), '[]') AS offers
      FROM material_suppliers s
      LEFT JOIN supplier_catalog_offers o ON o.supplier_id = s.id
      LEFT JOIN material_catalog_items mci ON mci.id = o.catalog_item_id
      WHERE s.incident_id = ${incidentId} AND s.status = 'active'
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 500
    `;
    return rows.map(supplierFromRow);
  }

  async #consumeRateLimit(sourceIpHash: string) {
    const key = createHash("sha256").update(`material-supplier:${sourceIpHash}`).digest("hex");
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
      throw new MaterialSupplierRateLimitError(retryAfter);
    }
  }
}
