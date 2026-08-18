import { Footer } from "./components/footer";
import { FieldEntryLink } from "./components/offline-visit-button";
import { PublicSituationReport } from "./components/public-situation-report";
import { SiteNav } from "./components/site-nav";

export default function PublicHome() {
  return (
    // La barra vive fuera de <main> a propósito: dentro quedaría limitada al ancho de la columna
    // de contenido y el desenfoque se cortaría a media pantalla en vez de recorrer todo el borde.
    <>
      <SiteNav />
      <main>
        <section className="hero publicHero">
          <div>
            <h1>Lo que ocurre, lo que falta y dónde se está ayudando.</h1>
            <p className="subtitle">
              Un informe público sobre cobertura, daños, necesidades, donaciones y equipos de
              respuesta, organizado por territorio y respaldado por evidencia verificable.
            </p>
          </div>
          <div className="actions">
            <a href="#mapa" className="button secondary">
              Explorar el mapa
            </a>
            <FieldEntryLink />
          </div>
        </section>

        <PublicSituationReport />

        <p className="demoNotice">
          Datos reales de fuentes oficiales y reportes ciudadanos · Sin información personal
        </p>
        <Footer />
      </main>
    </>
  );
}
