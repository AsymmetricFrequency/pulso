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
    /* Prioridad 1 igual que la portada, y no es un error: es la página que responde la búsqueda que
       hace alguien que acaba de perder la casa —«cómo me inscribo en las ayudas del terremoto»— y la
       respuesta correcta a esa búsqueda es que no hay inscripción por internet. Si no la damos
       nosotros la va a dar quien esté cobrando por un registro que no existe. */
    { url: `${SITE}/necesito-ayuda`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/auditoria`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/reconstruccion`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/mi-registro`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/privacidad`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
