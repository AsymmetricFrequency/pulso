import { createHash } from "node:crypto";
import postgres from "postgres";

// Real construction-material suppliers in Cali, sourced from two independently verifiable
// public datasets — never fabricated coordinates or invented businesses:
//   1. Homecenter (Sodimac/Corona) — a national big-box chain; each location cross-checked
//      against homecenter.com.co's own store list AND OpenStreetMap's `shop=department_store`
//      node for "Homecenter" in Cali (both agree on the same three sites).
//   2. Independent ferreterías — every other entry here is a real `shop=hardware` /
//      `shop=doityourself` / `shop=trade` point mapped in OpenStreetMap within Cali's urban
//      area (fetched via Overpass API), kept only when it has a real name tag. A handful of
//      OSM entries were excluded because they specialize in products outside this catalog
//      (ceramics/porcelain, a fragrance distributor) rather than structural materials.
// This is NOT exhaustive — OSM's coverage of small Colombian ferreterías is incomplete, and
// this seed doesn't claim otherwise. It's a real, publicly-verifiable starting directory;
// anyone can still self-register their own business through the public form.

const FULL_CATALOG = [
  "ladrillo",
  "bloque-concreto",
  "cemento",
  "varilla",
  "arena",
  "gravilla",
  "madera",
  "teja-zinc",
  "teja-barro",
  "lamina-fibrocemento",
  "clavos",
  "pintura",
  "tuberia-pvc",
  "cable-electrico",
];
const GENERAL_HARDWARE_STAPLES = ["cemento", "varilla", "ladrillo", "arena", "clavos"];

type SeedSupplier = {
  externalKey: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  verificationLevel: "corroborated" | "reported";
  catalogItemCodes: string[];
};

const HOMECENTER_LOCATIONS: SeedSupplier[] = [
  {
    externalKey: "osm:relation/6656598",
    name: "Homecenter Santa Mónica",
    lat: 3.472455,
    lng: -76.5289845,
    address: "Calle 30 Norte, Santa Mónica, Cali",
    verificationLevel: "corroborated",
    catalogItemCodes: FULL_CATALOG,
  },
  {
    externalKey: "osm:relation/6119666",
    name: "Homecenter Jardín Plaza",
    lat: 3.3680762,
    lng: -76.5265623,
    address: "Calle 25, Urbanización San Joaquín, Cali",
    verificationLevel: "corroborated",
    catalogItemCodes: FULL_CATALOG,
  },
  {
    externalKey: "osm:node/14090614821",
    name: "Homecenter Unicentro",
    lat: 3.413672,
    lng: -76.5488578,
    address: "Carrera 52, Unidad Deportiva Alberto Galindo, Cali",
    verificationLevel: "corroborated",
    catalogItemCodes: FULL_CATALOG,
  },
];

