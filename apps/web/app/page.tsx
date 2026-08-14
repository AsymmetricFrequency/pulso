const coverage = [
  { label: "Sin verificar", value: 18, className: "unknown" },
  { label: "Asignadas", value: 7, className: "assigned" },
  { label: "Visita parcial", value: 4, className: "partial" },
  { label: "Visitadas", value: 11, className: "visited" },
];

const priorities = [
  {
    place: "Zona SJDP-01",
    reason: "Acceso y comunicaciones por verificar",
    state: "Sin contacto",
  },
  {
    place: "Zona ELC-02",
    reason: "Evaluación rápida de habitabilidad",
    state: "Brigada asignada",
  },
  {
    place: "Zona QUI-04",
    reason: "Cobertura territorial incompleta",
    state: "Visita parcial",
  },
];

export default function OperationsHome() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Inicio de PULSO ATLAS">
          <span className="brandMark" aria-hidden="true" />
          <span>PULSO ATLAS</span>
        </a>
        <span className="mode">Entorno de demostración</span>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">Centro operacional</p>
          <h1>Respuesta Colombia 2026</h1>
          <p className="subtitle">
            Cobertura territorial, evidencia y necesidades en una sola vista verificable.
          </p>
        </div>
        <div className="actions">
          <button type="button" className="button secondary">
            Crear zona
          </button>
          <button type="button" className="button primary">
            Registrar visita
          </button>
        </div>
      </section>

      <section aria-labelledby="coverage-title">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow">Cobertura de demostración</p>
            <h2 id="coverage-title">Estado del territorio</h2>
          </div>
          <p className="sectionNote">40 zonas operativas · cifras sintéticas</p>
        </div>

        <div className="coverageGrid">
          {coverage.map((item) => (
            <article className="metric" key={item.label}>
              <span className={`statusDot ${item.className}`} aria-hidden="true" />
              <span className="metricLabel">{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="workspace" aria-label="Vista territorial y prioridades">
        <div className="mapPanel">
          <div
            className="mapPlaceholder"
            role="img"
            aria-label="Vista previa del futuro mapa operacional"
          >
            <span className="mapPulse one" />
            <span className="mapPulse two" />
            <span className="mapPulse three" />
            <div className="mapMessage">
              <strong>Atlas Map</strong>
              <span>La capa PostGIS se conectará en el siguiente vertical.</span>
            </div>
          </div>
          <ul className="mapLegend" aria-label="Leyenda de cobertura">
            <li>
              <i className="statusDot unknown" /> Sin verificar
            </li>
            <li>
              <i className="statusDot assigned" /> Asignada
            </li>
            <li>
              <i className="statusDot partial" /> Parcial
            </li>
            <li>
              <i className="statusDot visited" /> Visitada
            </li>
          </ul>
        </div>

        <aside className="priorityPanel" aria-labelledby="priority-title">
          <div className="sectionHeading compact">
            <div>
              <p className="eyebrow">Requieren acción</p>
              <h2 id="priority-title">Prioridades</h2>
            </div>
          </div>
          <ol className="priorityList">
            {priorities.map((item, index) => (
              <li key={item.place}>
                <span className="priorityNumber">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{item.place}</strong>
                  <p>{item.reason}</p>
                  <span className="priorityState">{item.state}</span>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <footer>
        <span>PULSO ATLAS P0</span>
        <span>Los datos mostrados en esta pantalla son sintéticos.</span>
      </footer>
    </main>
  );
}
