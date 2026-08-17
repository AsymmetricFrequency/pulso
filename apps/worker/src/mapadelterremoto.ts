import { randomUUID } from "node:crypto";
import type { CommunityReportMetadata } from "@pulso/schemas";
import postgres, { type Sql } from "postgres";
import { isWithinColombia } from "./colombia-bounds.js";

export const MAPADELTERREMOTO_SOURCE = {
  id: "mapadelterremoto-registro",
  name: "Mapa del terremoto de Colombia — Registro de daños",
  url: "https://www.mapadelterremoto.com/datos/registro-ligero.json",
  authority: "community",
  classification: "public_aggregate",
  collectionMode: "api",
  // Su `cache-control` dice `max-age=300`. Pedimos más despacio que eso y además condicionalmente
  // con `If-None-Match`, así que la mayoría de las corridas no descarga nada.
  crawlDelaySeconds: 1_800,
} as const;

/**
 * De dónde sale este fichero.
 *
 * No es una API interna deducida leyendo su JavaScript. Es un fichero estático bajo una ruta llamada
 * literalmente `/datos/`, servido con `access-control-allow-origin: *` —es decir, publicado para que
 * lo consuman otros— y con `robots.txt` en `Allow: /`. Su propio mapa lo pide igual que nosotros.
 *
 * La versión `-ligero` es la mitad de bytes que `registro.json` y trae todos los campos que usamos:
 * es la que su propio mapa pide primero, y la que menos les cuesta servirnos.
 *
 * No tiene licencia declarada todavía. Dicen en su sitio que tras el 30/11/2026 los datos quedan
 * «publicados de forma permanente en formato abierto». Hasta entonces: atribución visible en cada
 * punto y enlace a la ficha de origen. Ver `docs/37-fuentes.md`.
 */
const REGISTRY_URL = MAPADELTERREMOTO_SOURCE.url;

/** Tipos que describen daño en una estructura. Todos entran como `dano`. */
const DAMAGE_TYPES = new Set([
  "EDIFICACION_DANADA",
  "EDIFICACION_COLAPSADA",
  "VIVIENDA",
  "ESCUELA",
  "HOSPITAL",
  "PATRIMONIO",
  "SERVICIO",
  "PUENTE",
  "OTRO",
]);

/** Tipos que describen el estado de la red de transporte. Entran como `via`. */
const ROUTE_TYPES = new Set(["VIA", "DESLIZAMIENTO", "RESTRICCION"]);

/** Puntos donde se atiende o se aloja gente. Entran como `pmu`. */
const AID_TYPES = new Set(["PUNTO_AYUDA", "ALBERGUE"]);

// `NOTICIA`, `SAQUEO`, `ROBO` e `INCENDIO` se quedan fuera a propósito. Una nota de prensa no es un
// punto del territorio, y saqueo/robo son denuncias sobre personas concretas en un barrio concreto:
// publicarlas georreferenciadas señala vecindarios sin que nadie pueda responder por el dato.

const SEVERITY_MAP: Record<string, "colapso" | "grave" | "moderado" | "leve" | "sin_evaluar"> = {
  COLAPSO: "colapso",
  GRAVE: "grave",
  MODERADO: "moderado",
  LEVE: "leve",
  SIN_EVALUAR: "sin_evaluar",
};

// Su `estado` es el grado de verificación de la fuente, que se corresponde con el nuestro.
// `DESCARTADO` no se importa: la propia fuente evaluó el punto y concluyó que no era cierto.
const STATUS_MAP: Record<string, "reported" | "corroborated" | "validated"> = {
  CONFIRMADO: "corroborated",
  REPORTADO: "reported",
  EN_VERIFICACION: "reported",
};

const TYPE_LABEL: Record<string, string> = {
  EDIFICACION_COLAPSADA: "Edificación colapsada",
  EDIFICACION_DANADA: "Edificación con daño",
  VIVIENDA: "Vivienda afectada",
  ESCUELA: "Escuela o colegio",
  HOSPITAL: "Hospital o centro de salud",
  PATRIMONIO: "Patrimonio o templo",
  SERVICIO: "Servicio afectado",
  PUENTE: "Puente",
  OTRO: "Punto afectado",
  VIA: "Vía afectada",
  DESLIZAMIENTO: "Deslizamiento",
  RESTRICCION: "Restricción de paso",
  PUNTO_AYUDA: "Punto de ayuda",
  ALBERGUE: "Albergue",
};

const SEVERITY_LABEL: Record<string, string> = {
  colapso: "Colapso",
  grave: "Daño grave",
  moderado: "Daño moderado",
  leve: "Daño leve",
  sin_evaluar: "Sin evaluar",
};

