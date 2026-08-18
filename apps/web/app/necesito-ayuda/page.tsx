import type { Metadata } from "next";
import { Footer } from "../components/footer";
import { SiteNav } from "../components/site-nav";
import { HelpPage } from "./help-page";

export const metadata: Metadata = {
  title: "Si el sismo te afectó: cómo te censan y dónde hay ayuda",
  description:
    "El censo de familias afectadas por el sismo del 10 de agosto de 2026 es presencial: no hay inscripción por QR, teléfono ni formulario digital. Aquí está la ruta real, los albergues y puntos de acopio más cercanos, y qué hacer si buscas a alguien.",
  alternates: { canonical: "/necesito-ayuda" },
  openGraph: {
    title: "Si el sismo te afectó, esto es lo que sirve saber",
    description:
      "El censo es presencial y no se hace por internet. Aquí está la ruta real, los albergues y acopios cercanos, y la ruta oficial de búsqueda de personas.",
    url: "/necesito-ayuda",
    type: "article",
    // Sin esto el enlace sale desnudo en WhatsApp, que es exactamente por donde se va a compartir
    // esta página. Un enlace sin imagen en una cadena de mensajes se lee como sospechoso, y esta
    // página existe justamente para desmentir a los que cobran por «inscribir» a alguien.
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "PULSO" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Si el sismo te afectó, esto es lo que sirve saber",
    images: ["/og.jpg"],
  },
};

/**
 * Las preguntas van en `FAQPage` porque son literalmente las que la gente escribe en un buscador y
 * las que le pregunta a un asistente: «¿cómo me inscribo en las ayudas del terremoto?». La respuesta
 * correcta a esa búsqueda es «no se inscribe por internet», y si nosotros no la damos en un formato
 * que un buscador pueda citar, la va a dar quien esté cobrando por un registro que no existe.
 */
const faq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "¿Cómo me inscribo para recibir ayudas por el terremoto en Colombia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No hay inscripción por internet. El censo de familias afectadas lo diligencia personal autorizado casa a casa, de forma presencial. No existe censo por QR, por teléfono, por formulario digital ni por redes sociales. Para que te censen, pregunta en tu alcaldía o en la oficina de Gestión del Riesgo de tu municipio cuándo pasa la brigada por tu barrio, y está cuando pase. Si alguien te pide datos o dinero para inscribirte en las ayudas, no es el censo: el censo no cobra y no se hace en línea.",
      },
    },
    {
      "@type": "Question",
      name: "¿Qué es el Registro Único de Damnificados y quién lo hace?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Es el registro oficial de personas y familias afectadas por un desastre. Lo consolida la Unidad Nacional para la Gestión del Riesgo de Desastres (UNGRD) con la información que cargan los consejos territoriales de gestión del riesgo, que son quienes hacen el censo en terreno. En Cali el instrumento se llama Registro Único de Familias en Emergencia (RUFE) y se diligencia presencialmente.",
      },
    },
    {
      "@type": "Question",
      name: "¿Dónde hay albergues y puntos de acopio abiertos?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "En pulso.my hay puntos de acopio y albergues publicados por fuentes oficiales y ciudadanas, con su ubicación en el mapa. Los acopios abren y cierran en días, así que cada punto muestra de qué fuente viene y cuándo se vio por última vez. Un punto que su fuente deja de publicar se retira del mapa.",
      },
    },
    {
      "@type": "Question",
      name: "¿Qué hago si estoy buscando a una persona desaparecida por el terremoto?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Activa el Mecanismo de Búsqueda Urgente en la Personería, la Fiscalía, el CTI o la SIJIN. Queda registrado en el sistema nacional SIRDEC. Se puede activar de inmediato: no hay que esperar 72 horas, eso es un mito. Pulso no publica listados de personas desaparecidas y remite a esta ruta oficial.",
      },
    },
    {
      "@type": "Question",
      name: "¿Reportar en Pulso me inscribe para recibir ayuda?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Reportar en Pulso no inscribe a nadie en ninguna ayuda y no reemplaza el censo oficial. Sirve para que quien coordina la respuesta vea dónde falta qué. Pulso es una plataforma de código abierto hecha por voluntarios; no es autoridad y no decide quién recibe ayuda.",
      },
    },
  ],
};

export default function NecesitoAyudaPage() {
  return (
    <>
      <SiteNav />
      <main className="helpMain">
        <HelpPage />
        <Footer />
      </main>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD serializado por nosotros, sin entrada de terceros.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }}
      />
    </>
  );
}
