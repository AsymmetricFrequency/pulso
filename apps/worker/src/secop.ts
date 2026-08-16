import { createHash, randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";

/**
 * Adaptador mínimo de SECOP II (paso 7 del plan P0).
 *
 * Trae los contratos electrónicos publicados por Colombia Compra Eficiente en el portal de datos
 * abiertos, que es una fuente legible por máquina, incremental y con identificador estable — lo
 * contrario del HTML raspado que hoy bloquea la ingesta de Cali.
 *
 * Lo que este adaptador NO hace, y es deliberado: no declara que un contrato pertenece a la
 * emergencia solo porque se firmó después del sismo en un territorio afectado. La mayoría de lo
 * que un municipio contrata esos días es su operación ordinaria —prestación de servicios
 * profesionales, sobre todo—, y sumarlo todo bajo "recursos de la emergencia" sería inventar una
 * relación que los datos no sostienen. La relevancia se marca por señales explícitas y lo que no
 * alcanza a ser probable queda como `unreviewed`, para que una persona lo decida.
 */
export const SECOP_SOURCE = {
  id: "secop-ii-contratos",
  name: "SECOP II — Contratos electrónicos (Colombia Compra Eficiente)",
  url: "https://www.datos.gov.co/resource/jbjy-vk9h.json",
  authority: "official",
  classification: "public_operational",
  collectionMode: "api",
  crawlDelaySeconds: 60,
} as const;

export const SECOP_PARSER_VERSION = "secop-contracts/1";

/** Campos que se piden a la fuente. Todo lo demás se deja donde está: ver la migración 020. */
const SELECT_FIELDS = [
  "id_contrato",
  "referencia_del_contrato",
  "nombre_entidad",
  "nit_entidad",
  "orden",
  "sector",
  "proveedor_adjudicado",
  "documento_proveedor",
  "tipodocproveedor",
  "objeto_del_contrato",
  "tipo_de_contrato",
  "modalidad_de_contratacion",
  "justificacion_modalidad_de",
  "estado_contrato",
  "fecha_de_firma",
  "fecha_de_inicio_del_contrato",
  "fecha_de_fin_del_contrato",
  "valor_del_contrato",
  "valor_facturado",
  "valor_pagado",
  "origen_de_los_recursos",
  "departamento",
  "ciudad",
  "proceso_de_compra",
  "urlproceso",
].join(",");

export type SecopContractRow = Record<string, unknown>;

/**
 * Señales de que un contrato sí responde a la emergencia.
 *
 * Son términos del objeto contractual, no de la entidad: una secretaría de educación puede
 * contratar tanto un docente como la demolición de un colegio colapsado, y solo el objeto
 * distingue uno de otro.
 */
const EMERGENCY_TERMS = [
  "sismo",
  "terremoto",
  "telurico",
  "telúrico",
  "emergencia",
  "calamidad",
  "damnificad",
  "albergue",
  "alojamiento temporal",
  "ayuda humanitaria",
  "atencion humanitaria",
  "atención humanitaria",
  "reconstruccion",
  "reconstrucción",
  "demolicion",
  "demolición",
  "escombro",
  "evaluacion estructural",
  "evaluación estructural",
  "reforzamiento estructural",
  "vulnerabilidad sismica",
  "vulnerabilidad sísmica",
  "desastre",
  "gestion del riesgo",
  "gestión del riesgo",
];

/** Términos que por sí solos no bastan, pero suman cuando aparecen junto a la urgencia. */
const SUPPORTING_TERMS = [
  "urgencia manifiesta",
  "kit",
  "carpa",
  "colchoneta",
  "mercado",
  "agua potable",
  "maquinaria amarilla",
  "remocion",
  "remoción",
];

const normalize = (value: string) => value.toLowerCase();

export type RelevanceAssessment = {
  /** El clasificador solo propone: `confirmed` y `unrelated` los decide una persona. */
  relevance: "probable" | "unreviewed";
  signals: {
    emergencyTerms: string[];
    supportingTerms: string[];
    declaredUrgency: boolean;
    strength: "strong" | "weak" | "none";
  };
};

/**
 * Propone si un contrato podría responder a la emergencia, a partir de su objeto y su modalidad.
 *
 * **Este clasificador nunca confirma nada.** Su techo es `probable`, y no por prudencia genérica:
 * la primera corrida sobre los 357 contratos reales de Cali devolvió un único candidato, y era un
 * falso positivo — "servicios de apoyo en el área de albergue y clínica acompañando los procesos
 * de adopción de animales". La palabra «albergue» aparecía, pero se trataba de un albergue de
 * animales, no de damnificados. Un contador de palabras no distingue eso y ninguna cantidad de
 * términos adicionales lo arreglaría; lo que cambia el resultado es que alguien lea el objeto.
 *
 * Por eso `emergency_relevance` solo llega a `confirmed` por revisión humana, y las cifras
 * públicas suman lo confirmado, no lo propuesto. Tampoco devuelve `unrelated`: la ausencia de
 * señales significa que aquí no se encontró evidencia, no que exista evidencia de lo contrario.
 * Descartar también es una afirmación.
 */
export function assessEmergencyRelevance(input: {
  object?: string | null;
  modality?: string | null;
  justification?: string | null;
}): RelevanceAssessment {
  const haystack = normalize(
    [input.object ?? "", input.modality ?? "", input.justification ?? ""].join(" · "),
  );
  const emergencyTerms = EMERGENCY_TERMS.filter((term) => haystack.includes(term));
  const supportingTerms = SUPPORTING_TERMS.filter((term) => haystack.includes(term));
  const declaredUrgency = haystack.includes("urgencia manifiesta");

  // La fuerza no cambia el veredicto, ordena la cola de revisión: quien revisa empieza por los
  // candidatos con varias señales o con urgencia declarada.
  const strength: RelevanceAssessment["signals"]["strength"] =
    emergencyTerms.length > 1 || (emergencyTerms.length > 0 && declaredUrgency)
      ? "strong"
      : emergencyTerms.length > 0 || (declaredUrgency && supportingTerms.length > 0)
        ? "weak"
        : "none";

  return {
    relevance: strength === "none" ? "unreviewed" : "probable",
    signals: { emergencyTerms, supportingTerms, declaredUrgency, strength },
  };
}

const asText = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
};