/**
 * Detector conservador de nombres de persona en texto libre.
 *
 * El registro resume periodismo, y el periodismo a veces nombra a quien dio el testimonio: «según el
 * testimonio de uno de ellos, Adalberto Zuluaga, el edificio contiguo…». El disparador de redacción
 * de la base tapa teléfonos, **no nombres**, así que ese texto llegaría entero.
 *
 * Aquí no se intenta acertar quién es persona y quién institución —eso no se puede hacer bien con
 * una expresión regular—. Se hace lo contrario: se busca la construcción gramatical que **introduce
 * a alguien**, y si aparece se descarta la descripción entera de ese punto. El punto se importa
 * igual con todos sus campos estructurados; lo único que se pierde es la prosa, y para eso está el
 * enlace a la ficha de origen.
 *
 * Falla hacia el lado seguro: ante la duda, no se copia.
 */
const PERSON_ATTRIBUTION =
  /\b(?:testimonio|relat[óo]|cont[óo]|declar[óo]|asegur[óo]|explic[óo]|narr[óo]|se[ñn]or[ae]?|do[ñn]a?)\b[^.]{0,40}\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/;

export function stripDescriptionWithNames(text: string | null | undefined): string | null {
  const value = text?.trim();
  if (!value) return null;
  return PERSON_ATTRIBUTION.test(value) ? null : value;
}

/**
 * Nombre de una persona **dentro de la dirección**.
 *
 * Este se descubrió tarde y en producción: el mapa llegó a publicar «Barrio Grisales · vivienda de
 * Olmedo Zapata». La dirección se había dado por segura porque son edificios e instituciones, y en
 * el 99 % de los casos lo es — pero cuando la casa que cayó es de un particular, la fuente la
 * identifica por su dueño. Nueve de 1.100.
 *
 * Publicar el nombre de alguien junto a «su casa colapsó» es exactamente el dato que este proyecto
 * se comprometió a no republicar: dice dónde vive, que lo perdió todo y que hoy no está ahí.
 *
 * `casa` sola no basta como señal —«Casa de la Cultura Lucelly García de Montoya» es un equipamiento
 * público— así que se exige un sustantivo de vivienda particular, y a `casa` se le pide además que
 * no vaya seguida de un calificativo institucional.
 */
