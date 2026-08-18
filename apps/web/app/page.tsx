import { Footer } from "./components/footer";
import { HomeHero } from "./components/home-hero";
import { PublicSituationReport } from "./components/public-situation-report";
import { SiteNav } from "./components/site-nav";

export default function PublicHome() {
  return (
    // La barra vive fuera de <main> a propósito: dentro quedaría limitada al ancho de la columna
    // de contenido y el desenfoque se cortaría a media pantalla en vez de recorrer todo el borde.
    <>
      <SiteNav />
      <main>
        <HomeHero />

        <PublicSituationReport />

        <p className="demoNotice">
          Datos reales de fuentes oficiales y reportes ciudadanos · Sin información personal
        </p>
        <Footer />
      </main>
    </>
  );
}