const asAmount = (value: unknown): number => {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const asTimestamp = (value: unknown): string | null => {
  const text = asText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const asUrl = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "url" in value) {
    return asText((value as { url?: unknown }).url);
  }
  return null;
};

/**
 * Huella del documento del proveedor: permite cruzar al mismo proveedor entre contratos sin
 * guardar el número. La sal por incidente evita que la huella sirva para cruzar personas entre
 * emergencias distintas.
 */
export const supplierFingerprint = (document: string, incidentCode: string) =>
  createHash("sha256").update(`secop-supplier:${incidentCode}:${document}`).digest("hex");

const isNit = (documentType: string | null) => Boolean(documentType?.toUpperCase().includes("NIT"));

export type MappedContract = {
  externalId: string;
  reference: string | null;
  entityNit: string;
  entityName: string;
  entityOrder: "national" | "departmental" | "municipal" | "other" | null;
  entitySector: string | null;
  supplierName: string;
  /** Solo se conserva cuando es un NIT: ver la migración 020. */
  supplierDocument: string | null;
  supplierDocumentType: string | null;
  supplierFingerprint: string | null;
  object: string | null;
  contractType: string | null;
  modality: string | null;
  status: string | null;
  signedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  totalValue: number;
  invoicedValue: number;
  paidValue: number;
  departmentName: string | null;
  cityName: string | null;
  processExternalId: string | null;
  sourceUrl: string | null;
  relevance: RelevanceAssessment;
};

const ORDER_MAP: Record<string, MappedContract["entityOrder"]> = {
  nacional: "national",
  territorial: "municipal",
};

