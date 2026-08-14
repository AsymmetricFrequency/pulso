import { describe, expect, it } from "vitest";
import { parseCaliOfficialPage } from "./cali-official.js";

describe("parseCaliOfficialPage", () => {
  it("extracts public metrics and service points without personal records", () => {
    const snapshot = parseCaliOfficialPage(
      `
      <section id="main-data">
        <span id="fallecidos">110</span><span id="lesionados">1.410</span>
        <span id="colapsadas">46</span><span id="desaparecidas">115</span>
        <span id="rescatadas">88</span>
        <p class="balance__updated">Última actualización: 11:30 a. m. · viernes 14</p>
        <a class="balance__download" href="https://example.test/report.pdf">Descargar</a>
      </section>
      <div class="cali-emergency__location-group">
        <h3 class="cali-emergency__location-group-title">Punto de acopio</h3>
        <li class="cali-emergency__location-item cali-emergency__location-item--closed">
          <a class="cali-emergency__location-link" href="https://maps.example/1">
            <p class="cali-emergency__location-name">Plazoleta Central</p>
            <p class="cali-emergency__location-address">Calle 1</p>
          </a>
        </li>
      </div>
    `,
      "2026-08-14T16:30:00.000Z",
    );

    expect(snapshot.metrics).toEqual([
      { key: "deaths", value: 110, label: "Personas fallecidas" },
      { key: "injured", value: 1410, label: "Personas lesionadas" },
      { key: "collapsed_buildings", value: 46, label: "Edificaciones con colapso total" },
      { key: "missing", value: 115, label: "Personas desaparecidas" },
      { key: "rescued", value: 88, label: "Personas rescatadas" },
    ]);
    expect(snapshot.servicePoints).toMatchObject([
      {
        type: "collection_center",
        name: "Plazoleta Central",
        status: "closed",
        address: "Calle 1",
      },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("phone");
  });
});