const DWELLING_OWNER =
  /\b(?:vivienda|residencia|predio|inmueble|hogar|apartamento|habitaci[óo]n|finca)\s+de\s+(?:la\s+|el\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/i;
const HOUSE_OWNER =
  /\bcasa\s+de\s+(?!la\s+cultura|la\s+memoria|la\s+juventud|la\s+mujer|el\s+pueblo|la\s+paz)(?:la\s+|el\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/i;

export function namesAPrivateResident(text: string | null | undefined): boolean {
  const value = text?.trim();
  if (!value) return false;
  return DWELLING_OWNER.test(value) || HOUSE_OWNER.test(value);
}

type PersonCount = { valor?: unknown; confirmado?: unknown; fuente?: unknown };

type RegistryPoint = {
  id?: unknown;
  codigo?: unknown;
  tipo?: unknown;
  severidad?: unknown;
  estado?: unknown;
  atencion?: unknown;
  departamento?: unknown;
  municipio?: unknown;
  barrio?: unknown;
  direccion?: unknown;
  lat?: unknown;
  lon?: unknown;
  descripcion?: unknown;
  pisos?: unknown;
  riesgoInminente?: unknown;
  accesoBloqueado?: unknown;
  serviciosAfectados?: unknown;
  personas?: Record<string, PersonCount>;
  evidencias?: unknown;
  precisionUbicacion?: unknown;
  creado?: unknown;
  actualizado?: unknown;
  prueba?: unknown;
};

export type MappedRegistryPoint = {
  externalKey: string;
  reportType: "dano" | "via" | "pmu";
  category: string | null;
  title: string;
  description: string | null;
  location: { type: "Point"; coordinates: [number, number] };
  status: "reported" | "corroborated" | "validated";
  routeStatus: "bloqueada" | "habilitada" | null;
  damageSeverity: "colapso" | "grave" | "moderado" | "leve" | "sin_evaluar" | null;
  metadata: CommunityReportMetadata;
};

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const count = (entry: PersonCount | undefined): number | undefined =>
  entry && isFiniteNumber(entry.valor) && entry.valor > 0 ? entry.valor : undefined;

export function mapRegistryPoint(point: RegistryPoint): MappedRegistryPoint | undefined {
  if (point.prueba === true) return undefined;

  const codigo = text(point.codigo);
  const tipo = text(point.tipo);
  const estado = text(point.estado);
  if (!codigo || !tipo || !estado) return undefined;

  const status = STATUS_MAP[estado];
  if (!status) return undefined;

  // Solo entran los puntos con coordenada real. La fuente es escrupulosa con esto: cuando únicamente
  // conoce el municipio deja `lat`/`lon` en null en vez de poner el centroide, y por eso 1.146 de
  // sus 3.110 puntos traen coordenada. Clavar los otros en el centro del pueblo sería inventar una
  // ubicación —y a un equipo de rescate se le manda al sitio, no al municipio—.
  const lat = point.lat;
  const lon = point.lon;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon) || !isWithinColombia(lat, lon)) return undefined;

  const isDamage = DAMAGE_TYPES.has(tipo);
  const isRoute = ROUTE_TYPES.has(tipo);
  const isAid = AID_TYPES.has(tipo);
  if (!isDamage && !isRoute && !isAid) return undefined;

  const severity = SEVERITY_MAP[text(point.severidad) ?? ""] ?? "sin_evaluar";
  const damageSeverity = isDamage ? severity : null;
  // Su vocabulario de vías no distingue cerrada de reabierta: los tipos que traemos (`VIA`,
  // `DESLIZAMIENTO`, `RESTRICCION`) describen un obstáculo. `accesoBloqueado` lo confirma cuando
  // está, y en su ausencia no se inventa una reapertura.
  const routeStatus = isRoute ? ("bloqueada" as const) : null;

  const label = TYPE_LABEL[tipo] ?? "Punto afectado";
  const municipio = text(point.municipio);
  const barrio = text(point.barrio);
  const rawAddress = text(point.direccion);

  // Cuando la dirección identifica a quien vive ahí, no se guarda ni se titula con ella: el punto
  // entra como «Vivienda afectada — Quimbaya» y conserva su coordenada, su severidad y su fuente.
  // La ubicación sigue sirviendo para coordinar; el nombre de la familia no aportaba nada a eso.
  const identifiesResident = namesAPrivateResident(rawAddress) || namesAPrivateResident(barrio);
  const direccion = identifiesResident ? undefined : rawAddress;
  const title = (direccion ?? `${label} — ${municipio ?? "sin municipio"}`).slice(0, 140);
  if (title.length < 3) return undefined;

  const evidencias = Array.isArray(point.evidencias) ? point.evidencias.length : 0;
  const servicios = Array.isArray(point.serviciosAfectados)
    ? point.serviciosAfectados.map((s) => String(s).trim()).filter(Boolean)
    : [];

  // La descripción va tal cual **solo si no introduce a nadie por su nombre**; si lo hace, se cae
  // entera y el punto conserva todo lo demás. Ver `stripDescriptionWithNames`. Y si la dirección ya
  // identificaba a una familia, su descripción habla de esa misma familia —«la vivienda de mi hijo
  // y la mía se perdieron»— así que se cae con ella.
  const source = identifiesResident ? null : stripDescriptionWithNames(text(point.descripcion));
  const description = [
    source,
    isDamage ? `${label} · ${SEVERITY_LABEL[severity]}` : label,
    point.riesgoInminente === true ? "Riesgo inminente declarado por la fuente" : undefined,
    point.accesoBloqueado === true ? "Acceso bloqueado" : undefined,
    servicios.length > 0 ? `Servicios afectados: ${servicios.join(", ")}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" — ")
    .slice(0, 2_000);

  const personas = point.personas ?? {};
  const trapped = count(personas.atrapados);
  const evacuated = count(personas.evacuados);

  const metadata: CommunityReportMetadata = {
    address: direccion,
    neighborhood: identifiesResident ? undefined : barrio,
    city: municipio,
    department: text(point.departamento),
    sourceStatus: text(point.atencion),
    // Cuántas fuentes independientes respaldan el punto. La fuente lo publica por punto y es la
    // única señal de solidez que traemos: un punto de cinco medios no vale lo mismo que uno de uno.
    corroborationCount: evidencias > 0 ? evidencias : undefined,
    confidence: text(point.precisionUbicacion),
    personsPresent: evacuated,
    // Personas reportadas bajo escombros según la fuente. **No convierte el punto en un `rescate`**:
    // son cifras de prensa del 10 y el 11 de agosto, sin confirmar en ocho de cada nueve casos, y
    // ponerlas por encima de un reporte ciudadano de hace diez minutos rompería lo único que la cola
    // de rescate tiene que garantizar. Viaja como contexto, con su fecha y su fuente a la vista.
    personsNeeded: trapped,
    reportedAt: text(point.creado),
    reportUpdatedAt: text(point.actualizado),
    subSource: "mapadelterremoto.com",
  };

  return {
    externalKey: codigo,
    reportType: isDamage ? "dano" : isRoute ? "via" : "pmu",
    category: null,
    title,
    description: description || null,
    location: { type: "Point", coordinates: [lon, lat] },
    status,
    routeStatus,
    damageSeverity,
    metadata,
  };
}

export type RegistrySnapshot =
  | { changed: false; httpStatus: number; etag: string | null }
  | { changed: true; httpStatus: number; etag: string | null; points: RegistryPoint[] };

/**
 * Descarga condicional: si el ETag no cambió, devuelve 304 y cero bytes.
 *
 * El fichero pesa 4 MB. Sondear cada media hora sin condicional serían ~200 MB al día servidos por
 * alguien que nos está dando los datos gratis. Con `If-None-Match` la mayoría de las corridas no
 * descarga nada, y la tabla `source_ingestion_runs` ya tenía columnas `etag` y estado `unchanged`
 * esperando a que alguien las usara.
 */
export async function fetchRegistrySnapshot(
  previousEtag?: string | null,
): Promise<RegistrySnapshot> {
  const response = await fetch(REGISTRY_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PULSO/0.1 public-emergency-data (+https://pulso.my)",
      ...(previousEtag ? { "If-None-Match": previousEtag } : {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
  const etag = response.headers.get("etag");
  if (response.status === 304)
    return { changed: false, httpStatus: 304, etag: previousEtag ?? etag };
  if (!response.ok) throw new Error(`mapadelterremoto registry returned HTTP ${response.status}`);
  const payload = (await response.json()) as { puntos?: RegistryPoint[] };
  if (!Array.isArray(payload.puntos)) {
    throw new Error("mapadelterremoto registry has no 'puntos' array");
  }
  return { changed: true, httpStatus: response.status, etag, points: payload.puntos };
}

async function upsertCommunityReports(
  sql: Sql,
  incidentCode: string,
  points: MappedRegistryPoint[],
) {
  const [incident] = await sql<
    { id: string }[]
  >`SELECT id FROM incidents WHERE code = ${incidentCode} AND deleted_at IS NULL LIMIT 1`;
  if (!incident) throw new Error(`Incident ${incidentCode} does not exist`);

  await sql`
    INSERT INTO external_sources (
      id, display_name, source_url, authority, data_classification,
      collection_mode, crawl_delay_seconds
    ) VALUES (
      ${MAPADELTERREMOTO_SOURCE.id}, ${MAPADELTERREMOTO_SOURCE.name}, ${MAPADELTERREMOTO_SOURCE.url},
      ${MAPADELTERREMOTO_SOURCE.authority}, ${MAPADELTERREMOTO_SOURCE.classification},
      ${MAPADELTERREMOTO_SOURCE.collectionMode}, ${MAPADELTERREMOTO_SOURCE.crawlDelaySeconds}
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
        status, external_source_id, external_key, client_mutation_id, metadata,
        route_status, damage_severity
      ) VALUES (
        ${randomUUID()}, ${incident.id}, ${point.reportType}, ${point.category}, ${point.title},
        ${point.description},
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(point.location)}), 4326),
        ${point.status}, ${MAPADELTERREMOTO_SOURCE.id}, ${point.externalKey}, ${randomUUID()},
        ${sql.json(point.metadata)}, ${point.routeStatus}, ${point.damageSeverity}
      )
      ON CONFLICT (external_source_id, external_key) WHERE external_source_id IS NOT NULL
      DO UPDATE SET
        report_type = EXCLUDED.report_type,
        category = EXCLUDED.category,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        location = EXCLUDED.location,
        metadata = EXCLUDED.metadata,
        route_status = EXCLUDED.route_status,
        damage_severity = EXCLUDED.damage_severity,
        status = CASE WHEN community_reports.status = 'rejected' THEN community_reports.status
          ELSE EXCLUDED.status END,
        updated_at = now()
    `;
    upserted += 1;
  }
  return upserted;
}

export async function runMapaDelTerremotoIngestion(options: {
  databaseUrl?: string;
  incidentCode: string;
  previousEtag?: string | null;
}) {
  const snapshot = await fetchRegistrySnapshot(options.previousEtag);
  if (!snapshot.changed) {
    return { status: "unchanged" as const, httpStatus: 304, etag: snapshot.etag };
  }

  const points = snapshot.points
    .map(mapRegistryPoint)
    .filter((point): point is MappedRegistryPoint => point !== undefined);

  if (!options.databaseUrl) {
    return {
      status: "preview" as const,
      seen: snapshot.points.length,
      mapped: points.length,
      etag: snapshot.etag,
      points: points.slice(0, 5),
    };
  }

  const sql = postgres(options.databaseUrl, { max: 1 });
  try {
    const upserted = await upsertCommunityReports(sql, options.incidentCode, points);
    return {
      status: "stored" as const,
      seen: snapshot.points.length,
      mapped: points.length,
      upserted,
      httpStatus: snapshot.httpStatus,
      etag: snapshot.etag,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
