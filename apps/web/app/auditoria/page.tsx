import type { Metadata } from "next";
import { Footer } from "../components/footer";
import { SiteNav } from "../components/site-nav";
import { PublicFundsPage } from "./funds-page";
import { TraceabilitySection } from "./traceability-section";

export const metadata: Metadata = {
  title: "Auditoría de recursos públicos",
  description:
    "Contratación pública de la emergencia con su fuente, su referencia original y la fecha de captura. Solo se suma lo que una persona confirmó como parte de la emergencia.",
  alternates: { canonical: "/auditoria" },
};

export default function AuditoriaPage() {
  return (
    <>
      <SiteNav />
      <main>
        {/* La trazabilidad va primero y la plata después. El orden no es estético: lo que un ente
            de control viene a preguntar es si la ayuda llegó, y el contrato es el medio, no el fin. */}
        <TraceabilitySection />
        <PublicFundsPage />
        <Footer />
      </main>
    </>
  );
}
