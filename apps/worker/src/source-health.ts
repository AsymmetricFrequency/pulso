import type { Sql } from "postgres";

/**
 * Avisa cuando una fuente **cambia de estado**, no cada vez que falla.
 *
 * Cierra la mitad que le faltaba a `PL-9`. El panel ya mostraba la última corrida de cada fuente;
 * lo que no había era nadie que avisara. Cali lleva 68 corridas fallidas seguidas y nadie se enteró
 * por un aviso — se descubrió mirando.
 *
 * **Por qué en el cambio y no en cada fallo.** Cali falla cada 30 minutos por diseño: su 403 es
 * conocido y decidido. Avisar en cada corrida serían 48 mensajes al día de algo que ya sabemos, y
 * un canal así se silencia. Cuando se silencia, el aviso que sí importaba —una fuente sana que
 * acaba de caerse— tampoco llega. Avisar solo en la transición mantiene el canal creíble.
 *
 * Se avisa en las dos direcciones. Que una fuente vuelva es tan accionable como que se caiga: dice
 * que se puede dejar de buscarle un sustituto.
 */

export type SourceHealthChange =
  | { kind: "cayo"; sourceId: string; error: string | null; httpStatus: number | null }
  | { kind: "volvio"; sourceId: string; recordsSeen: number };

/**
 * Compara la corrida que acaba de terminar con la anterior y devuelve el cambio, si lo hubo.
 *
 * `unchanged` cuenta como sana: un 304 significa que la fuente contestó y no había nada nuevo, que
 * es el mejor resultado posible, no una ausencia de resultado.
 */
export async function detectHealthChange(
  sql: Sql,
  sourceId: string,
  runId: string,
): Promise<SourceHealthChange | null> {
  const rows = await sql<
    {
      id: string;
      status: string;
      error_message: string | null;
      http_status: number | null;
      records_seen: number;
    }[]
  >`
    SELECT id, status, error_message, http_status, records_seen
    FROM source_ingestion_runs
    WHERE source_id = ${sourceId} AND status <> 'running'
    ORDER BY started_at DESC
    LIMIT 2
  `;

  const [actual, anterior] = rows;
  // Sin corrida anterior no hay transición: la primera vez que una fuente falla no se sabe si es
  // una caída o si nunca funcionó, y avisar de todas las fuentes nuevas sería ruido de estreno.
  if (!actual || actual.id !== runId || !anterior) return null;

  const sana = (status: string) => status === "succeeded" || status === "unchanged";
  const antesSana = sana(anterior.status);
  const ahoraSana = sana(actual.status);
  if (antesSana === ahoraSana) return null;

  return ahoraSana
    ? { kind: "volvio", sourceId, recordsSeen: actual.records_seen }
    : {
        kind: "cayo",
        sourceId,
        error: actual.error_message,
        httpStatus: actual.http_status,
      };
}

/** El texto del aviso. Dice qué pasó, desde cuándo y qué queda sin datos por ello. */
export function healthChangeMessage(change: SourceHealthChange, displayName: string): string {
  if (change.kind === "volvio") {
    return [
      `✅ **${displayName}** volvió a responder`,
      `Trajo ${change.recordsSeen.toLocaleString("es-CO")} registros en esta corrida.`,
    ].join("\n");
  }
  const causa = change.httpStatus
    ? `HTTP ${change.httpStatus}`
    : (change.error ?? "sin mensaje de error");
  return [
    `⚠️ **${displayName}** dejó de responder`,
    `Causa: ${causa}`,
    "",
    // Lo que importa no es que una petición fallara: es que el mapa se está quedando viejo por ese
    // lado y nadie lo sabría de otro modo.
    "Sus puntos siguen en el mapa con la fecha de su última corrida buena. Si no vuelve, se retiran solos a las 24 horas.",
  ].join("\n");
}

/**
 * Manda el aviso al webhook de `#alertas`.
 *
 * **Nunca lanza.** Un aviso que falla no puede tumbar la ingesta que lo originó — sería cambiar un
 * problema pequeño (no avisamos) por uno grande (dejamos de traer datos).
 *
 * **No menciona a todo el mundo.** Una fuente caída le interesa a quien la puede arreglar, no a los
 * 14. Menciona al rol de `DISCORD_ALERT_ROLE_ID` si está configurado — y hay que permitirlo
 * explícitamente en `allowed_mentions`, porque los roles del servidor están como no mencionables y
 * sin eso el texto saldría en gris sin notificar a nadie.
 *
 * El `@everyone` queda reservado para los rescates. Es lo único que justifica despertar a todos.
 */
export async function sendAlert(content: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_ALERTS;
  if (!url) return;
  const roleId = process.env.DISCORD_ALERT_ROLE_ID;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: (roleId ? `<@&${roleId}> ` : "") + content.slice(0, 1_900),
        allowed_mentions: roleId ? { parse: [], roles: [roleId] } : { parse: [] },
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Silencio deliberado. Ver arriba.
  }
}
