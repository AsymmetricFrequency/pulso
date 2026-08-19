import type { DataControllerRepository } from "@pulso/domain";
import type { DataController } from "@pulso/schemas";
import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

/**
 * Lo que se responde cuando no hay base o la tabla está vacía.
 *
 * **Dice la verdad en vez de fingir una figura jurídica.** Una política que declara un responsable
 * que no existe es peor que una que reconoce que el proyecto todavía es voluntario: la primera
 * engaña a quien confía en ella, la segunda solo le dice dónde está parado.
 */
const FALLBACK: DataController = {
  version: 0,
  legalName: "Pulso — proyecto voluntario de respuesta a la emergencia",
  taxId: null,
  legalForm: "proyecto_voluntario",
  address: null,
  city: null,
  country: "Colombia",
  email: "vortexlabcol@gmail.com",
  phone: null,
  privacyContact: "Equipo responsable del proyecto Pulso",
  legallyConstituted: false,
  effectiveFrom: new Date(0).toISOString(),
};

export class PostgresDataControllerRepository implements DataControllerRepository {
  constructor(private readonly sql: Sql) {}

  async current(): Promise<DataController> {
    // La versión más alta que ya entró en vigencia. Permite dejar preparada la fila de la fundación
    // con una fecha futura y que empiece a regir sola, sin desplegar nada ese día.
    const [row] = await this.sql<Record<string, unknown>[]>`
      SELECT version, legal_name, tax_id, legal_form, address, city, country, email, phone,
             privacy_contact, legally_constituted, effective_from
      FROM data_controllers
      WHERE effective_from <= now()
      ORDER BY version DESC
      LIMIT 1
    `;
    if (!row) return FALLBACK;

    return {
      version: Number(row.version),
      legalName: String(row.legal_name),
      taxId: (row.tax_id as string | null) ?? null,
      legalForm: row.legal_form as DataController["legalForm"],
      address: (row.address as string | null) ?? null,
      city: (row.city as string | null) ?? null,
      country: String(row.country),
      email: String(row.email),
      phone: (row.phone as string | null) ?? null,
      privacyContact: String(row.privacy_contact),
      legallyConstituted: row.legally_constituted === true,
      effectiveFrom:
        row.effective_from instanceof Date
          ? row.effective_from.toISOString()
          : new Date(0).toISOString(),
    };
  }
}

export class FallbackDataControllerRepository implements DataControllerRepository {
  async current(): Promise<DataController> {
    return FALLBACK;
  }
}
