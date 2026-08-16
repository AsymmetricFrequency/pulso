import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";

/**
 * Registro único de corridas de ingesta.
 *
 * Antes cada fuente resolvía esto por su cuenta y el resultado fue que solo tres de diez dejaban
 * rastro en `source_ingestion_runs`: las seis fuentes comunitarias corrían bien pero no
 * registraban nada, y **ningún fallo se registraba jamás** —ni siquiera el de las fuentes que sí
 * escribían, porque el error ocurría antes de llegar al `INSERT`. Así, Cali estuvo devolviendo
 * HTTP 403 en veinte corridas seguidas sin que ninguna consulta a la base lo mostrara.
 *
 * La lección de diseño es que el fallo suele pasar **antes** de que la fuente abra su conexión:
 * la descarga es lo primero que hace y lo primero que se rompe. Por eso el registro no puede vivir
 * dentro de cada módulo de ingesta; vive en quien los invoca, que ya tiene la conexión y ve tanto
 * el éxito como la excepción.
 */
export type IngestionSourceDefinition = {
  id: string;
  name: string;
  url: string;
  authority: "official" | "humanitarian" | "community" | "partner";
  classification: "public_operational" | "public_aggregate" | "restricted_personal";
  collectionMode: "api" | "html_import" | "csv_import" | "manual" | "webhook";
  crawlDelaySeconds: number;
};

export type IngestionRunOutcome = "succeeded" | "unchanged" | "failed";

/**
 * `source_ingestion_runs.source_id` referencia a `external_sources`, así que una fuente que nunca
 * ha tenido una corrida exitosa no existe todavía en esa tabla y su fallo no se podría anotar.
 * Registrarla antes de abrir la corrida es lo que permite dejar constancia justamente del caso
 * que más importa: el de la fuente que nunca ha funcionado.
 */
export async function registerExternalSource(sql: Sql, source: IngestionSourceDefinition) {
  await sql`
    INSERT INTO external_sources (
      id, display_name, source_url, authority, data_classification,
      collection_mode, crawl_delay_seconds
    ) VALUES (
      ${source.id}, ${source.name}, ${source.url}, ${source.authority},
      ${source.classification}, ${source.collectionMode}, ${source.crawlDelaySeconds}
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      source_url = EXCLUDED.source_url,
      data_classification = EXCLUDED.data_classification,
      collection_mode = EXCLUDED.collection_mode,
      crawl_delay_seconds = EXCLUDED.crawl_delay_seconds,
      active = true,
      updated_at = now()
  `;
}

export async function startIngestionRun(
  sql: Sql,
  source: IngestionSourceDefinition,
): Promise<string> {
  await registerExternalSource(sql, source);
  const runId = randomUUID();
  await sql`
    INSERT INTO source_ingestion_runs (id, source_id, status, started_at)
    VALUES (${runId}, ${source.id}, 'running', now())
  `;
  return runId;
}

/**
 * Cierra la corrida.
 *
 * El `status = 'running'` de la condición no es defensivo, es lo que hace convivir los dos tipos
 * de fuente: las oficiales ya cerraron su propia fila con detalle que aquí no se conoce —etag,
 * hash del contenido, conteo exacto de registros—, así que si esta función escribiera igual, lo
 * borraría y dejaría `http_status` en nulo y `records_seen` en cero. Cuando la fuente ya cerró,
 * esto no hace nada; cuando no (todas las comunitarias), es lo único que la cierra.
 *
 * El fallo es la excepción a esa regla y se escribe siempre: una corrida que terminó mal tiene que
 * quedar marcada aunque algo la hubiera dado por buena antes.
 */
export async function completeIngestionRun(
  sql: Sql,
  runId: string,
  result: {
    status: IngestionRunOutcome;
    recordsSeen?: number;
    httpStatus?: number | null;
    errorMessage?: string | null;
  },
) {
  if (result.status === "failed") {
    await sql`
      UPDATE source_ingestion_runs SET
        status = 'failed',
        finished_at = now(),
        http_status = ${result.httpStatus ?? null},
        error_message = ${result.errorMessage ?? null}
      WHERE id = ${runId}
    `;
    return;
  }
  await sql`
    UPDATE source_ingestion_runs SET
      status = ${result.status},
      finished_at = now(),
      records_seen = ${Math.max(0, result.recordsSeen ?? 0)}
    WHERE id = ${runId} AND status = 'running'
  `;
}

/**
 * Cierra corridas que quedaron en `running` porque el proceso murió a mitad de camino: un reinicio
 * del worker, un despliegue, un OOM. Sin esto quedan ahí para siempre y son indistinguibles de una
 * corrida colgada de verdad, que es precisamente la señal que este registro existe para dar.
 *
 * El umbral de antigüedad evita que un arranque marque como interrumpida una corrida que otro
 * proceso está ejecutando de verdad en este momento.
 */
export async function closeAbandonedRuns(sql: Sql, olderThanMinutes = 60): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    UPDATE source_ingestion_runs SET
      status = 'failed',
      finished_at = now(),
      error_message = 'La corrida quedó interrumpida: el worker se detuvo antes de terminarla.'
    WHERE status = 'running'
      AND started_at < now() - (${olderThanMinutes} * interval '1 minute')
    RETURNING id
  `;
  return rows.length;
}

/**
 * Los módulos de ingesta devuelven formas distintas —unos `seen`, otros `count`, otros
 * `upserted`— porque cada fuente publica cosas distintas. En vez de uniformarlas a la fuerza,
 * aquí se lee lo que haya: el número exacto importa menos que poder ver de un vistazo si una
 * corrida trajo datos o volvió vacía.
 */
export function recordsSeenFromResult(result: unknown): number {
  if (typeof result !== "object" || result === null) return 0;
  const candidate = result as Record<string, unknown>;
  for (const key of ["seen", "count", "upserted", "records", "updates"]) {
    const value = candidate[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

/** Una fuente que responde 304 no falló: no había nada nuevo. */
export function outcomeFromResult(result: unknown): IngestionRunOutcome {
  if (typeof result === "object" && result !== null) {
    const status = (result as Record<string, unknown>).status;
    if (status === "unchanged") return "unchanged";
  }
  return "succeeded";
}

/**
 * El código HTTP viaja dentro del mensaje de error porque cada módulo lanza su propio texto
 * ("Official source returned HTTP 403"). Extraerlo permite distinguir de un vistazo un bloqueo
 * del servidor de origen de un error de parseo nuestro, sin cambiar los diez módulos.
 */
export function httpStatusFromError(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\bHTTP (\d{3})\b/);
  if (!match?.[1]) return null;
  const status = Number.parseInt(match[1], 10);
  return Number.isFinite(status) ? status : null;
}
