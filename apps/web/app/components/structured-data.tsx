const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pulso.my";

/**
 * Datos estructurados del sitio (JSON-LD).
 *
 * Sirven a dos cosas distintas que conviene no confundir:
 *
 * 1. **Buscadores.** `SpecialAnnouncement` es el tipo que schema.org creó para avisos de
 *    emergencia, y es el que hace que un buscador entienda que esto no es una página corporativa
 *    sino información de una crisis en curso, con fecha de corte y vigencia.
 * 2. **Asistentes que citan fuentes.** `Dataset` describe la API pública: qué hay, bajo qué
 *    condiciones y dónde. Es lo que permite que alguien —persona o máquina— use nuestros datos sin
 *    tener que raspar la web, que es exactamente lo que nosotros pedimos a las demás plataformas.
 *
 * Todos los hechos de aquí salen de nuestra propia base (`incidents`) y de nuestras ingestas. No se
 * copian cifras de otros sitios: si mañana cambian, la nuestra sería una afirmación sin respaldo.
 */

const EVENT_ID = `${SITE}/#sismo`;
const ORG_ID = `${SITE}/#organizacion`;

// De `incidents`: started_at 2026-08-10 12:34 UTC, timezone America/Bogota → 07:34 local.
const EVENT_START = "2026-08-10T07:34:00-05:00";

const graph = [
  {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "PULSO",
    url: SITE,
    description:
      "Infraestructura abierta para coordinar emergencias: convierte señales dispersas del territorio en información con procedencia.",
    sameAs: ["https://github.com/AsymmetricFrequency/pulso"],
  },
  {
    "@type": "WebSite",
    "@id": `${SITE}/#sitio`,
    url: SITE,
    name: "PULSO",
    inLanguage: "es-CO",
    publisher: { "@id": ORG_ID },
  },
  {
    "@type": "Event",
    "@id": EVENT_ID,
    name: "Sismo de Colombia del 10 de agosto de 2026",
    description:
      "Sismo de magnitud 7,4 con epicentro cerca de San José del Palmar, Chocó, el 10 de agosto de 2026 a las 07:34 hora de Colombia.",
    startDate: EVENT_START,
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: "San José del Palmar, Chocó, Colombia",
      address: {
        "@type": "PostalAddress",
        addressRegion: "Chocó",
        addressCountry: "CO",
      },
    },
  },
  {
    // El tipo que schema.org creó para avisos de crisis. `expires` no es decorativo: dice hasta
    // cuándo esta información merece mostrarse como vigente, y en una emergencia eso importa más
    // que en cualquier otro sitio.
    "@type": "SpecialAnnouncement",
    "@id": `${SITE}/#aviso`,
    name: "Mapa público del terremoto de Colombia 2026",
    text: "Centros de acopio, albergues, edificaciones dañadas y colapsadas, vías cerradas y necesidades reportadas, por municipio y con la fuente de cada dato.",
    datePosted: EVENT_START,
    expires: "2026-11-30T23:59:59-05:00",
    category: "https://www.wikidata.org/wiki/Q7944",
    about: { "@id": EVENT_ID },
    url: SITE,
    spatialCoverage: {
      "@type": "Country",
      name: "Colombia",
      identifier: "CO",
    },
    publisher: { "@id": ORG_ID },
  },
  {
    // La API pública, descrita para que se pueda usar sin raspar el sitio. Es lo mismo que le
    // pedimos a las plataformas de las que ingerimos, así que lo hacemos primero nosotros.
    "@type": "Dataset",
    "@id": `${SITE}/#datos`,
    name: "Reportes territoriales del sismo de Colombia 2026",
    description:
      "Reportes ciudadanos y de fuentes públicas georreferenciados: rescates, daños estructurales, centros de acopio, estado de vías y necesidades. Cada punto conserva de qué fuente vino y con qué precisión se ubicó.",
    url: `${SITE}/#mapa`,
    inLanguage: "es-CO",
    isAccessibleForFree: true,
    creator: { "@id": ORG_ID },
    about: { "@id": EVENT_ID },
    spatialCoverage: { "@type": "Country", name: "Colombia", identifier: "CO" },
    temporalCoverage: "2026-08-10/..",
    keywords: [
      "terremoto",
      "sismo",
      "Colombia",
      "centros de acopio",
      "albergues",
      "daño estructural",
      "vías cerradas",
      "ayuda humanitaria",
    ],
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${SITE}/v1/public/incidents/colombia-2026/community-reports`,
        name: "Reportes territoriales (JSON)",
      },
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${SITE}/v1/public/incidents/colombia-2026/report`,
        name: "Informe público de situación (JSON)",
      },
    ],
  },
];

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      // El JSON-LD es un dato nuestro, no entrada de usuario: se serializa aquí y no viaja por
      // ningún camino donde alguien pueda inyectar nada.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requiere un <script> literal.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
      }}
    />
  );
}