export function mapSecopContract(
  row: SecopContractRow,
  incidentCode: string,
): MappedContract | undefined {
  const externalId = asText(row.id_contrato);
  const entityNit = asText(row.nit_entidad);
  const entityName = asText(row.nombre_entidad);
  const supplierName = asText(row.proveedor_adjudicado);
  // Sin identificador estable no hay ingesta idempotente, y sin entidad ni proveedor el contrato
  // no dice quién pagó ni a quién: en cualquiera de esos casos la fila no sirve para rastrear.
  if (!externalId || !entityNit || !entityName || !supplierName) return undefined;

  const documentType = asText(row.tipodocproveedor);
  const document = asText(row.documento_proveedor);

  return {
    externalId,
    reference: asText(row.referencia_del_contrato),
    entityNit,
    entityName,
    entityOrder: ORDER_MAP[normalize(asText(row.orden) ?? "")] ?? "other",
    entitySector: asText(row.sector),
    supplierName,
    supplierDocument: document && isNit(documentType) ? document : null,
    supplierDocumentType: documentType,
    supplierFingerprint: document ? supplierFingerprint(document, incidentCode) : null,
    object: asText(row.objeto_del_contrato),
    contractType: asText(row.tipo_de_contrato),
    modality: asText(row.modalidad_de_contratacion),
    status: asText(row.estado_contrato),
    signedAt: asTimestamp(row.fecha_de_firma),
    startedAt: asTimestamp(row.fecha_de_inicio_del_contrato),
    endedAt: asTimestamp(row.fecha_de_fin_del_contrato),
    totalValue: asAmount(row.valor_del_contrato),
    invoicedValue: asAmount(row.valor_facturado),
    paidValue: asAmount(row.valor_pagado),
    departmentName: asText(row.departamento),
    cityName: asText(row.ciudad),
    processExternalId: asText(row.proceso_de_compra),
    sourceUrl: asUrl(row.urlproceso),
    relevance: assessEmergencyRelevance({
      object: asText(row.objeto_del_contrato),
      modality: asText(row.modalidad_de_contratacion),
      justification: asText(row.justificacion_modalidad_de),
    }),
  };
}

export async function fetchSecopContracts(options: {
  cities: string[];
  signedFrom: string;
  limit: number;
}): Promise<SecopContractRow[]> {
  const cityFilter = options.cities
    .map((city) => `ciudad='${city.replace(/'/g, "''")}'`)
    .join(" OR ");
  const where = `(${cityFilter}) AND fecha_de_firma > '${options.signedFrom}'`;
  const url =
    `${SECOP_SOURCE.url}?$select=${encodeURIComponent(SELECT_FIELDS)}` +
    `&$where=${encodeURIComponent(where)}` +
    `&$order=${encodeURIComponent("fecha_de_firma DESC")}` +
    `&$limit=${options.limit}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PULSO/0.1 public-emergency-data (+https://pulso.my)",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`SECOP feed returned HTTP ${response.status}`);
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) throw new Error("SECOP feed did not return an array");
  return payload as SecopContractRow[];
}

const contentHashOf = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * Cruza el departamento que declara SECOP con los polígonos del DANE ya cargados.
 *
 * El cruce es por nombre en mayúsculas y no por código porque SECOP publica el nombre, no el
 * código DANE. Cuando no coincide —un nombre escrito distinto, una tilde de más— el territorio
 * queda nulo y el contrato sigue siendo válido: perder la ubicación es preferible a asignarle un
 * departamento equivocado, que contaminaría todos los agregados territoriales.
 */
async function resolveTerritoryId(
  sql: Sql,
  incidentId: string,
  departmentName: string | null,
): Promise<string | null> {
  if (!departmentName) return null;
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM territories
    WHERE incident_id = ${incidentId}
      AND territory_type = 'department'
      AND deleted_at IS NULL
      AND upper(name) = upper(${departmentName})
    LIMIT 1
  `;
  return row?.id ?? null;
}

/**
 * Guarda un contrato y su recorrido financiero.
 *
 * Los tres montos que publica SECOP —contratado, facturado, pagado— se escriben como etapas de
 * `funding_flows` además de como estado del contrato: el contrato dice dónde está hoy, los flujos
 * dicen cómo llegó ahí. Solo se registran las etapas con monto mayor que cero, porque un flujo de
 * cero no es un movimiento, es la ausencia de uno.
 */
