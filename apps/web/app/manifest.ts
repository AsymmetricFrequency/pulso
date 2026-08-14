import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "https://pulso.my/",
    name: "PULSO VIDA",
    short_name: "PULSO VIDA",
    description: "Coordinación territorial verificable para emergencias y recuperación.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f2e9",
    theme_color: "#006a4e",
    lang: "es",
    categories: ["utilities", "productivity", "navigation"],
  };
}
