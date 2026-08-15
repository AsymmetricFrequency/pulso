import { randomUUID } from "node:crypto";
import postgres from "postgres";

// Reference data for reconstruction materials — code/category/dimension/canonical_unit only,
// no incident-specific data. Idempotent upsert, safe to re-run.
const CATALOG_ITEMS = [
  {
    code: "ladrillo",
    name: "Ladrillo",
    category: "estructura",
    dimension: "count",
    unit: "unidad",
  },
  {
    code: "bloque-concreto",
    name: "Bloque de concreto",
    category: "estructura",
    dimension: "count",
    unit: "unidad",
  },
  { code: "cemento", name: "Cemento", category: "estructura", dimension: "mass", unit: "kg" },
  {
    code: "varilla",
    name: "Varilla / hierro de refuerzo",
    category: "estructura",
    dimension: "length",
    unit: "m",
  },
  { code: "arena", name: "Arena", category: "estructura", dimension: "volume", unit: "m3" },
  {
    code: "gravilla",
    name: "Gravilla / triturado",
    category: "estructura",
    dimension: "volume",
    unit: "m3",
  },
  { code: "madera", name: "Madera", category: "estructura", dimension: "count", unit: "unidad" },
  {
    code: "teja-zinc",
    name: "Teja de zinc",
    category: "cubierta",
    dimension: "count",
    unit: "unidad",
  },
  {
    code: "teja-barro",
    name: "Teja de barro",
    category: "cubierta",
    dimension: "count",
    unit: "unidad",
  },
  {
    code: "lamina-fibrocemento",
    name: "Lámina de fibrocemento",
    category: "cubierta",
    dimension: "count",
    unit: "unidad",
  },
  {
    code: "clavos",
    name: "Clavos / puntillas",
    category: "acabados",
    dimension: "mass",
    unit: "kg",
  },
  { code: "pintura", name: "Pintura", category: "acabados", dimension: "volume", unit: "gal" },
  {
    code: "tuberia-pvc",
    name: "Tubería PVC",
    category: "instalaciones",
    dimension: "length",
    unit: "m",
  },
  {
    code: "cable-electrico",
    name: "Cable eléctrico",
    category: "instalaciones",
    dimension: "length",
    unit: "m",
  },
] as const;

export async function runSeedMaterialCatalog(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    let upserted = 0;
    for (const item of CATALOG_ITEMS) {
      await sql`
        INSERT INTO material_catalog_items (
          id, code, name, category, dimension, canonical_unit
        ) VALUES (
          ${randomUUID()}, ${item.code}, ${item.name}, ${item.category}, ${item.dimension}, ${item.unit}
        )
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          dimension = EXCLUDED.dimension,
          canonical_unit = EXCLUDED.canonical_unit,
          updated_at = now()
      `;
      upserted += 1;
    }
    return { status: "seeded" as const, upserted };
  } finally {
    await sql.end();
  }
}
