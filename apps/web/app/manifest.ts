import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "https://pulso.my/",
    name: "PULSO · Mapa del terremoto de Colombia 2026",
    short_name: "PULSO",
    description:
      "Acopios, albergues, daños, vías cerradas y necesidades del sismo del 10 de agosto de 2026, " +
      "con la fuente de cada dato.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f2e9",
    theme_color: "#006a4e",
    lang: "es-CO",
    categories: ["utilities", "productivity", "navigation"],
  };
}
