import type { Metadata } from "next";
import { Footer } from "../components/footer";
import { ReconstructionPage } from "../components/reconstruction-page";
import { SiteNav } from "../components/site-nav";

export const metadata: Metadata = {
  title: "Reconstrucción: quién levanta lo que cayó",
  description:
    "13.077 viviendas destruidas y 79.108 averiadas tras el sismo del 10 de agosto de 2026. " +
    "Ingeniería, arquitectura, maestros de obra y proveedores de material para la reconstrucción, " +
    "con la trazabilidad de cada contrato público.",
  alternates: { canonical: "/reconstruccion" },
  openGraph: {
    title: "Reconstrucción: quién levanta lo que cayó",
    description:
      "Ingeniería, arquitectura, oficios de obra y proveedores de material para reconstruir " +
      "después del sismo de Colombia de 2026.",
    url: "/reconstruccion",
    type: "article",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "PULSO" }],
  },
};

export default function ReconstruccionRoute() {
  return (
    <>
      {/* Traía su propia barra con tres enlaces distintos a los del resto del sitio. Justo esta
          página —la de la fase en la que estamos ahora— era la que se sentía de otro sitio. */}
      <SiteNav />
      <main>
        <section className="publicReport">
          <ReconstructionPage />
        </section>

        <Footer />
      </main>
    </>
  );
}
