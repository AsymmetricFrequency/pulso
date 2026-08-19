import { randomUUID } from "node:crypto";
import type { AidDeliveryRepository } from "@pulso/domain";
import type {
  AidDeliveryCoverage,
  ConfirmDeliveryInput,
  CreateHouseholdDeliveryInput,
  HouseholdDelivery,
} from "@pulso/schemas";
import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const asIso = (value: unknown) => (value instanceof Date ? value.toISOString() : null);

export class PostgresAidDeliveryRepository implements AidDeliveryRepository {
  constructor(private readonly sql: Sql) {}

  /**
   * Registra que a un hogar le llegó algo.
   *
   * No comprueba aquí que ese hogar autorizó la finalidad `entrega_ayuda`: lo impone un trigger de
   * la base. La comprobación está donde no se puede rodear, y esta ruta solo traduce el error a
   * algo que se entienda.
   */
  async record(incidentId: string, input: CreateHouseholdDeliveryInput): Promise<string | null> {
    const [registration] = await this.sql<{ id: string }[]>`
      SELECT id FROM household_self_registrations
      WHERE incident_id = ${incidentId}
        AND public_code = ${input.publicCode.trim().toUpperCase()}
        AND redacted_at IS NULL
      LIMIT 1
    `;
    if (!registration) return null;

    const [row] = await this.sql<{ id: string }[]>`
      INSERT INTO household_aid_deliveries (
        id, incident_id, registration_id, description, quantity, unit,
        delivered_by, funding_source, delivered_at
      ) VALUES (
        ${randomUUID()}, ${incidentId}, ${registration.id}, ${input.description},
        ${input.quantity}, ${input.unit}, ${input.deliveredBy}, ${input.fundingSource},
        ${input.deliveredAt}
      )
      RETURNING id
    `;
    return row?.id ?? null;
  }

  /** Lo que un hogar ve al consultar con su código: sus propias entregas, enteras. */
  async listForHousehold(incidentId: string, publicCode: string): Promise<HouseholdDelivery[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT d.id, d.description, d.quantity, d.unit, d.delivered_by, d.funding_source,
             d.confirmation, d.household_note, d.delivered_at
      FROM household_aid_deliveries d
      JOIN household_self_registrations r ON r.id = d.registration_id
      WHERE r.incident_id = ${incidentId}
        AND r.public_code = ${publicCode.trim().toUpperCase()}
        AND r.redacted_at IS NULL
      ORDER BY d.delivered_at DESC
    `;
    return rows.map((row) => ({
      id: String(row.id),
      description: String(row.description),
      quantity: row.quantity === null ? null : Number(row.quantity),
      unit: (row.unit as string | null) ?? null,
      deliveredBy: String(row.delivered_by),
      fundingSource: (row.funding_source as string | null) ?? null,
      confirmation: row.confirmation as HouseholdDelivery["confirmation"],
      householdNote: (row.household_note as string | null) ?? null,
      deliveredAt: asIso(row.delivered_at) ?? new Date(0).toISOString(),
    }));
  }

  /**
   * El hogar confirma o **desmiente** una entrega.
   *
   * El código es la credencial y la comprobación va en el `WHERE`: sin él no se toca una entrega
   * ajena. Un `false` aquí vale más que cien confirmaciones — es la única señal del sistema que no
   * puede venir de quien quiere que la cifra suba.
   */
  async confirm(
    incidentId: string,
    publicCode: string,
    deliveryId: string,
    input: ConfirmDeliveryInput,
  ): Promise<boolean> {
    const rows = await this.sql<{ id: string }[]>`
      UPDATE household_aid_deliveries d SET
        confirmation = ${input.received ? "confirmada" : "rechazada"},
        household_note = ${input.note},
        confirmed_at = now(),
        updated_at = now()
      FROM household_self_registrations r
      WHERE d.registration_id = r.id
        AND d.id = ${deliveryId}
        AND r.incident_id = ${incidentId}
        AND r.public_code = ${publicCode.trim().toUpperCase()}
        AND r.redacted_at IS NULL
      RETURNING d.id
    `;
    return rows.length > 0;
  }

  async coverage(incidentId: string, incidentCode: string): Promise<AidDeliveryCoverage> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT c.* FROM aid_delivery_coverage c
      JOIN territories t ON t.external_code = c.divipola AND t.incident_id = ${incidentId}
      UNION ALL
      SELECT c.* FROM aid_delivery_coverage c WHERE c.divipola IS NULL
    `;

    const totals = rows.reduce<AidDeliveryCoverage["totals"]>(
      (acc, row) => ({
        householdsReached: acc.householdsReached + asNumber(row.households_reached),
        deliveries: acc.deliveries + asNumber(row.deliveries),
        confirmedByHousehold: acc.confirmedByHousehold + asNumber(row.confirmed_by_household),
        independentlyVerified: acc.independentlyVerified + asNumber(row.independently_verified),
        disputedByHousehold: acc.disputedByHousehold + asNumber(row.disputed_by_household),
        onlyDeclared: acc.onlyDeclared + asNumber(row.only_declared),
        tracedToContract: acc.tracedToContract + asNumber(row.traced_to_contract),
      }),
      {
        householdsReached: 0,
        deliveries: 0,
        confirmedByHousehold: 0,
        independentlyVerified: 0,
        disputedByHousehold: 0,
        onlyDeclared: 0,
        tracedToContract: 0,
      },
    );

    return {
      incidentCode,
      totals,
      byTerritory: rows.map((row) => ({
        divipola: (row.divipola as string | null) ?? null,
        municipality: (row.municipality as string | null) ?? null,
        householdsReached: asNumber(row.households_reached),
        deliveries: asNumber(row.deliveries),
        confirmedByHousehold: asNumber(row.confirmed_by_household),
        disputedByHousehold: asNumber(row.disputed_by_household),
        lastDeliveryAt: asIso(row.last_delivery_at),
      })),
      generatedAt: new Date().toISOString(),
    };
  }
}

/** Sin base no hay entregas. Ceros, nunca cifras de ejemplo: aquí una cifra inventada es una ayuda
 *  que se afirma haber entregado y no se entregó. */
export class EmptyAidDeliveryRepository implements AidDeliveryRepository {
  async record(): Promise<string | null> {
    return null;
  }
  async listForHousehold(): Promise<HouseholdDelivery[]> {
    return [];
  }
  async confirm(): Promise<boolean> {
    return false;
  }
  async coverage(_incidentId: string, incidentCode: string): Promise<AidDeliveryCoverage> {
    return {
      incidentCode,
      totals: {
        householdsReached: 0,
        deliveries: 0,
        confirmedByHousehold: 0,
        independentlyVerified: 0,
        disputedByHousehold: 0,
        onlyDeclared: 0,
        tracedToContract: 0,
      },
      byTerritory: [],
      generatedAt: new Date(0).toISOString(),
    };
  }
}
