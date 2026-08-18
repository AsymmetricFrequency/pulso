import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de navegador del flujo de reporte. Cierra `PL-11`.
 *
 * **Por qué existe.** Lo más usado del sitio era lo menos probado: abrir el mapa, tocar un punto,
 * reportar y ver el marcador no lo cubría ninguna prueba. Y desde que un rescate dispara el aviso a
 * `#alertas`, ese mismo camino es también el que despierta a la gente — romperlo en silencio sería
 * caro de una forma que no se mide en errores de compilación.
 *
 * **`.e2e.ts` y no `.spec.ts` a propósito.** Vitest incluye `*.spec.ts` por defecto y estas pruebas
 * necesitan un navegador: con el nombre de siempre, `pnpm test` intentaría correrlas y fallaría por
 * una razón que no tiene nada que ver con el código.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  // En CI un reintento distingue una prueba de verdad rota de un parpadeo del navegador; en local
  // no, porque ahí el parpadeo es información que conviene ver.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `build` + `start` y no `dev`: se prueba lo que se despliega, no lo que se edita.
    command: "pnpm build && pnpm start --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
