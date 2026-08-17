import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pulso.my";

/**
 * Las rutas públicas, con la frecuencia con la que de verdad cambian.
 *
 * `changeFrequency` es una pista, no una promesa, y aquí se pone la real: el informe y el mapa se
 * mueven cada vez que entra una ingesta —cada diez o veinte minutos—, la auditoría cuando el SECOP
 * publica, y la página de reconstrucción casi nunca. Declarar «hourly» en todo para parecer activo
 * es la clase de exageración que los buscadores aprenden a ignorar.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/auditoria`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/reconstruccion`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];
}
