import { describe, expect, it } from "vitest";
import {
  mapRegistryPoint,
  namesAPrivateResident,
  stripDescriptionWithNames,
} from "./mapadelterremoto.js";

const base = {
  id: "6f0c1a54-8e2b-4d31-9a77-1f3b0c2d4e51",
  codigo: "P-001",
  tipo: "EDIFICACION_COLAPSADA",
  severidad: "COLAPSO",
  estado: "CONFIRMADO",
  atencion: "EN_ATENCION",
  departamento: "Valle del Cauca",
  municipio: "Cali",
  barrio: "El Limonar",
  direccion: "Conjunto Torres del Limonar Capri · Carrera 72 con Calle 10 BIS",
  lat: 3.402565,
  lon: -76.529565,
  descripcion: "Edificio residencial de al menos cuatro pisos colapsado.",
  evidencias: [{ id: "ev-001" }, { id: "ev-002" }],
  personas: {},
  prueba: false,
};

describe("mapRegistryPoint", () => {
  it("maps a collapsed building to a damage report", () => {
    const mapped = mapRegistryPoint(base);
    expect(mapped?.reportType).toBe("dano");
    expect(mapped?.damageSeverity).toBe("colapso");
    expect(mapped?.routeStatus).toBeNull();
    expect(mapped?.status).toBe("corroborated");
    expect(mapped?.externalKey).toBe("P-001");
    expect(mapped?.location.coordinates).toEqual([-76.529565, 3.402565]);
  });

  // Una vía cerrada registrada como PMU le diría a quien coordina que ahí hay mando, y un punto de
  // acopio registrado como daño lo pondría en la lista de estructuras a evaluar. El tipo se deriva
  // del vocabulario de la fuente, no se fija.
  it("derives the report type from the source vocabulary", () => {
    expect(mapRegistryPoint({ ...base, tipo: "VIA" })?.reportType).toBe("via");
    expect(mapRegistryPoint({ ...base, tipo: "DESLIZAMIENTO" })?.routeStatus).toBe("bloqueada");
    expect(mapRegistryPoint({ ...base, tipo: "PUNTO_AYUDA" })?.reportType).toBe("acopio");
    // La distinción que la fuente ya hacía y nosotros aplanábamos: dónde se recogen cosas y dónde
    // duerme alguien esta noche son dos preguntas distintas.
    expect(mapRegistryPoint({ ...base, tipo: "ALBERGUE" })?.reportType).toBe("albergue");
    expect(mapRegistryPoint({ ...base, tipo: "ALBERGUE" })?.damageSeverity).toBeNull();
  });

  // La fuente deja lat/lon en null cuando solo conoce el municipio, en vez de poner el centroide.
  // Importarlos clavados en el centro del pueblo sería inventar una ubicación, y a un equipo se le
  // manda al sitio, no al municipio.
  it("drops points the source could not locate", () => {
    expect(mapRegistryPoint({ ...base, lat: null, lon: null })).toBeUndefined();
    expect(mapRegistryPoint({ ...base, lat: -33.44, lon: -70.65 })).toBeUndefined();
  });

  // `DESCARTADO` es un juicio de la propia fuente: evaluó el punto y concluyó que no era cierto.
  it("does not import what the source itself discarded", () => {
    expect(mapRegistryPoint({ ...base, estado: "DESCARTADO" })).toBeUndefined();
    expect(mapRegistryPoint({ ...base, prueba: true })).toBeUndefined();
  });

  it("leaves news, looting and theft reports out", () => {
    for (const tipo of ["NOTICIA", "SAQUEO", "ROBO", "INCENDIO"]) {
      expect(mapRegistryPoint({ ...base, tipo })).toBeUndefined();
    }
  });

  // Las cifras de atrapados son de prensa del 10 y el 11 de agosto y en ocho de nueve casos sin
  // confirmar. Viajan como contexto; convertirlas en `rescate` las pondría por encima de un reporte
  // ciudadano de hace diez minutos, que es lo único que la cola de rescate tiene que garantizar.
  it("carries reported trapped people as context, never as a rescue", () => {
    const mapped = mapRegistryPoint({
      ...base,
      personas: { atrapados: { valor: 25, confirmado: true } },
    });
    expect(mapped?.reportType).toBe("dano");
    expect(mapped?.metadata.personsNeeded).toBe(25);
  });

  it("keeps the point but not the household when the address names a resident", () => {
    const mapped = mapRegistryPoint({
      ...base,
      tipo: "VIVIENDA",
      severidad: "COLAPSO",
      municipio: "Quimbaya",
      barrio: "Grisales",
      direccion: "Barrio Grisales · vivienda de Olmedo Zapata",
      descripcion: "«La vivienda de mi hijo y la mía se perdieron».",
    });

    expect(mapped?.title).toBe("Vivienda afectada — Quimbaya");
    expect(mapped?.metadata.address).toBeUndefined();
    expect(mapped?.metadata.neighborhood).toBeUndefined();
    expect(mapped?.description).toBe("Vivienda afectada · Colapso");
    // Lo que sirve para coordinar se conserva entero.
    expect(mapped?.location.coordinates).toEqual([-76.529565, 3.402565]);
    expect(mapped?.damageSeverity).toBe("colapso");
  });

  it("keeps the point when its prose has to be dropped", () => {
    const mapped = mapRegistryPoint({
      ...base,
      tipo: "VIVIENDA",
      severidad: "LEVE",
      descripcion: "Según el testimonio de uno de ellos, Adalberto Zuluaga, el muro cedió.",
    });
    expect(mapped).toBeDefined();
    expect(mapped?.description).toBe("Vivienda afectada · Daño leve");
  });
});

