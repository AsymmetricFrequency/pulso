import { expect, type Page, type Route, test } from "@playwright/test";
import { createCommunityReportSchema } from "@pulso/schemas";

/**
 * El camino que recorre alguien que reporta: abrir el mapa, activar el modo, tocar un punto,
 * llenar y enviar.
 *
 * **Qué se sustituye y qué no.** La API no corre aquí: se interceptan sus llamadas. Lo que sí es
 * real es todo lo demás —el mapa, la proyección, el formulario, el estado de React y la petición
 * HTTP que sale del navegador—, que es justo la parte que ninguna prueba cubría.
 *
 * **El cuerpo del POST se valida contra `createCommunityReportSchema`**, el mismo esquema con el que
 * el servidor lo recibe. Sin eso, una prueba con la API simulada solo demuestra que el navegador
 * manda *algo*; con eso demuestra que manda algo que el servidor real aceptaría. Es lo que evita
 * que el formulario y el contrato se separen sin que nadie se entere.
 */

/**
 * **El orden importa y no es evidente.** Playwright da precedencia a la ruta registrada **última**,
 * así que el comodín va primero y las reglas específicas después. Al revés —que es como se escribe
 * por instinto— el comodín se traga el POST y la prueba falla diciendo que el navegador no envió
 * nada, cuando sí lo envió.
 */
async function stubApi(page: Page, onPost: (body: unknown) => void) {
  // Comodín: la prueba no depende de que haya un servidor detrás.
  await page.route("**/v1/public/**", (route: Route) => route.fulfill({ status: 503, body: "{}" }));
  // Territorios: 503 a propósito, para que entre el GeoJSON local de `public/data`.
  await page.route("**/v1/public/incidents/*/territories*", (route: Route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.route("**/v1/public/incidents/*/community-reports*", async (route: Route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      onPost(body);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "01a01094-fa7c-756a-a7d4-e7f1cd00dab2",
          reportType: body.reportType,
          category: body.category ?? null,
          title: body.title,
          description: body.description ?? null,
          location: body.location,
          status: "reported",
          externalSourceId: null,
          metadata: null,
          peopleReported: body.peopleReported ?? null,
          signsOfLife: body.signsOfLife ?? null,
          respondersOnSite: body.respondersOnSite ?? null,
          routeStatus: null,
          damageSeverity: null,
          locationPrecision: "approximate",
          createdAt: new Date().toISOString(),
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reports: [], total: 0 }),
    });
  });
}

/** Activa el modo reporte y toca el mapa, que es como se abre el formulario de verdad. */
async function abrirFormularioEnElMapa(page: Page) {
  await page.getByRole("button", { name: /Reportar personas atrapadas/i }).click();
  const mapa = page.locator("svg.countryMap");
  await expect(mapa).toBeVisible();
  const caja = await mapa.boundingBox();
  if (!caja) throw new Error("el mapa no tiene caja: no se pudo tocar un punto");
  await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await expect(page.getByRole("dialog", { name: /Reportar en este punto/i })).toBeVisible();
}

test.describe("reportar desde el mapa", () => {
  test("un rescate sale con lo que un equipo necesita para priorizar", async ({ page }) => {
    let enviado: unknown = null;
    await stubApi(page, (body) => {
      enviado = body;
    });

    await page.goto("/");
    await abrirFormularioEnElMapa(page);

    // El rescate es el tipo por defecto: quien lo envía suele estar en el sitio, con una mano.
    const dialogo = page.getByRole("dialog", { name: /Reportar en este punto/i });
    await expect(dialogo.getByRole("button", { name: /Enviar ahora/i })).toBeVisible();
    await dialogo.getByRole("button", { name: /Enviar ahora/i }).click();

    await expect
      .poll(() => enviado, { message: "el navegador no envió el reporte" })
      .not.toBeNull();

    // La prueba de fondo: lo que salió del navegador lo acepta el contrato del servidor.
    const parsed = createCommunityReportSchema.safeParse(enviado);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.reportType).toBe("rescate");
    // Sin título escrito: se deduce de los botones para que nadie tenga que redactar un titular de
    // pie al lado de un derrumbe.
    expect(parsed.data.title.length).toBeGreaterThanOrEqual(3);
    expect(parsed.data.location.coordinates).toHaveLength(2);
  });

  test("una necesidad exige categoría, y el mapa la pide antes de dejar enviar", async ({
    page,
  }) => {
    let enviado: unknown = null;
    await stubApi(page, (body) => {
      enviado = body;
    });

    await page.goto("/");
    await abrirFormularioEnElMapa(page);

    const dialogo = page.getByRole("dialog", { name: /Reportar en este punto/i });
    await dialogo.getByRole("button", { name: /^Necesidad$/i }).click();
    await dialogo.getByRole("textbox").first().fill("Falta agua potable en la comuna 18");
    await dialogo.getByRole("button", { name: /Publicar reporte/i }).click();

    await expect
      .poll(() => enviado, { message: "el navegador no envió la necesidad" })
      .not.toBeNull();

    const parsed = createCommunityReportSchema.safeParse(enviado);
    expect(parsed.error?.issues ?? []).toEqual([]);
    if (!parsed.success) return;

    expect(parsed.data.reportType).toBe("necesidad");
    // El esquema del servidor rechaza una necesidad sin categoría. Si el formulario dejara enviarla
    // sin elegir una, esta prueba falla aquí y no en producción.
    expect(parsed.data.category).not.toBeNull();
    expect(parsed.data.title).toContain("agua");
  });
});
