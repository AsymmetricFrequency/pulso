import type {
  AidDeliveryCoverage,
  ConfirmDeliveryInput,
  CreateHouseholdDeliveryInput,
  HouseholdDelivery,
} from "@pulso/schemas";

/**
 * Enlazar la donación con la entrega real.
 *
 * `confirm` con `received: false` es la operación que hace que esto sea auditoría: un hogar
 * desmintiendo una entrega registrada a su nombre es la única señal que no puede venir de quien
 * tiene interés en que la cifra suba.
 */
export interface AidDeliveryRepository {
  record(incidentId: string, input: CreateHouseholdDeliveryInput): Promise<string | null>;
  listForHousehold(incidentId: string, publicCode: string): Promise<HouseholdDelivery[]>;
  confirm(
    incidentId: string,
    publicCode: string,
    deliveryId: string,
    input: ConfirmDeliveryInput,
  ): Promise<boolean>;
  coverage(incidentId: string, incidentCode: string): Promise<AidDeliveryCoverage>;
}