// Se descubrió tarde y en producción: el mapa llegó a publicar «Barrio Grisales · vivienda de
// Olmedo Zapata». La dirección se había dado por segura porque casi siempre son edificios e
// instituciones — pero cuando la casa que cayó es de un particular, la fuente la identifica por su
// dueño. Publicar su nombre junto a «su casa colapsó» dice dónde vive, que lo perdió todo y que hoy
// no está ahí.
describe("namesAPrivateResident", () => {
  it("flags a dwelling identified by its owner", () => {
    expect(namesAPrivateResident("Barrio Grisales · vivienda de Olmedo Zapata")).toBe(true);
    expect(namesAPrivateResident("Vivienda de Lina Quintero · barrio Tokio")).toBe(true);
    expect(namesAPrivateResident("Casa de Flor Marina González")).toBe(true);
  });

  // Un equipamiento público lleva el nombre de alguien y no identifica a nadie que viva ahí.
  it("does not flag a public building named after someone", () => {
    expect(namesAPrivateResident("Casa de la Cultura Lucelly García de Montoya")).toBe(false);
    expect(namesAPrivateResident("Hospital Universitario del Valle Evaristo García")).toBe(false);
    expect(namesAPrivateResident("Casa de la Memoria Jorge Eliécer Gaitán")).toBe(false);
  });

  it("does not flag an ordinary address", () => {
    expect(namesAPrivateResident("Carrera 72 con Calle 10 BIS")).toBe(false);
    expect(namesAPrivateResident(null)).toBe(false);
  });
});

describe("stripDescriptionWithNames", () => {
  it("drops prose that introduces someone by name", () => {
    expect(
      stripDescriptionWithNames("Según el testimonio de uno de ellos, Adalberto Zuluaga, cedió."),
    ).toBeNull();
    expect(stripDescriptionWithNames("La señora Marta Ospina relató lo ocurrido.")).toBeNull();
  });

  // Atribuir a una institución no es nombrar a nadie, y es la mitad del valor del texto.
  it("keeps prose attributed to an institution", () => {
    const official = "Cierre total, según el informe de la Dirección de Tránsito y Transporte.";
    expect(stripDescriptionWithNames(official)).toBe(official);
    const health = "La Secretaría de Salud Municipal informa que la IPS Comfandi suspendió.";
    expect(stripDescriptionWithNames(health)).toBe(health);
  });

  it("returns null for empty text", () => {
    expect(stripDescriptionWithNames("")).toBeNull();
    expect(stripDescriptionWithNames(null)).toBeNull();
  });
});