async function persistContract(
  sql: Sql,
  context: { incidentId: string; incidentCode: string; runId: string; retrievedAt: string },
  contract: MappedContract,
  raw: SecopContractRow,
) {
  const provenanceId = randomUUID();
  const contentHash = contentHashOf(raw);
  await sql`
    INSERT INTO provenance_records (
      id, source_id, source_system, source_reference, source_url, content_hash,
      parser_version, retrieved_at, published_at, effective_at, normalization_status, correlation_id
    ) VALUES (
      ${provenanceId}, ${SECOP_SOURCE.id}, 'secop-ii', ${contract.externalId},
      ${contract.sourceUrl}, ${contentHash}, ${SECOP_PARSER_VERSION}, ${context.retrievedAt},
      ${contract.signedAt}, ${contract.signedAt}, 'normalized', ${context.runId}
    )
    ON CONFLICT (source_id, source_reference, content_hash) DO UPDATE SET
      retrieved_at = EXCLUDED.retrieved_at
  `;
  const [provenance] = await sql<{ id: string }[]>`
    SELECT id FROM provenance_records
    WHERE source_id = ${SECOP_SOURCE.id} AND source_reference = ${contract.externalId}
      AND content_hash = ${contentHash}
    LIMIT 1
  `;
  if (!provenance) throw new Error("No se pudo registrar la procedencia del contrato");

  const territoryId = await resolveTerritoryId(sql, context.incidentId, contract.departmentName);

  const entityId = randomUUID();
  await sql`
    INSERT INTO public_entities (id, nit, name, order_level, sector, territory_id)
    VALUES (${entityId}, ${contract.entityNit}, ${contract.entityName},
            ${contract.entityOrder}, ${contract.entitySector}, ${territoryId})
    ON CONFLICT (nit) DO UPDATE SET
      name = EXCLUDED.name, sector = EXCLUDED.sector, updated_at = now()
  `;
  const [entity] = await sql<{ id: string }[]>`
    SELECT id FROM public_entities WHERE nit = ${contract.entityNit} LIMIT 1
  `;
  if (!entity) throw new Error("No se pudo registrar la entidad contratante");

  let processId: string | null = null;
  if (contract.processExternalId) {
    await sql`
      INSERT INTO procurement_processes (
        id, incident_id, entity_id, territory_id, external_id, modality, object,
        published_at, source_url, provenance_id
      ) VALUES (
        ${randomUUID()}, ${context.incidentId}, ${entity.id}, ${territoryId},
        ${contract.processExternalId}, ${contract.modality}, ${contract.object},
        ${contract.signedAt}, ${contract.sourceUrl}, ${provenance.id}
      )
      ON CONFLICT (incident_id, external_id) DO UPDATE SET
        modality = EXCLUDED.modality, updated_at = now()
    `;
    const [process] = await sql<{ id: string }[]>`
      SELECT id FROM procurement_processes
      WHERE incident_id = ${context.incidentId} AND external_id = ${contract.processExternalId}
      LIMIT 1
    `;
    processId = process?.id ?? null;
  }

  await sql`
    INSERT INTO contracts (
      id, incident_id, entity_id, process_id, territory_id, external_id, reference,
      supplier_name, supplier_document, supplier_document_type, supplier_fingerprint,
      emergency_relevance, relevance_signals, object, contract_type, modality, status,
      signed_at, started_at, ended_at, total_value, invoiced_value, paid_value,
      source_url, provenance_id
    ) VALUES (
      ${randomUUID()}, ${context.incidentId}, ${entity.id}, ${processId}, ${territoryId},
      ${contract.externalId}, ${contract.reference}, ${contract.supplierName},
      ${contract.supplierDocument}, ${contract.supplierDocumentType},
      ${contract.supplierFingerprint}, ${contract.relevance.relevance},
      ${sql.json(contract.relevance.signals)}, ${contract.object}, ${contract.contractType},
      ${contract.modality}, ${contract.status}, ${contract.signedAt}, ${contract.startedAt},
      ${contract.endedAt}, ${contract.totalValue}, ${contract.invoicedValue},
      ${contract.paidValue}, ${contract.sourceUrl}, ${provenance.id}
    )
    ON CONFLICT (incident_id, external_id) DO UPDATE SET
      status = EXCLUDED.status,
      total_value = EXCLUDED.total_value,
      invoiced_value = EXCLUDED.invoiced_value,
      paid_value = EXCLUDED.paid_value,
      territory_id = EXCLUDED.territory_id,
      process_id = EXCLUDED.process_id,
      provenance_id = EXCLUDED.provenance_id,
      -- La relevancia revisada por una persona no se pisa con la del clasificador automático.
      emergency_relevance = CASE
        WHEN contracts.emergency_relevance IN ('confirmed', 'unrelated') THEN contracts.emergency_relevance
        ELSE EXCLUDED.emergency_relevance END,
      relevance_signals = EXCLUDED.relevance_signals,
      updated_at = now()
  `;
  const [stored] = await sql<{ id: string }[]>`
    SELECT id FROM contracts
    WHERE incident_id = ${context.incidentId} AND external_id = ${contract.externalId}
    LIMIT 1
  `;
  if (!stored) throw new Error("No se pudo registrar el contrato");

  const stages: Array<{ stage: string; amount: number; occurredAt: string | null }> = [
    { stage: "contracted", amount: contract.totalValue, occurredAt: contract.signedAt },
    { stage: "obligated", amount: contract.invoicedValue, occurredAt: contract.signedAt },
    { stage: "paid", amount: contract.paidValue, occurredAt: contract.signedAt },
  ];
  for (const stage of stages) {
    if (stage.amount <= 0 || !stage.occurredAt) continue;
    await sql`
      INSERT INTO funding_flows (
        id, incident_id, entity_id, contract_id, territory_id, stage, amount,
        occurred_at, confidence, verification_status, provenance_id
      ) VALUES (
        ${randomUUID()}, ${context.incidentId}, ${entity.id}, ${stored.id}, ${territoryId},
        ${stage.stage}, ${stage.amount}, ${stage.occurredAt}, 'reported', 'unverified',
        ${provenance.id}
      )
      ON CONFLICT (incident_id, contract_id, stage, occurred_at) DO UPDATE SET
        amount = EXCLUDED.amount, provenance_id = EXCLUDED.provenance_id
    `;
  }

  return stored.id;
}

