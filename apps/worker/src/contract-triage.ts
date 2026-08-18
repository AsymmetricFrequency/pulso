import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });

/**
 * Lectura previa del objeto contractual, para ordenar la cola de revisión de recursos públicos.
 *
 * **Esto no decide nada.** `emergency_relevance` —el campo que suman las cifras públicas— solo lo
 * escribe una persona desde Operaciones, y este trabajo no lo toca. Lo que hace es escribir en
 * columnas aparte lo que el modelo opina tras leer el objeto, para que quien revisa empiece por
 * los veinte contratos que probablemente importan en vez de por los de papelería.
 *
 * El vocabulario es distinto a propósito (`likely`/`unlikely`/`unclear`, no
 * `confirmed`/`unrelated`): una opinión y un veredicto no deben poder confundirse en una consulta.
 *
 * Por qué hace falta: el clasificador por palabras clave de `secop.ts` es honesto pero casi ciego.
 * Sobre los 357 contratos reales de Cali devolvió un solo candidato, y era un falso positivo — un
 * albergue de animales, porque la palabra «albergue» estaba ahí. Ese error no se arregla con más
 * términos; se arregla leyendo, que es exactamente lo que aquí se automatiza.
 */

/**
 * Lo que se le manda al modelo.
 *
 * No lleva el nombre del proveedor, y no es un olvido. En Colombia una parte de los contratos los
 * firman personas naturales, así que ese campo contiene nombres de terceros; el proyecto no envía
 * datos personales a servicios externos. Además no haría falta: lo que decide si un contrato es de
 * la emergencia es su objeto, no quién lo firmó — y saber quién lo firmó solo abriría la puerta a
 * juzgar por el proveedor en vez de por el objeto.
 */
export type TriageInput = {
  externalId: string;
  entityName: string;
  object: string | null;
  modality: string | null;
  contractType: string | null;
  signedAt: string | null;
  totalValue: number;
};

export type TriageVerdict = {
  verdict: "likely" | "unlikely" | "unclear";
  confidence: number;
  rationale: string;
};

const MODEL = "claude-opus-5";

/**
 * Esquema de la respuesta. Con structured outputs el modelo no puede devolver otra forma, así que
 * no hay que parsear a mano ni reintentar por JSON roto.
 */
const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["likely", "unlikely", "unclear"],
      description:
        "likely: el objeto describe atención, respuesta o reconstrucción del sismo. " +
        "unlikely: es operación ordinaria del municipio. " +
        "unclear: el objeto no da para decidir.",
    },
    confidence: {
      type: "number",
      description: "Qué tan seguro estás, de 0 a 1.",
    },
    rationale: {
      type: "string",
      description:
        "Una frase en español que le diga a quien revisa qué mirar. Cita el fragmento del " +
        "objeto en el que te basas.",
    },
  },
  required: ["verdict", "confidence", "rationale"],
  additionalProperties: false,
} as const;

/**
 * La instrucción.
 *
 * Está escrita alrededor del error real que ya cometimos: el albergue de animales. Un modelo que
 * solo sepa «esto suena a emergencia» repite ese error, así que se le pide lo contrario — que
 * distinga el objeto real del contrato de las palabras que contiene, y que pueda decir que no
 * sabe. Poder abstenerse es lo que hace útil el resto: si todo tiene que caer en likely/unlikely,
 * los dudosos contaminan ambos lados y la cola vuelve a no ordenar nada.
 */
const SYSTEM_PROMPT = `Lees objetos de contratos públicos colombianos (SECOP II) firmados por
entidades de territorios afectados por el sismo de agosto de 2026, y dices si el contrato responde
a esa emergencia.

Tu respuesta ordena una cola de revisión humana. No decide nada: una persona lee después y confirma.
Eso significa que un "unclear" honesto es útil y un "likely" forzado no.

Que un contrato se haya firmado después del sismo no lo hace de la emergencia. La mayoría de lo que
un municipio contrata esos días es su operación ordinaria —aseo, papelería, nómina, mantenimiento
rutinario, contratos de vigencias anteriores— y va en unlikely.

Juzga el objeto real del contrato, no las palabras que aparecen en él. Un contrato de "servicios de
apoyo en el área de albergue y clínica acompañando los procesos de adopción de animales" contiene
la palabra albergue y no tiene nada que ver con la emergencia: es un albergue de animales. Ese caso
es real y es el que hay que evitar.

Van en likely: remoción de escombros, evaluación estructural o de habitabilidad, alojamiento
temporal de damnificados, ayuda humanitaria, agua y saneamiento de emergencia, atención en salud
derivada del sismo, reconstrucción o reforzamiento de infraestructura dañada, maquinaria para
remoción, logística de respuesta.

La urgencia manifiesta como modalidad es una señal fuerte pero no concluyente: se usa también para
cosas que no son la emergencia. Menciónala en tu razón cuando pese.

Escribe la razón en español, en una frase, citando el fragmento del objeto en el que te basas.`;

let cached: Anthropic | null = null;
/** Perezoso: importar este módulo en una prueba no debe exigir una llave de API. */
const client = () => {
  cached ??= new Anthropic();
  return cached;
};

