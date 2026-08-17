import type { Metadata } from "next";
import { Footer } from "../components/footer";
import { SiteNav } from "../components/site-nav";
import { PublicFundsPage } from "./funds-page";

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
        <PublicFundsPage />
        <Footer />
      </main>
    </>
  );
}