export async function runSecopIngestion(options: {
  databaseUrl?: string;
  incidentCode: string;
  cities?: string[];
  signedFrom?: string;
  limit?: number;
}) {
  const cities = options.cities ?? ["Cali"];
  const signedFrom = options.signedFrom ?? "2026-08-10";
  const limit = options.limit ?? 1_000;
  const rows = await fetchSecopContracts({ cities, signedFrom, limit });
  const contracts = rows
    .map((row) => mapSecopContract(row, options.incidentCode))
    .filter((contract): contract is MappedContract => contract !== undefined);

  const relevant = contracts.filter((contract) => contract.relevance.relevance !== "unreviewed");

  if (!options.databaseUrl) {
    return {
      status: "preview" as const,
      seen: rows.length,
      mapped: contracts.length,
      relevant: relevant.length,
      contracts: contracts.slice(0, 20),
    };
  }

  const sql = postgres(options.databaseUrl, { max: 1 });
  try {
    const [incident] = await sql<{ id: string }[]>`
      SELECT id FROM incidents WHERE code = ${options.incidentCode} AND deleted_at IS NULL LIMIT 1
    `;
    if (!incident) throw new Error(`Incident ${options.incidentCode} does not exist`);

    await sql`
      INSERT INTO external_sources (
        id, display_name, source_url, authority, data_classification,
        collection_mode, crawl_delay_seconds
      ) VALUES (
        ${SECOP_SOURCE.id}, ${SECOP_SOURCE.name}, ${SECOP_SOURCE.url}, ${SECOP_SOURCE.authority},
        ${SECOP_SOURCE.classification}, ${SECOP_SOURCE.collectionMode},
        ${SECOP_SOURCE.crawlDelaySeconds}
      )
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name, source_url = EXCLUDED.source_url,
        active = true, updated_at = now()
    `;

    const context = {
      incidentId: incident.id,
      incidentCode: options.incidentCode,
      runId: randomUUID(),
      retrievedAt: new Date().toISOString(),
    };
    let upserted = 0;
    for (const [index, contract] of contracts.entries()) {
      const raw = rows[index];
      if (!raw) continue;
      await persistContract(sql, context, contract, raw);
      upserted += 1;
    }

    return {
      status: "stored" as const,
      seen: rows.length,
      mapped: contracts.length,
      relevant: relevant.length,
      upserted,
    };
  } finally {
    await sql.end();
  }
}
