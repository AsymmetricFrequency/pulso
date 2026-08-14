import { FieldEntryLink } from "./components/offline-visit-button";
import { PublicSituationReport } from "./components/public-situation-report";

export default function PublicHome() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Inicio de PULSO">
          <span className="brandMark" aria-hidden="true" />
          <span>PULSO</span>
        </a>
        <nav className="publicNav" aria-label="Navegación principal">
          <a href="#informe">Informe público</a>
          <a href="#ayuda">Ayuda y donaciones</a>
          <a href="#metodologia">Cómo verificamos</a>
        </nav>
        <a className="textLink" href="/operations">
          Acceso operaciones
        </a>
      </header>

      <section className="hero publicHero" id="top">
        <div>
          <p className="eyebrow">Información territorial para actuar</p>
          <h1>Lo que ocurre, lo que falta y dónde se está ayudando.</h1>
          <p className="subtitle">
            Un informe público sobre cobertura, daños, necesidades, donaciones y equipos de
            respuesta, organizado por territorio y respaldado por evidencia verificable.
          </p>
        </div>
        <div className="actions">
          <a href="#informe" className="button secondary">
            Explorar el mapa
          </a>
          <FieldEntryLink />
        </div>
      </section>

      <PublicSituationReport />

      <footer>
        <span>PULSO · Infraestructura abierta para emergencias</span>
        <span>Demostración con datos sintéticos · Sin información personal</span>
      </footer>
    </main>
  );
}
