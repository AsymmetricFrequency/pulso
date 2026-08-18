import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import type { ReactNode } from "react";
import { StructuredData } from "./components/structured-data";
import "./globals.css";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pulso.my";

/**
 * La familia Plex, en sus tres cortes.
 *
 * La identidad de Pulso sale del instrumento que está en el centro de todo esto: un sismógrafo. Lo
 * que el proyecto afirma no es un sentimiento, es una **medición** —cada cifra con su fuente, su
 * fecha y su precisión— y la tipografía tiene que decir eso antes de que se lea una palabra.
 *
 * Tres cortes de una sola superfamilia, diseñados juntos, cada uno con un trabajo:
 *
 * · **Serif** para los titulares. Da la voz editorial de un informe sin la tibieza de una Georgia,
 *   que es la que cualquiera alcanza por defecto.
 * · **Sans** para el cuerpo y la interfaz. Se aguanta a 12px en una pantalla barata al sol, que es
 *   la condición real de uso.
 * · **Mono** para los datos: coordenadas, códigos DIVIPOLA, magnitudes, conteos. Las cifras que se
 *   comparan en columna tienen que alinearse, y una monoespaciada lo hace sin pedir permiso.
 *
 * Se sirven desde nuestro propio dominio —`next/font` las descarga en el build— así que no hay
 * petición a un tercero ni salto de fuente al cargar.
 */
const plexSerif = IBM_Plex_Serif({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-display",
  fallback: ["Georgia", "serif"],
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-body",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-data",
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
});

/**
 * Lo que alguien escribe cuando busca esto.
 *
 * El título anterior era «PULSO» y la descripción «Coordinación territorial verificable para
 * emergencias». Las dos son ciertas y ninguna contiene una sola palabra que alguien vaya a teclear:
 * quien busca «acopios terremoto Colombia» o «dónde donar sangre Cali» no encontraba nada. Un mapa
 * de emergencia que no aparece cuando se le necesita es un mapa que no existe.
 */
const TITLE = "PULSO · Mapa del terremoto de Colombia 2026: acopios, daños y vías";
const DESCRIPTION =
  "Mapa público del sismo de magnitud 7,4 del 10 de agosto de 2026. Centros de acopio, albergues, " +
  "edificaciones dañadas y colapsadas, vías cerradas, dónde donar sangre y qué necesita cada " +
  "municipio — con la fuente y la fecha de cada dato.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: "%s · PULSO" },
  description: DESCRIPTION,
  applicationName: "PULSO",
  category: "news",
  alternates: { canonical: "/" },
  authors: [{ name: "ASY", url: "https://github.com/AsymmetricFrequency/pulso" }],
  publisher: "PULSO",
  keywords: [
    "terremoto Colombia 2026",
    "sismo Colombia",
    "centros de acopio",
    "albergues",
    "damnificados",
    "donar sangre",
    "vías cerradas",
    "edificaciones colapsadas",
    "ayuda humanitaria Colombia",
    "Cali",
    "Pereira",
    "Manizales",
    "Armenia",
    "Quibdó",
    "Buenaventura",
    "Chocó",
  ],
  // `max-image-preview:large` y `max-snippet:-1` importan aquí más que en un sitio normal: hacen
  // que el buscador pueda mostrar el mapa y una respuesta larga sin obligar a entrar. Alguien que
  // busca dónde donar sangre debería poder leerlo desde los resultados.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "PULSO",
    type: "website",
    url: "/",
    locale: "es_CO",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "PULSO — Mapa del terremoto de Colombia 2026",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
  other: {
    "geo.region": "CO",
    "geo.placename": "Colombia",
  },
};

export const viewport: Viewport = {
  themeColor: "#12130f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="es-CO"
      className={`${plexSerif.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <head>
        <StructuredData />
      </head>
      <body>{children}</body>
    </html>
  );
}
