import type { Metadata } from "next";
import { Footer } from "../components/footer";
import { SiteNav } from "../components/site-nav";
import { MyRegistry } from "./my-registry";

export const metadata: Metadata = {
  title: "Mi registro: qué me han entregado",
  description:
    "Consulta con tu código qué ayuda registraron a tu nombre, confirma lo que recibiste y di si algo no te llegó. Sin cuenta y sin contraseña.",
  alternates: { canonical: "/mi-registro" },
};

export default function MiRegistroPage() {
  return (
    <>
      <SiteNav />
      <main className="helpMain">
        <MyRegistry />
        <Footer />
      </main>
    </>
  );
}
