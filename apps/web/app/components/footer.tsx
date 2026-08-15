const REPO_URL = "https://github.com/AsymmetricFrequency/pulso";

export function Footer() {
  return (
    <footer>
      <div className="footerTop">
        <a className="brand" href="/#top" aria-label="Volver al inicio de PULSO">
          <span className="brandMark" aria-hidden="true" />
          <span>PULSO</span>
        </a>
        <nav aria-label="Navegación de pie de página">
          <a href="/#informe">Informe público</a>
          <a href="/#ayuda">Ayuda y donaciones</a>
          <a href="/reconstruccion">Reconstrucción</a>
          <a href="/#metodologia">Cómo verificamos</a>
          <a href="/operations">Acceso operaciones</a>
        </nav>
      </div>
      <div className="footerBottom">
        <span>PULSO · Infraestructura abierta para emergencias</span>
        <span>
          Hecho por ASY · Open source ·{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            github.com/AsymmetricFrequency/pulso
          </a>
        </span>
      </div>
    </footer>
  );
}
