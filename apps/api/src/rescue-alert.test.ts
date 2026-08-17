import { describe, expect, it } from "vitest";
import { rescueAlertMessage } from "./rescue-alert.js";

const base = {
  id: "6f0c1a54-8e2b-4d31-9a77-1f3b0c2d4e51",
  reportType: "rescate" as const,
  category: null,
  title: "3 personas bajo escombros — se oyen señales de vida",
  description: null,
  location: { type: "Point" as const, coordinates: [-76.5296, 3.4026] as [number, number] },
  status: "reported" as const,
  externalSourceId: null,
  metadata: null,
  peopleReported: 3,
  signsOfLife: "yes" as const,
  respondersOnSite: null,
  routeStatus: null,
  damageSeverity: null,
  locationPrecision: "approximate" as const,
  createdAt: "2026-08-17T12:00:00Z",
};

describe("rescueAlertMessage", () => {
  it("leads with the two facts that decide where the team goes", () => {
    const message = rescueAlertMessage(base, "https://pulso.my");
    expect(message).toContain("**3 personas** reportadas");
    expect(message).toContain("SE OYEN SEÑALES DE VIDA");
  });

  // A quien conduce le sirve la ruta, no nuestra ficha. Las coordenadas van tal cual para que el
  // enlace abra la navegación directamente.
  it("carries a link you can drive with", () => {
    const message = rescueAlertMessage(base, "https://pulso.my");
    expect(message).toContain("query=3.4026,-76.5296");
    expect(message).toContain("https://pulso.my/#mapa");
  });

  // Un canal que suena por todo es un canal que la gente silencia, y entonces el aviso que importa
  // tampoco llega.
  it("stays quiet for everything that is not a rescue", () => {
    for (const reportType of ["pmu", "necesidad", "via", "dano"] as const) {
      expect(rescueAlertMessage({ ...base, reportType }, "https://pulso.my")).toBeNull();
    }
  });

  // Un reporte incompleto llega igual y sirve: la ubicación ya es la mitad del valor. El aviso no
  // puede quedarse mudo por no saber cuánta gente hay.
  it("still says something useful when the report is incomplete", () => {
    const message = rescueAlertMessage(
      { ...base, peopleReported: null, signsOfLife: null },
      "https://pulso.my",
    );
    expect(message).toContain("sin especificar");
    expect(message).toContain("señales sin confirmar");
  });

  // Es el dato que evita el peor desperdicio de esta fase: dos equipos al mismo sitio y ninguno al
  // otro. Por eso se dice en los dos sentidos, no solo cuando hay equipo.
  it("says whether anyone is already there, either way", () => {
    expect(rescueAlertMessage({ ...base, respondersOnSite: true }, "x")).toContain(
      "Ya hay un equipo en el sitio",
    );
    expect(rescueAlertMessage({ ...base, respondersOnSite: false }, "x")).toContain(
      "**Sin equipo en el sitio**",
    );
  });

  it("warns that nobody has verified this", () => {
    expect(rescueAlertMessage(base, "x")).toContain("sin verificar");
  });
});
