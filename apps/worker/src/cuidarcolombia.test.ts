import { describe, expect, it } from "vitest";
import {
  buildAcopio,
  buildBloodPoint,
  extractAcopioPoints,
  extractBloodPoints,
} from "./cuidarcolombia.js";

const located = { latitude: 4.702, longitude: -74.0899, precision: "calle" as const };

/** La primera fila del payload de prueba. Falla ruidosamente si el extractor deja de devolverla,
 *  que es más útil que un `!` silenciando al comprobador de tipos. */
const primerAcopio = () => {
  const [row] = extractAcopioPoints(payload);
  if (!row) throw new Error("el payload de prueba debe traer al menos un acopio");
  return row;
};

const primerBanco = () => {
  const [row] = extractBloodPoints(payload);
  if (!row) throw new Error("el payload de prueba debe traer al menos un banco de sangre");
  return row;
};

const payload = {
  ayuda: {
    acopios: [
      {
        ciudad: "Bogotá",
        entidad: "Corporación El Minuto de Dios",
        nivel_fuente: "fuente_oficial",
        que_donar: ["alimentos no perecederos", "kits de aseo"],
        que_no_donar: ["ropa usada"],
        fecha: "10 ago 2026",
        puntos: [
          {
            nombre: "Minuto de Dios — Banco de Ropas",
            direccion: "Transversal 73A #82-61",
            horario: "lunes a viernes, 8:00 a. m.–4:00 p. m.",
          },
        ],
      },
    ],
    sangre: [
      {
        ciudad: "Bogotá",
        entidad: "IDCBIS",
        donde: "Carrera 32 #12-81",
        estado_operacion: "recibiendo",
      },
      {
        ciudad: "Cali",
        entidad: "Jornada del parque",
        donde: "Calle 5",
        estado_operacion: "finalizado",
      },
      {
        ciudad: "Armenia",
        entidad: "Cruz Roja",
        donde: "Avenida Bolívar #23",
        estado_operacion: null,
      },
    ],
  },
};

describe("extractAcopioPoints", () => {
  it("flattens every point of every collection centre", () => {
    const rows = extractAcopioPoints(payload);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.city).toBe("Bogotá");
    expect(rows[0]?.entity).toBe("Corporación El Minuto de Dios");
  });

  it("survives a payload that is not what we expect", () => {
    expect(extractAcopioPoints(null)).toEqual([]);
    expect(extractAcopioPoints({ ayuda: {} })).toEqual([]);
  });
});

// Un banco cerrado no es un sitio a donde mandar a alguien que quiere donar: publicarlo con el
// mismo marcador que uno abierto le cuesta a esa persona el viaje.
describe("extractBloodPoints", () => {
  it("leaves out the drives that already finished", () => {
    const rows = extractBloodPoints(payload);
    expect(rows.map((r) => r.city)).toEqual(["Bogotá", "Armenia"]);
  });
});

describe("buildAcopio", () => {
  it("carries what someone needs in order to go", () => {
    const point = buildAcopio(primerAcopio(), located);
    expect(point?.title).toBe("Minuto de Dios — Banco de Ropas");
    expect(point?.metadata.address).toBe("Transversal 73A #82-61");
    expect(point?.metadata.needs).toEqual(["alimentos no perecederos", "kits de aseo"]);
    expect(point?.status).toBe("corroborated");
  });

  // El marcador está donde el geocodificador puso la calle, que puede ser cuadras antes del portal.
  // Quien va a desplazarse tiene que leerlo, así que va en el texto y no solo en un icono.
  it("says out loud that the pin is approximate", () => {
    const point = buildAcopio(primerAcopio(), located);
    expect(point?.description).toContain("Ubicación aproximada");
    expect(point?.precision).toBe("calle");
  });

  it("refuses a point that landed outside Colombia", () => {
    const outside = { latitude: -33.44, longitude: -70.65, precision: "calle" as const };
    expect(buildAcopio(primerAcopio(), outside)).toBeUndefined();
  });
});

describe("buildBloodPoint", () => {
  // Tres bancos se llamaban igual en tres ciudades distintas: «Cruz Roja — Banco Regional
  // permanente». En una lista eran el mismo punto repetido.
  it("titles the point by what it is, who runs it and where", () => {
    const point = buildBloodPoint(primerBanco(), located);
    expect(point?.title).toBe("Donación de sangre — IDCBIS · Bogotá");
    expect(point?.metadata.sourceStatus).toBe("recibiendo");
    expect(point?.description).toContain("Ubicación aproximada");
  });
});
