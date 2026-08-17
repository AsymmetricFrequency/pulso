import { Footer } from "../components/footer";
import { ReconstructionPage } from "../components/reconstruction-page";

export const metadata = {
  title: "Reconstrucción y oficios",
  description:
    "Quién puede levantar lo que cayó: ingeniería, arquitectura y oficios de obra para la " +
    "reconstrucción tras el sismo de Colombia de 2026.",
  alternates: { canonical: "/reconstruccion" },
};

export default function ReconstruccionRoute() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/#top" aria-label="Inicio de PULSO">
          <span className="brandMark" aria-hidden="true" />
          <span>PULSO</span>
        </a>
        <nav className="publicNav" aria-label="Navegación principal">
          <a href="/#informe">Informe público</a>
          <a href="/#ayuda">Ayuda y donaciones</a>
          <a href="/reconstruccion">Reconstrucción</a>
        </nav>
        <a className="textLink" href="/operations">
          Acceso operaciones
        </a>
      </header>

      <section className="publicReport">
        <ReconstructionPage />
      </section>

      <Footer />
    </main>
  );
}
