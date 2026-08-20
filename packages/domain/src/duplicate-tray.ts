import type { DuplicateTray, ResolveDuplicateInput } from "@pulso/schemas";

/**
 * Bandeja de posibles duplicados del censo comunitario.
 *
 * El puerto expone tres verbos y ninguno fusiona nada: **emparejar** produce pares con la señal que
 * los unió, **listar** los muestra, **resolver** guarda lo que decidió una persona. No hay un
 * `merge`, y esa ausencia es la tarea: si existiera, alguien acabaría llamándolo desde un trabajo
 * nocturno y el censo se dedeplicaría solo, que es precisamente lo que no puede pasar.
 */
export interface DuplicateTrayRepository {
  /** Recorre el censo y deja la bandeja al día. Idempotente: no reabre lo que alguien ya resolvió. */
  match(incidentId: string): Promise<number>;

  list(
    incidentId: string,
    query?: { status?: string; strength?: string; limit?: number },
  ): Promise<DuplicateTray>;

  /**
   * Cierra un par. Devuelve `false` cuando el par no existe o **ya lo resolvió otra persona**: dos
   * auditores mirando la misma bandeja es el caso normal, no el raro, y el segundo tiene que
   * enterarse de que llegó tarde en vez de sobrescribir la decisión del primero.
   */
  resolve(
    incidentId: string,
    candidateId: string,
    actorId: string,
    input: ResolveDuplicateInput,
  ): Promise<boolean>;
}
