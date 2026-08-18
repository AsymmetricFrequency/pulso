"use client";

import { useEffect, useMemo, useState } from "react";
import { WhereAreYou } from "./where-are-you";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INCIDENT = "colombia-2026";

type MapReport = {
  id: string;
  reportType: string;
  title: string;
  location: { type: "Point"; coordinates: [number, number] };
  status: string;
  shelterCapacity: number | null;
  shelterOccupancy: number | null;
};

type NearbyPoint = MapReport & { distanceKm: number };

/** Distancia en línea recta, en kilómetros. Aproximada y suficiente: sirve para ordenar, no para
 *  navegar. Quien tenga que llegar usa el enlace a Google Maps, que sí conoce las vías. */
function distanceKm(from: [number, number], to: [number, number]): number {
  const [lon1, lat1] = from;
  const [lon2, lat2] = to;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TYPE_LABEL: Record<string, string> = {
  acopio: "Punto de acopio",
  albergue: "Albergue",
};

export function HelpPage() {
  const [reports, setReports] = useState<MapReport[] | null>(null);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/v1/public/incidents/${INCIDENT}/community-reports?view=map`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("reports unavailable");
        return response.json() as Promise<{ reports: MapReport[] }>;
      })
      .then((payload) => setReports(payload.reports))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setReports([]);
      });
    return () => controller.abort();
  }, []);

  const askForLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Tu navegador no permite compartir la ubicación.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setPosition([result.coords.longitude, result.coords.latitude]);
        setLocating(false);
      },
      () => {
        // No se insiste ni se explica de más: decir por qué falló y ofrecer el mapa completo es más
        // útil que pedir otra vez un permiso que la persona acaba de negar a propósito.
        setLocationError("No pudimos leer tu ubicación. Puedes buscar en el mapa completo.");
        setLocating(false);
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const nearby = useMemo<NearbyPoint[]>(() => {
    if (!position || !reports) return [];
    return reports
      .filter(
        (report) =>
          (report.reportType === "acopio" || report.reportType === "albergue") &&
          report.status !== "rejected",
      )
      .map((report) => ({
        ...report,
        distanceKm: distanceKm(position, report.location.coordinates),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 6);
  }, [position, reports]);

  const shelters = reports?.filter((report) => report.reportType === "albergue").length ?? 0;
  const supplies = reports?.filter((report) => report.reportType === "acopio").length ?? 0;

  return (
    <>
      <section className="helpHero">
        <h1>Si el sismo te afectó, esto es lo que sirve saber</h1>
        <p className="helpLede">
          Lo primero es saber en qué municipio estás: la respuesta correcta no es la misma en una
          ciudad con brigadas censando que en una vereda donde todavía no ha ido nadie.
        </p>
      </section>

      {/* Paso 1. Va primero y con el aviso más fuerte de la página. Alguien puede llegar aquí
          creyendo que registrarse en un sitio web lo mete en el censo, esperar, y perder el día en
          que pasó la brigada por su calle. */}
      <WhereAreYou />

      <section className="helpStep" id="censo-oficial">
        <p className="helpStepNum">Sobre el censo oficial</p>
        <h2>Quién censa, y por qué no se hace por internet</h2>
        <div className="helpWarning">
          <p>
            <strong>El censo oficial lo diligencia personal autorizado, casa a casa.</strong> No
            existe inscripción por QR, por teléfono, por formulario digital ni por redes sociales —
            la Alcaldía de Cali lo advirtió expresamente para su ciudad, y es la forma en que
            funciona el registro en todo el país: lo cargan los consejos municipales y
            departamentales de gestión del riesgo desde el terreno.
          </p>
          <p>
            Si alguien te pide datos o dinero para «inscribirte en las ayudas», no es el censo. El
            censo no cobra y no se hace en línea.
          </p>
        </div>
        <p>
          <strong>Y de ahí sale el problema que este sitio existe para mostrar:</strong> si el
          registro solo avanza cuando una brigada llega a tu puerta, en los municipios donde no ha
          llegado ninguna el censo no avanza. Por eso la primera pregunta de esta página es dónde
          estás.
        </p>
        <p className="helpAside">
          <strong>Pulso no te censa y no puede hacerlo.</strong> Somos una plataforma de código
          abierto hecha por voluntarios; no somos autoridad y no decidimos quién recibe ayuda. Lo
          que publicamos son mapas y cifras con su fuente, para que quien sí decide tenga con qué.
        </p>
      </section>

      <section className="helpStep" id="cerca">
        <p className="helpStepNum">También te sirve</p>
        <h2>Dónde hay un albergue o un punto de acopio cerca de ti</h2>
        <p>
          Tenemos {supplies.toLocaleString("es-CO")} puntos de acopio y{" "}
          {shelters.toLocaleString("es-CO")} albergues publicados por fuentes oficiales y
          ciudadanas. Si compartes tu ubicación te mostramos los más cercanos; no la guardamos.
        </p>

        <div className="helpActions">
          <button
            type="button"
            className="psNavCta helpPrimary"
            onClick={askForLocation}
            disabled={locating}
          >
            {locating ? "Buscando…" : "Ver los más cercanos"}
          </button>
          <a className="helpSecondary" href="/#mapa">
            O buscar en el mapa completo
          </a>
        </div>

        {locationError ? (
          <p className="helpError" role="status">
            {locationError}
          </p>
        ) : null}

        {nearby.length > 0 ? (
          <ol className="helpNearby">
            {nearby.map((point) => {
              const [lon, lat] = point.location.coordinates;
              const room =
                point.shelterCapacity !== null && point.shelterOccupancy !== null
                  ? point.shelterCapacity - point.shelterOccupancy
                  : null;
              return (
                <li key={point.id}>
                  <div>
                    <span className="helpNearbyType">
                      {TYPE_LABEL[point.reportType] ?? "Punto de ayuda"}
                    </span>
                    <strong>{point.title}</strong>
                    <small>
                      a{" "}
                      {point.distanceKm < 1
                        ? `${Math.round(point.distanceKm * 1000)} metros`
                        : `${point.distanceKm.toFixed(1)} km`}{" "}
                      en línea recta
                      {room !== null ? ` · espacio para ${room} personas según la fuente` : ""}
                    </small>
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Cómo llegar
                  </a>
                </li>
              );
            })}
          </ol>
        ) : null}

        {position && nearby.length === 0 && reports !== null ? (
          <p className="helpError" role="status">
            No tenemos ningún acopio ni albergue publicado cerca de donde estás. Eso no significa
            que no haya: significa que nadie lo ha publicado donde podamos verlo.
          </p>
        ) : null}
      </section>

      <section className="helpStep" id="reportar">
        <p className="helpStepNum">Y si falta algo</p>
        <h2>Reporta lo que falta, para que se sepa</h2>
        <p>
          Puedes marcar en el mapa lo que necesitas —agua, alimentos, medicamentos, remoción de
          escombros— o un daño, o una vía cerrada. Aparece de inmediato y sin cuenta.
        </p>
        <div className="helpWarning subtle">
          <p>
            <strong>Reportar aquí no te inscribe en ninguna ayuda</strong> y no reemplaza el censo
            del paso 1. Sirve para otra cosa: para que quien coordina vea dónde falta qué, y para
            que un municipio del que nadie ha reportado nada deje de parecer un municipio donde no
            pasó nada.
          </p>
        </div>
        <div className="helpActions">
          <a className="psNavCta helpPrimary" href="/#mapa">
            Reportar en el mapa
          </a>
        </div>
      </section>

      <section className="helpStep" id="desaparecidos">
        <p className="helpStepNum">Si buscas a alguien</p>
        <h2>Si estás buscando a alguien</h2>
        <p>
          <strong>Esto no pasa por Pulso.</strong> Las personas desaparecidas tienen una ruta
          oficial con obligaciones legales que una plataforma ciudadana no puede cumplir, y publicar
          nombres y fotos por fuera de ella puede poner a alguien en riesgo en vez de ayudarlo.
        </p>
        <p>
          La ruta es el <strong>Mecanismo de Búsqueda Urgente</strong>, que se activa en la{" "}
          <strong>Personería</strong>, la <strong>Fiscalía</strong>, el <strong>CTI</strong> o la{" "}
          <strong>SIJIN</strong>, y queda en el registro nacional SIRDEC. Se puede activar de
          inmediato: <strong>no hay que esperar 72 horas</strong> — eso es un mito.
        </p>
        <p className="helpAside">
          Por esa razón en Pulso no vas a encontrar un listado de personas desaparecidas, aunque
          otras plataformas lo tengan. Es una decisión, no una carencia.
        </p>
      </section>
    </>
  );
}
