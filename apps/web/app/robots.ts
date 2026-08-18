import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pulso.my";

/**
 * Qué se puede rastrear y qué no.
 *
 * El informe público, el mapa, la auditoría y la reconstrucción **sí**: son la razón de existir del
 * sitio y cuanta más gente los encuentre, mejor. Nadie que busque «acopios terremoto Colombia» debe
 * quedarse sin saber que esto existe.
 *
 * `/operations`, `/field` y `/admin` **no**. Son herramientas internas detrás de sesión; indexarlas
 * no ayuda a nadie y llena los buscadores de pantallas de acceso. No es una medida de seguridad
 * —eso lo hace la sesión— es higiene.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/operations", "/field", "/admin"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
