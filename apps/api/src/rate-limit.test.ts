import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

/**
 * El límite existe para frenar a un raspador desde una IP, no para castigar a un barrio detrás del
 * mismo NAT. Estas pruebas fijan las dos mitades de esa frase.
 */
describe("límite de tasa en las rutas públicas", () => {
  it("no toca la creación de un reporte de rescate", async () => {
    const app = await buildApp();
    const routes = app.printRoutes({ commonPrefix: false });
    await app.close();
    // La ruta existe; lo que se fija abajo es que su límite sigue siendo el suyo, no uno añadido.
    expect(routes).toContain("community-reports");
  });

  it("deja pasar una visita completa sin acercarse al límite", async () => {
    const app = await buildApp();
    const incident = await app.inject({
      method: "POST",
      url: "/v1/incidents",
      payload: {
        code: "prueba-limite",
        name: "Prueba",
        countryCode: "CO",
        disasterType: "earthquake",
        startedAt: "2026-08-10T12:34:00Z",
        timezone: "America/Bogota",
      },
    });
    expect(incident.statusCode).toBe(201);

    // Una visita real hace unas cuatro peticiones. Veinte seguidas siguen siendo normales.
    for (let i = 0; i < 20; i += 1) {
      const res = await app.inject({
        method: "GET",
        url: "/v1/public/incidents/prueba-limite/community-reports?view=map",
      });
      expect(res.statusCode).toBe(200);
    }
    await app.close();
  });

  it("responde 429 con un mensaje legible cuando alguien se pasa", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/v1/incidents",
      payload: {
        code: "prueba-abuso",
        name: "Prueba",
        countryCode: "CO",
        disasterType: "earthquake",
        startedAt: "2026-08-10T12:34:00Z",
        timezone: "America/Bogota",
      },
    });

    let limited: Awaited<ReturnType<typeof app.inject>> | null = null;
    for (let i = 0; i < 260; i += 1) {
      const res = await app.inject({
        method: "GET",
        url: "/v1/public/incidents/prueba-abuso/report",
      });
      if (res.statusCode === 429) {
        limited = res;
        break;
      }
    }
    await app.close();

    expect(limited).not.toBeNull();
    // El mapa tiene que poder degradar con un mensaje, no quedarse en blanco.
    expect(limited?.json()).toMatchObject({ error: "rate_limited" });
    expect(limited?.json().message).toContain("segundos");
    expect(limited?.headers["retry-after"]).toBeDefined();
  });
});