const FERRETERIAS: SeedSupplier[] = [
  {
    externalKey: "osm:node/1742284027",
    name: "Ferretería El Mago",
    lat: 3.485639,
    lng: -76.500886,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/2725886880",
    name: "Impofer",
    lat: 3.475389,
    lng: -76.504653,
    address: "Carrera 1, Cali",
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/4077043461",
    name: "Milen Internacional",
    lat: 3.45321,
    lng: -76.52848,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/4527318093",
    name: "Piñas Bronces y Aluminios",
    lat: 3.484659,
    lng: -76.483633,
    address: "Carrera 1A7 76-04, Cali",
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/4540520001",
    name: "Ferretería Super Center",
    lat: 3.417801,
    lng: -76.516309,
    address: "Carrera 40B 27-85, Cali",
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/4569035490",
    name: "Centro Eléctrico Alameda",
    lat: 3.434722,
    lng: -76.534865,
    address: "Calle 9 23C-36, Cali",
    verificationLevel: "reported",
    catalogItemCodes: ["cable-electrico"],
  },
  {
    externalKey: "osm:node/5316727036",
    name: "Ferromax",
    lat: 3.429207,
    lng: -76.498856,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/5353717722",
    name: "Fabio Jaramillo y CIA",
    lat: 3.446003,
    lng: -76.532483,
    address: "Calle 10 11-08, Cali",
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/5476474459",
    name: "Ferretería Pinturas",
    lat: 3.440421,
    lng: -76.498685,
    address: "Calle 52, Cali",
    verificationLevel: "reported",
    catalogItemCodes: ["pintura"],
  },
  {
    externalKey: "osm:node/5479115388",
    name: "Ferretería y Almacén JP",
    lat: 3.448269,
    lng: -76.499214,
    address: "Calle 52, Cali",
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/5488967708",
    name: "Ferretería Diego",
    lat: 3.438303,
    lng: -76.497937,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/5497508959",
    name: "Suproveedor",
    lat: 3.475437,
    lng: -76.504516,
    address: "Carrera 1, Cali",
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/5507101816",
    name: "Ferretería El Nogal",
    lat: 3.419252,
    lng: -76.495258,
    address: "Carrera 28F, Cali",
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/5507102987",
    name: "FerroMateriales J.F",
    lat: 3.420673,
    lng: -76.492658,
    address: "Calle 72U, Cali",
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/5763730430",
    name: "Ferretería La Mayor",
    lat: 3.337448,
    lng: -76.524733,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/5763732718",
    name: "Ferretería El Crucero",
    lat: 3.42323,
    lng: -76.503612,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/6211574211",
    name: "Arquialuvidrios y Aceros del Valle",
    lat: 3.417397,
    lng: -76.527413,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: ["varilla"],
  },
  {
    externalKey: "osm:node/6426796128",
    name: "Ferretería y Tornillería",
    lat: 3.400011,
    lng: -76.506173,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/6849053970",
    name: "Ferretería ALFA",
    lat: 3.386749,
    lng: -76.544329,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/7192204166",
    name: "Ferretería Lenis",
    lat: 3.496405,
    lng: -76.497347,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/9402672817",
    name: "Pinturas Quindío",
    lat: 3.471353,
    lng: -76.502595,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: ["pintura"],
  },
  {
    externalKey: "osm:node/9404666525",
    name: "Ferretería La 44",
    lat: 3.434299,
    lng: -76.500984,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/9404666526",
    name: "Ferretería Restrepo",
    lat: 3.472299,
    lng: -76.511742,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/13959071588",
    name: "Ferretería Ferromax (Meléndez)",
    lat: 3.36081,
    lng: -76.508706,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:node/14048811501",
    name: "Ferretería El Martillo, Don Oscar",
    lat: 3.430779,
    lng: -76.485843,
    address: null,
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:way/572112622",
    name: "Ferretería Reina",
    lat: 3.472572,
    lng: -76.508703,
    address: "Carrera 1, Cali",
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
  {
    externalKey: "osm:way/750229274",
    name: "Ferretería De La Pava",
    lat: 3.452488,
    lng: -76.528744,
    address: "Carrera 6 15-45, Cali",
    verificationLevel: "reported",
    catalogItemCodes: GENERAL_HARDWARE_STAPLES,
  },
];

export const CALI_SUPPLIERS: SeedSupplier[] = [...HOMECENTER_LOCATIONS, ...FERRETERIAS];

// Stable per-supplier id derived from its OSM identity, so re-running this seed updates the
// same rows instead of duplicating them — same idempotency goal as the material-catalog seed,
// adapted for a table whose uniqueness key is (incident_id, client_mutation_id).
// Produces a valid, RFC-4122-shaped UUID (version 4, correct variant nibble) so it passes the
// same `z.uuid()` validation as a randomly generated one — a plain hash-sliced UUID fails that
// check whenever its hash bits don't happen to land on a valid version/variant nibble, which
// silently broke the public material-suppliers list for every request (Zod rejects the whole
// array response if even one row's id fails validation).
function deterministicUuid(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  const version = "4";
  const variant = ((Number.parseInt(hash[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    version + hash.slice(13, 16),
    variant + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

export async function runSeedCaliSuppliers(databaseUrl: string, incidentCode: string) {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [incident] = await sql<
      { id: string }[]
    >`SELECT id FROM incidents WHERE code = ${incidentCode} AND deleted_at IS NULL LIMIT 1`;
    if (!incident) throw new Error(`Incident ${incidentCode} does not exist`);

    let upserted = 0;
    for (const supplier of CALI_SUPPLIERS) {
      const clientMutationId = deterministicUuid(supplier.externalKey);
      const location = { type: "Point", coordinates: [supplier.lng, supplier.lat] };

      const [territory] = await sql<{ id: string }[]>`
        SELECT id FROM territories
        WHERE incident_id = ${incident.id} AND territory_type = 'department'
          AND deleted_at IS NULL
          AND ST_Within(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(location)}), 4326), geometry)
        LIMIT 1
      `;
      const territoryId = territory?.id ?? null;

      const [row] = await sql<{ id: string }[]>`
        INSERT INTO material_suppliers (
          id, incident_id, territory_id, name, location, address, verification_level,
          client_mutation_id
        ) VALUES (
          ${deterministicUuid(`supplier:${supplier.externalKey}`)}, ${incident.id}, ${territoryId},
          ${supplier.name}, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(location)}), 4326),
          ${supplier.address}, ${supplier.verificationLevel}, ${clientMutationId}
        )
        ON CONFLICT (incident_id, client_mutation_id) DO UPDATE SET
          name = EXCLUDED.name,
          territory_id = EXCLUDED.territory_id,
          location = EXCLUDED.location,
          address = EXCLUDED.address,
          verification_level = EXCLUDED.verification_level,
          updated_at = now()
        RETURNING id
      `;
      if (!row) continue;
      const supplierId = row.id;

      for (const catalogItemCode of supplier.catalogItemCodes) {
        const [catalogItem] = await sql<
          { id: string; canonical_unit: string }[]
        >`SELECT id, canonical_unit FROM material_catalog_items WHERE code = ${catalogItemCode} LIMIT 1`;
        if (!catalogItem) continue;
        await sql`
          INSERT INTO supplier_catalog_offers (id, supplier_id, catalog_item_id, unit)
          VALUES (
            ${deterministicUuid(`offer:${supplier.externalKey}:${catalogItemCode}`)}, ${supplierId},
            ${catalogItem.id}, ${catalogItem.canonical_unit}
          )
          ON CONFLICT (supplier_id, catalog_item_id) DO UPDATE SET
            unit = EXCLUDED.unit,
            updated_at = now()
        `;
      }
      upserted += 1;
    }
    return { status: "seeded" as const, upserted, total: CALI_SUPPLIERS.length };
  } finally {
    await sql.end();
  }
}
