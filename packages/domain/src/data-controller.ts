import type { DataController } from "@pulso/schemas";

/** Quién responde por los datos personales. Una fila, no una constante: va a cambiar. */
export interface DataControllerRepository {
  current(): Promise<DataController>;
}
