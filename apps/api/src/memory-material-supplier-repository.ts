import {
  IncidentNotFoundError,
  type IncidentRepository,
  MaterialSupplierRateLimitError,
  type MaterialSupplierRepository,
} from "@pulso/domain";
import type { CreateMaterialSupplierInput, PublicMaterialSupplierDto } from "@pulso/schemas";
import { v7 as uuidv7 } from "uuid";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

const CATALOG_NAMES: Record<string, string> = {
  ladrillo: "Ladrillo",
  "bloque-concreto": "Bloque de concreto",
  cemento: "Cemento",
  varilla: "Varilla / hierro de refuerzo",
  arena: "Arena",
  gravilla: "Gravilla / triturado",
  madera: "Madera",
  "teja-zinc": "Teja de zinc",
  "teja-barro": "Teja de barro",
  "lamina-fibrocemento": "Lámina de fibrocemento",
  clavos: "Clavos / puntillas",
  pintura: "Pintura",
  "tuberia-pvc": "Tubería PVC",
  "cable-electrico": "Cable eléctrico",
};

type StoredSupplier = PublicMaterialSupplierDto & {
  incidentId: string;
  clientMutationId: string;
};

export class MemoryMaterialSupplierRepository implements MaterialSupplierRepository {
  readonly #suppliers = new Map<string, StoredSupplier>();
  readonly #rateLimits = new Map<string, { attempts: number; resetAt: number }>();

  constructor(private readonly incidents: IncidentRepository) {}

  async create(
    incidentId: string,
    input: CreateMaterialSupplierInput,
    context: { sourceIpHash: string | null },
  ): Promise<PublicMaterialSupplierDto> {
    await this.#requireIncident(incidentId);
    this.#consumeRateLimit(context.sourceIpHash ?? "unknown");

    const duplicate = [...this.#suppliers.values()].find(
      (supplier) =>
        supplier.incidentId === incidentId && supplier.clientMutationId === input.clientMutationId,
    );
    if (duplicate) return this.#toPublic(duplicate);

    const now = new Date().toISOString();
    const supplier: StoredSupplier = {
      id: uuidv7(),
      incidentId,
      clientMutationId: input.clientMutationId,
      name: input.name,
      location: input.location,
      address: input.address,
      publicContact: input.publicContact,
      verificationLevel: "reported",
      offers: input.offers.map((offer) => ({
        catalogItemCode: offer.catalogItemCode,
        catalogItemName: CATALOG_NAMES[offer.catalogItemCode] ?? offer.catalogItemCode,
        unit: offer.unit,
        unitPrice: offer.unitPrice,
        currency: offer.currency,
        availableQuantity: offer.availableQuantity,
        status: "available",
      })),
      createdAt: now,
    };
    this.#suppliers.set(supplier.id, supplier);
    return this.#toPublic(supplier);
  }

  async listPublicByIncident(incidentId: string): Promise<PublicMaterialSupplierDto[]> {
    await this.#requireIncident(incidentId);
    return [...this.#suppliers.values()]
      .filter((supplier) => supplier.incidentId === incidentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((supplier) => this.#toPublic(supplier));
  }

  #toPublic(supplier: StoredSupplier): PublicMaterialSupplierDto {
    return {
      id: supplier.id,
      name: supplier.name,
      location: supplier.location,
      address: supplier.address,
      publicContact: supplier.publicContact,
      verificationLevel: supplier.verificationLevel,
      offers: supplier.offers,
      createdAt: supplier.createdAt,
    };
  }

  #consumeRateLimit(key: string) {
    const now = Date.now();
    const existing = this.#rateLimits.get(key);
    if (!existing || existing.resetAt <= now) {
      this.#rateLimits.set(key, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return;
    }
    existing.attempts += 1;
    if (existing.attempts > RATE_LIMIT_MAX_ATTEMPTS) {
      throw new MaterialSupplierRateLimitError(
        Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
      );
    }
  }

  async #requireIncident(incidentId: string) {
    if (!(await this.incidents.findById(incidentId))) throw new IncidentNotFoundError(incidentId);
  }
}
