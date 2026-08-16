import { randomUUID } from "node:crypto";
import type { CommunityReportMetadata } from "@pulso/schemas";
import postgres, { type Sql } from "postgres";
import { isWithinColombia } from "./colombia-bounds.js";
import { normalizeNeeds } from "./needs-list.js";

export const REDCALIAYUDA_ACOPIO_SOURCE = {
  id: "redcaliayuda-acopio",
  name: "Red Cali Ayuda — Puntos de acopio",
  url: "https://redcaliayuda.vercel.app/acopio",
  authority: "community",
  classification: "public_aggregate",
  collectionMode: "api",
  crawlDelaySeconds: 600,
} as const;

// /acopio has no clean JSON like /necesidades does — each point is rendered directly into the
// page, and its "Responsable" field is a single text node combining a real person's name and
// phone with no way to separate them (e.g. "Responsable: Luis Fernando Garzón - 3168617288").
// Walking that render tree to avoid it would be fragile and unauditable — instead, every card
// also renders a "Compartir por WhatsApp" button whose `wa.me/?text=...` link is a clean,
// self-contained summary (name/address/hours/needs/coordinates) that — verified across every
// point on the live page — never includes the Responsable line. That link is the ONLY thing
// this ingestion reads; the surrounding page markup (and therefore the Responsable field) is
// never parsed at all.
const ARTICLE_KEY_RE = /\["\$","article","([a-z0-9]+)"/g;
const WA_LINK_RE = /"href":"(https:\/\/wa\.me\/\?text=[^"]+)"/g;
const MAPS_COORD_RE = /maps\?q=(-?\d+\.?\d*),(-?\d+\.?\d*)/;

// Defense in depth: even though the wa.me share text was verified PII-free across every point
// on the live page, a future template change on their end could silently start including the
// Responsable line in it. Any point whose share text contains a long digit run outside the map
// coordinates is dropped rather than trusted.
const LONG_DIGIT_RUN = /\d{7,}/;

type ParsedAcopioPoint = {
  name: string;
  address: string | null;
  hours: string | null;
  needs: string[];
  lat: number;
  lng: number;
};

function stripLabel(line: string): string {
  return line.replace(/^\S+\s*/u, "").trim();
}

export function parseAcopioShareText(decoded: string): ParsedAcopioPoint | undefined {
  const withoutCoords = decoded.replace(/maps\?q=-?\d+\.?\d*,-?\d+\.?\d*/, "");
  if (LONG_DIGIT_RUN.test(withoutCoords)) return undefined;

  let name: string | null = null;
  let address: string | null = null;
  let hours: string | null = null;
  let needs: string[] = [];
  let lat: number | null = null;
  let lng: number | null = null;

  for (const rawLine of decoded.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.includes("📦")) name = stripLabel(line);
    else if (line.includes("📍")) address = stripLabel(line);
    else if (line.includes("🕐")) hours = stripLabel(line);
    else if (line.toLowerCase().includes("necesitan:")) {
      needs = line
        .slice(line.toLowerCase().indexOf("necesitan:") + "necesitan:".length)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (line.includes("maps?q=")) {
      const match = line.match(MAPS_COORD_RE);
      if (match?.[1] && match[2]) {
        lat = Number(match[1]);
        lng = Number(match[2]);
      }
    }
  }

  if (!name || lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return undefined;
  }
  return { name, address, hours, needs, lat, lng };
}

export type MappedAcopioPoint = {
  externalKey: string;
  reportType: "pmu";
  category: null;
  title: string;
  description: string | null;
  location: { type: "Point"; coordinates: [number, number] };
  status: "reported";
  metadata: CommunityReportMetadata;
};

export function mapAcopioArticle(
  key: string,
  shareLinkHref: string,
): MappedAcopioPoint | undefined {
  const encodedText = shareLinkHref.slice("https://wa.me/?text=".length);
  let decoded: string;
  try {
    decoded = decodeURIComponent(encodedText);
  } catch {
    return undefined;
  }

  const parsed = parseAcopioShareText(decoded);
  if (!parsed) return undefined;
  if (!isWithinColombia(parsed.lat, parsed.lng)) return undefined;

  const title = parsed.name
    .replace(/^\[[A-ZÁÉÍÓÚ]+\]\s*/, "")
    .trim()
    .slice(0, 140);
  if (title.length < 3) return undefined;

  const metadata: CommunityReportMetadata = {
    address: parsed.address && parsed.address !== parsed.name ? parsed.address : undefined,
    schedule: parsed.hours ?? undefined,
    needs: parsed.needs.length > 0 ? normalizeNeeds(parsed.needs) : undefined,
    subSource: "Red Cali Ayuda",
  };

  return {
    externalKey: `acopio:${key}`,
    reportType: "pmu",
    category: null,
    title,
    description: null,
    location: { type: "Point", coordinates: [parsed.lng, parsed.lat] },
    status: "reported",
    metadata,
  };
}