/** Arma el texto que ve el modelo. Separado para poder afirmar en pruebas qué contiene y qué no. */
export function buildContractText(input: TriageInput): string {
  return [
    `Entidad contratante: ${input.entityName}`,
    `Objeto: ${input.object ?? "(sin objeto publicado)"}`,
    `Modalidad: ${input.modality ?? "(no publicada)"}`,
    `Tipo: ${input.contractType ?? "(no publicado)"}`,
    `Firmado: ${input.signedAt?.slice(0, 10) ?? "(sin fecha)"}`,
    `Valor: ${input.totalValue.toLocaleString("es-CO")} COP`,
  ].join("\n");
}

/** Pide la lectura de un contrato. Un contrato por petición: son cortos y así el trabajo reanuda. */
export async function triageContract(input: TriageInput): Promise<TriageVerdict> {
  const contractText = buildContractText(input);

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    // Clasificar contra una regla explícita no necesita razonamiento profundo, y el efecto de
    // bajar el esfuerzo sobre 356 llamadas es directo en costo y en latencia.
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: VERDICT_SCHEMA },
    },
    messages: [{ role: "user", content: contractText }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`El modelo declinó leer el contrato ${input.externalId}`);
  }

  const block = response.content.find((item) => item.type === "text");
  if (block?.type !== "text") {
    throw new Error(`Respuesta sin texto para el contrato ${input.externalId}`);
  }
  const parsed = JSON.parse(block.text) as TriageVerdict;
  // La confianza viene de un campo numérico libre: acotarla evita que un 1.5 rompa el CHECK.
  return { ...parsed, confidence: Math.min(Math.max(parsed.confidence, 0), 1) };
}

type ContractRow = {
  id: string;
  external_id: string;
  entity_name: string;
  object: string | null;
  modality: string | null;
  contract_type: string | null;
  signed_at: string | null;
  total_value: string;
};

export type TriageRunResult = {
  incidentCode: string;
  model: string;
  considered: number;
  triaged: number;
  failed: number;
  byVerdict: Record<TriageVerdict["verdict"], number>;
};

/**
 * Recorre los contratos sin lectura previa y los va marcando.
 *
 * Reanudable por diseño: el filtro es `triage_at IS NULL`, así que una corrida interrumpida a la
 * mitad no vuelve a pagar lo ya leído. Se escribe contrato por contrato en lugar de al final por
 * la misma razón.
 */
export async function runContractTriage(options: {
  databaseUrl?: string;
  incidentCode: string;
  limit?: number;
  concurrency?: number;
}): Promise<TriageRunResult> {
  const sql = postgres(options.databaseUrl ?? process.env.DATABASE_URL ?? "", { max: 4 });
  const byVerdict: TriageRunResult["byVerdict"] = { likely: 0, unlikely: 0, unclear: 0 };
  let triaged = 0;
  let failed = 0;

  try {
    const [incident] = await sql<{ id: string }[]>`
      SELECT id FROM incidents WHERE code = ${options.incidentCode}
    `;
    if (!incident) throw new Error(`No existe la emergencia ${options.incidentCode}`);

    const rows = await sql<ContractRow[]>`
      SELECT c.id, c.external_id, c.object, c.modality, c.contract_type, c.signed_at,
             c.total_value, e.name AS entity_name
      FROM contracts c
      JOIN public_entities e ON e.id = c.entity_id
      WHERE c.incident_id = ${incident.id}
        AND c.triage_at IS NULL
        AND c.reviewed_at IS NULL
      ORDER BY c.total_value DESC
      LIMIT ${options.limit ?? 500}
    `;

    // Se leen varios a la vez, pero pocos: el límite de peticiones es compartido con el resto del
    // proyecto y este trabajo no tiene ninguna prisa.
    const concurrency = Math.min(Math.max(options.concurrency ?? 4, 1), 8);
    const queue = [...rows];

    const worker = async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        try {
          const verdict = await triageContract({
            externalId: row.external_id,
            entityName: row.entity_name,
            object: row.object,
            modality: row.modality,
            contractType: row.contract_type,
            signedAt: row.signed_at,
            totalValue: Number.parseFloat(row.total_value),
          });
          await sql`
            UPDATE contracts SET
              triage_verdict = ${verdict.verdict},
              triage_confidence = ${verdict.confidence},
              triage_rationale = ${verdict.rationale},
              triage_model = ${MODEL},
              triage_at = now(),
              updated_at = now()
            WHERE id = ${row.id}
          `;
          byVerdict[verdict.verdict] += 1;
          triaged += 1;
        } catch (error) {
          // Un contrato que falla no detiene la tanda, pero se cuenta y se dice: una corrida que
          // reporta 300 de 356 sin mencionar los 56 restantes es peor que una que falla entera.
          failed += 1;
          console.error(`[triage] ${row.external_id}:`, (error as Error).message);
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));

    return {
      incidentCode: options.incidentCode,
      model: MODEL,
      considered: rows.length,
      triaged,
      failed,
      byVerdict,
    };
  } finally {
    await sql.end();
  }
}
