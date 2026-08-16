import type { StyleSpecification } from "maplibre-gl";

/**
 * Mapa base propio, no el de un proveedor.
 *
 * Se escribe a mano en vez de cargar un estilo terminado por dos razones. La primera es que un
 * estilo de propósito general dibuja cincuenta y cinco capas —edificios, aeropuertos, senderos—
 * que aquí solo compiten por atención con el dato, que es lo único que importa en este mapa. La
 * segunda es el color: sobre un estilo ajeno habría que sobrescribir decenas de propiedades en
 * caliente para que no choque con el crema y el verde del proyecto, y bastaría un cambio del
 * proveedor para romperlo.
 *
 * El mapa base tiene que **retroceder**: es contexto para ubicarse, no la información. Por eso los
 * tonos son apagados y la tipografía es discreta.
 *
 * Las teselas son de OpenFreeMap (esquema OpenMapTiles, sin llave de API). Auto-hospedarlas más
 * adelante con un archivo `.pmtiles` es cambiar `TILE_SOURCE_URL` y nada más: el esquema de capas
 * es el mismo.
 */
export const TILE_SOURCE_URL = "https://tiles.openfreemap.org/planet";

export const MAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

/** Paleta del mapa base, derivada de los tokens del sistema de diseño. */
const PALETTE = {
  paper: "#f3efe2",
  land: "#ece7d9",
  green: "#e2e8dc",
  water: "#cfdde2",
  waterLine: "#b9ccd4",
  road: "#e0d9c8",
  roadMajor: "#d8cfb9",
  boundary: "#b9b09a",
  boundaryCountry: "#9aa39d",
  label: "#6b7a72",
  labelHalo: "#fffdf6",
};

export function buildPulsoMapStyle(): StyleSpecification {
  return {
    version: 8,
    // La pila del sistema no existe en el servidor de glifos, así que se usa la familia
    // que OpenMapTiles sí publica. Es la única concesión tipográfica del mapa.
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      openmaptiles: { type: "vector", url: TILE_SOURCE_URL },
    },
    layers: [
      { id: "fondo", type: "background", paint: { "background-color": PALETTE.paper } },
      {
        id: "tierra",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        paint: { "fill-color": PALETTE.land, "fill-opacity": 0.55 },
      },
      {
        id: "vegetacion",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "park",
        paint: { "fill-color": PALETTE.green, "fill-opacity": 0.6 },
      },
      {
        id: "agua",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        paint: { "fill-color": PALETTE.water },
      },
      {
        id: "rios",
        type: "line",
        source: "openmaptiles",
        "source-layer": "waterway",
        minzoom: 6,
        paint: {
          "line-color": PALETTE.waterLine,
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 14, 1.6],
        },
      },
      {
        // Solo la red principal. Una ciudad con todas sus calles a este nivel de detalle
        // convierte el mapa en ruido gris justo donde hay más reportes que leer.
        id: "vias",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        minzoom: 8,
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
        paint: {
          "line-color": PALETTE.roadMajor,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 16, 3],
        },
      },
      {
        id: "vias-secundarias",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        minzoom: 12,
        filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary", "minor"]]],
        paint: {
          "line-color": PALETTE.road,
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 17, 2],
        },
      },
      {
        id: "limites-municipio",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary",
        filter: ["==", ["get", "admin_level"], 6],
        minzoom: 7,
        paint: { "line-color": PALETTE.boundary, "line-width": 0.6, "line-opacity": 0.6 },
      },
      {
        id: "limites-departamento",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary",
        filter: ["==", ["get", "admin_level"], 4],
        paint: {
          "line-color": PALETTE.boundary,
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 10, 1.4],
          "line-dasharray": [3, 2],
        },
      },
      {
        id: "limites-pais",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary",
        filter: ["<=", ["get", "admin_level"], 2],
        paint: {
          "line-color": PALETTE.boundaryCountry,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 10, 2],
        },
      },
      {
        id: "etiquetas-lugar",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 12, 14],
          "text-max-width": 8,
          "text-padding": 6,
        },
        paint: {
          "text-color": PALETTE.label,
          "text-halo-color": PALETTE.labelHalo,
          "text-halo-width": 1.4,
        },
      },
    ],
  };
}