// Article keys and wa.me links appear once each per point, in the same document order — that
// 1:1 ordering was verified against a live snapshot (123 articles, 123 links, zero mismatches)
// rather than assumed.
export function parseAcopioFlightPayload(body: string): Array<{ key: string; href: string }> {
  const keys = [...body.matchAll(ARTICLE_KEY_RE)]
    .map((match) => match[1])
    .filter((key): key is string => Boolean(key));
  const hrefs = [...body.matchAll(WA_LINK_RE)]
    .map((match) => match[1])
    .filter((href): href is string => Boolean(href));
  if (keys.length !== hrefs.length) return [];
  return keys.map((key, index) => ({ key, href: hrefs[index] as string }));
}

export async function fetchRedCaliAyudaAcopioSnapshot() {
  const response = await fetch(REDCALIAYUDA_ACOPIO_SOURCE.url, {
    headers: {
      RSC: "1",
      "User-Agent": "PULSO/0.1 public-emergency-data (+https://pulso.my)",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Red Cali Ayuda /acopio returned HTTP ${response.status}`);
  const body = await response.text();
  return parseAcopioFlightPayload(body);
}

async function upsertCommunityReports(sql: Sql, incidentCode: string, points: MappedAcopioPoint[]) {
  const [incident] = await sql<
    { id: string }[]
  >`SELECT id FROM incidents WHERE code = ${incidentCode} AND deleted_at IS NULL LIMIT 1`;
  if (!incident) throw new Error(`Incident ${incidentCode} does not exist`);

  await sql`
    INSERT INTO external_sources (
      id, display_name, source_url, authority, data_classification,
      collection_mode, crawl_delay_seconds
    ) VALUES (
      ${REDCALIAYUDA_ACOPIO_SOURCE.id}, ${REDCALIAYUDA_ACOPIO_SOURCE.name}, ${REDCALIAYUDA_ACOPIO_SOURCE.url},
      ${REDCALIAYUDA_ACOPIO_SOURCE.authority}, ${REDCALIAYUDA_ACOPIO_SOURCE.classification},
      ${REDCALIAYUDA_ACOPIO_SOURCE.collectionMode}, ${REDCALIAYUDA_ACOPIO_SOURCE.crawlDelaySeconds}
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      source_url = EXCLUDED.source_url,
      active = true,
      updated_at = now()
  `;

  let upserted = 0;
  for (const point of points) {
    await sql`
      INSERT INTO community_reports (
        id, incident_id, report_type, category, title, description, location,
        status, external_source_id, external_key, client_mutation_id, metadata
      ) VALUES (
        ${randomUUID()}, ${incident.id}, ${point.reportType}, ${point.category}, ${point.title},
        ${point.description},
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(point.location)}), 4326),
        ${point.status}, ${REDCALIAYUDA_ACOPIO_SOURCE.id}, ${point.externalKey}, ${randomUUID()},
        ${sql.json(point.metadata)}
      )
      ON CONFLICT (external_source_id, external_key) WHERE external_source_id IS NOT NULL
      DO UPDATE SET
        report_type = EXCLUDED.report_type,
        category = EXCLUDED.category,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        location = EXCLUDED.location,
        metadata = EXCLUDED.metadata,
        status = CASE WHEN community_reports.status = 'rejected' THEN community_reports.status
          ELSE EXCLUDED.status END,
        updated_at = now()
    `;
    upserted += 1;
  }
  return upserted;
}

export async function runRedCaliAyudaAcopioIngestion(options: {
  databaseUrl?: string;
  incidentCode: string;
}) {
  const articles = await fetchRedCaliAyudaAcopioSnapshot();
  const points: MappedAcopioPoint[] = [];
  let skippedForPii = 0;
  for (const article of articles) {
    const mapped = mapAcopioArticle(article.key, article.href);
    if (!mapped) {
      const encodedText = article.href.slice("https://wa.me/?text=".length);
      try {
        const decoded = decodeURIComponent(encodedText);
        const withoutCoords = decoded.replace(/maps\?q=-?\d+\.?\d*,-?\d+\.?\d*/, "");
        if (LONG_DIGIT_RUN.test(withoutCoords)) skippedForPii += 1;
      } catch {
        // ignore — already excluded above
      }
      continue;
    }
    points.push(mapped);
  }

  if (!options.databaseUrl) {
    return {
      status: "preview" as const,
      seen: articles.length,
      mapped: points.length,
      skippedForPii,
      points,
    };
  }

  const sql = postgres(options.databaseUrl, { max: 1 });
  try {
    const upserted = await upsertCommunityReports(sql, options.incidentCode, points);
    return {
      status: "stored" as const,
      seen: articles.length,
      mapped: points.length,
      skippedForPii,
      upserted,
    };
  } finally {
    await sql.end();
  }
}
