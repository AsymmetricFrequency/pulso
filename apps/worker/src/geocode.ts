import { createHash } from "node:crypto";
import type { Sql } from "postgres";

/**
 * Geocodificación de direcciones escritas, con la precisión anotada.
 *
 * Existe porque ~177 puntos de `cuidarcolombia` y `ayudaspereira` traen dirección y ninguna
 * coordenada, y son centros de acopio en ciudades donde el mapa hoy no tiene nada. Y existe con
 * estas restricciones porque geocodificar mal manda un equipo al sitio equivocado, que es peor que
 * no pintar el punto.
 *
 * Tres reglas que no se relajan:
 *
 * 1. **El resultado tiene que caer en el municipio que declaró la fuente.** Sin esto, «Alcaldía
 *    Municipal de Atrato» resuelve en Medio Atrato —otro municipio, a horas de distancia— con toda
 *    la confianza del mundo. Medido: uno de cada seis aciertos aparentes era de otro municipio.
 * 2. **La precisión más fina que se puede afirmar es `calle`.** Nominatim sin número de casa
 *    devuelve el centroide de la vía. Llamarlo «exacto» sería mentir sobre un dato que alguien va a
 *    usar para conducir hasta allí.
 * 3. **Nunca un rescate ni un colapso.** Lo impone además un CHECK en la base
 *    (`038_geocoded_addresses.sql`), porque una invariante que depende de que cada autor se acuerde
 *    no es una invariante.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Su política pide identificarse de verdad: «stock User-Agents as set by http libraries will not
// do». Lleva contacto para que puedan escribirnos antes de bloquearnos.
const USER_AGENT = "PULSO/0.1 emergency-response-map (+https://pulso.my; vortexlabcol@gmail.com)";

// 4 peticiones por minuto es el límite que su política fija para tareas en lote periódicas. 15 s
// entre peticiones lo cumple con margen. Con caché, una corrida estable no pide nada.
const MIN_INTERVAL_MS = 15_000;

export type GeocodePrecision = "calle" | "barrio" | "municipio" | "sin_resultado";

export type GeocodeResult =
  | { found: true; latitude: number; longitude: number; precision: "calle" | "barrio" }
  | { found: false; precision: "sin_resultado" | "municipio"; reason: string };

type NominatimHit = {
  lat?: unknown;
  lon?: unknown;
  display_name?: unknown;
  addresstype?: unknown;
  address?: Record<string, unknown>;
};

/** Sin tildes y en minúsculas, para comparar «Quibdó» con «Quibdo» sin drama. */
export const normalizePlace = (value: string | null | undefined): string =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(d\.?\s*c\.?|ciudad|municipio|distrito)\b/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ROAD =
  "(?:carrera|cra\\.?|kr\\.?|calle|cl\\.?|clle|avenida|av\\.?|autopista|transversal|tv\\.?|diagonal|dg\\.?)";

/**
 * La parte de una dirección que Nominatim entiende: la vía y su número.
 *
 * Las fuentes escriben «Carrera 15 #31-110, barrio El Espinal, Centro Comercial San Lázaro, local
 * 4». Mandar esa cadena entera devuelve cero resultados; mandar «Carrera 15» devuelve la vía.
 */
export function extractStreet(address: string | null | undefined): string | null {
  if (!address) return null;
  const match = address.match(
    new RegExp(
      `\\b(${ROAD}\\s*\\.?\\s*[0-9]+[A-Za-z]?)\\b(?:\\s*(?:con|#|n\\.?º|no\\.?|-)\\s*(?:${ROAD}\\s*)?([0-9]+[A-Za-z]?))?`,
      "i",
    ),
  );
  if (!match?.[1]) return null;
  return [match[1], match[2]].filter(Boolean).join(" ").replace(/\s+/g, " ");
}

const municipalityOf = (hit: NominatimHit): string | null => {
  const address = hit.address ?? {};
  for (const key of ["city", "town", "municipality", "county", "village"]) {
    const value = address[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
};

export type GeocodeDeps = {
  /** Inyectable para las pruebas: nunca se llama a la red en un test. */
  request?: (params: Record<string, string>) => Promise<NominatimHit | null>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export class Geocoder {
  #lastCallAt = 0;
  #deps: Required<GeocodeDeps>;

  constructor(
    private readonly sql: Sql,
    deps: GeocodeDeps = {},
  ) {
    this.#deps = {
      request: deps.request ?? ((params) => this.#callNominatim(params)),
      now: deps.now ?? (() => Date.now()),
      sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    };
  }

  async #callNominatim(params: Record<string, string>): Promise<NominatimHit | null> {
    const waited = this.#deps.now() - this.#lastCallAt;
    if (waited < MIN_INTERVAL_MS) await this.#deps.sleep(MIN_INTERVAL_MS - waited);
    this.#lastCallAt = this.#deps.now();

    const url = `${NOMINATIM}?${new URLSearchParams({
      ...params,
      format: "jsonv2",
      limit: "1",
      countrycodes: "co",
      addressdetails: "1",
    })}`;
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Nominatim returned HTTP ${response.status}`);
    const payload = (await response.json()) as NominatimHit[];
    return Array.isArray(payload) && payload[0] ? payload[0] : null;
  }

  /**
   * Busca en la caché primero, y solo pregunta si no hay respuesta previa —incluida la respuesta
   * «no se encontró», que también se guarda—.
   */
  async locate(input: {
    address: string | null | undefined;
    neighborhood?: string | null;
    municipality: string;
  }): Promise<GeocodeResult> {
    const street = extractStreet(input.address);
    const attempts: { precision: "calle" | "barrio"; params: Record<string, string> }[] = [];
    if (street) {
      attempts.push({ precision: "calle", params: { street, city: input.municipality } });
    }
    if (input.neighborhood?.trim()) {
      attempts.push({
        precision: "barrio",
        params: { q: `${input.neighborhood.trim()}, ${input.municipality}, Colombia` },
      });
    }
    if (attempts.length === 0) {
      return {
        found: false,
        precision: "sin_resultado",
        reason: "sin calle ni barrio en el texto",
      };
    }

    const queryText = JSON.stringify(attempts.map((a) => a.params));
    const hash = createHash("sha256")
      .update(`${normalizePlace(input.municipality)}|${queryText}`)
      .digest("hex");

    const cached = await this.#readCache(hash);
    if (cached) return cached;

    for (const attempt of attempts) {
      let hit: NominatimHit | null = null;
      try {
        hit = await this.#deps.request(attempt.params);
      } catch {
        // Un fallo de red no se cachea: la dirección puede ser perfectamente geocodificable y lo
        // que falló fue el momento. Guardar «no se encontró» aquí la condenaría para siempre.
        continue;
      }
      if (!hit) continue;

      const latitude = Number(hit.lat);
      const longitude = Number(hit.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

      const inside = await this.#fallsInsideMunicipality(input.municipality, latitude, longitude);
      if (!inside.ok) {
        const reason = `${inside.reason} (el geocodificador dijo «${municipalityOf(hit) ?? "sin municipio"}»)`;
        await this.#writeCache(hash, queryText, input.municipality, null, "municipio", hit, reason);
        return { found: false, precision: "municipio", reason };
      }

      const result: GeocodeResult = {
        found: true,
        latitude,
        longitude,
        precision: attempt.precision,
      };
      await this.#writeCache(
        hash,
        queryText,
        input.municipality,
        { latitude, longitude },
        attempt.precision,
        hit,
        null,
      );
      return result;
    }

    await this.#writeCache(
      hash,
      queryText,
      input.municipality,
      null,
      "sin_resultado",
      null,
      "el geocodificador no devolvió nada",
    );
    return { found: false, precision: "sin_resultado", reason: "sin resultado" };
  }

  /**
   * ¿Cae el punto dentro del polígono del municipio que declaró la fuente?
   *
   * Comparar los **nombres que devuelve el geocodificador** no funciona, y no es un detalle: OSM
   * etiqueta los municipios colombianos como «Perímetro Urbano Medellín», «Cartagena de Indias» o
   * directamente por el corregimiento —«La Buitrera» para un punto que sí está en Cali—. La
   * igualdad rechaza los tres siendo correctos; la contención acepta «Medio Atrato» cuando la
   * fuente dijo «Atrato», que es otro municipio a horas de camino.
   *
   * La geometría sí responde. Tenemos los 1.121 municipios del DANE con su polígono y el índice
   * GiST existe desde `001_foundation.sql`.
   */
  async #fallsInsideMunicipality(
    municipality: string,
    latitude: number,
    longitude: number,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const declared = normalizePlace(municipality);
    if (!declared) return { ok: false, reason: "la fuente no dijo el municipio" };

    // Dos candidatas posibles: la que se llama exactamente así, y las que la contienen como palabra
    // entera. El orden importa y es toda la regla:
    //
    // - Si existe la coincidencia **exacta**, manda ella y solo ella. «Atrato» existe en el DANE,
    //   así que un punto que cayó en «Medio Atrato» se rechaza — que es el error medido.
    // - Si no existe, se elige entre las candidatas la que contenga el punto. «Cartagena» no existe
    //   como tal: el DANE dice «Cartagena de Indias» y «Cartagena del Chairá», y el punto decide
    //   cuál. Igual con «Cúcuta» → «San José de Cúcuta».
    const [row] = await this.sql<{ name: string; inside: boolean; exact: boolean }[]>`
      SELECT
        name,
        ST_Contains(geometry, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)) AS inside,
        pulso_normalize_place(name) = ${declared} AS exact
      FROM territories
      WHERE territory_type = 'municipality'
        AND deleted_at IS NULL
        AND (
          pulso_normalize_place(name) = ${declared}
          OR pulso_normalize_place(name) ~ ${`(^| )${declared}( |$)`}
        )
      ORDER BY exact DESC, inside DESC
      LIMIT 1
    `;

    // Sin polígono no hay comprobación, y sin comprobación no se acepta: un municipio que no está
    // en el marco del DANE es más probable que sea un error de escritura de la fuente que un
    // municipio real que nos falte.
    if (!row) return { ok: false, reason: `«${municipality}» no existe en el marco DANE` };
    if (!row.inside) return { ok: false, reason: `el punto cae fuera del polígono de ${row.name}` };
    return { ok: true };
  }

  async #readCache(hash: string): Promise<GeocodeResult | null> {
    const [row] = await this.sql<
      {
        precision: string;
        lat: number | null;
        lon: number | null;
        rejected_reason: string | null;
      }[]
    >`
      SELECT precision, ST_Y(location) AS lat, ST_X(location) AS lon, rejected_reason
      FROM geocoded_addresses WHERE query_hash = ${hash}
    `;
    if (!row) return null;
    if (
      row.lat !== null &&
      row.lon !== null &&
      (row.precision === "calle" || row.precision === "barrio")
    ) {
      return { found: true, latitude: row.lat, longitude: row.lon, precision: row.precision };
    }
    return {
      found: false,
      precision: row.precision === "municipio" ? "municipio" : "sin_resultado",
      reason: row.rejected_reason ?? "sin resultado",
    };
  }

  async #writeCache(
    hash: string,
    queryText: string,
    municipality: string,
    point: { latitude: number; longitude: number } | null,
    precision: GeocodePrecision,
    response: NominatimHit | null,
    rejectedReason: string | null,
  ) {
    await this.sql`
      INSERT INTO geocoded_addresses (
        query_hash, query_text, municipality, location, precision, provider,
        provider_response, rejected_reason
      ) VALUES (
        ${hash}, ${queryText}, ${municipality},
        ${point ? this.sql`ST_SetSRID(ST_MakePoint(${point.longitude}, ${point.latitude}), 4326)` : null},
        ${precision}, 'nominatim',
        ${response ? this.sql.json(response as never) : null}, ${rejectedReason}
      )
      ON CONFLICT (query_hash) DO UPDATE SET
        location = EXCLUDED.location,
        precision = EXCLUDED.precision,
        provider_response = EXCLUDED.provider_response,
        rejected_reason = EXCLUDED.rejected_reason,
        updated_at = now()
    `;
  }
}
