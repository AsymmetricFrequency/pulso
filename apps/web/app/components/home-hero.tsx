"use client";

import { useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INCIDENT = "colombia-2026";

type Coverage = {
  counts: { silencio: number; sin_censo: number };
  municipalitiesWithShaking: number;
};

/**
 * La portada abre con el hallazgo, no con un eslogan.
 *
 * Antes decía «Lo que ocurre, lo que falta y dónde se está ayudando» — una frase que ocupaba la
 * primera pantalla entera y no contenía un solo dato. Quien llegaba veía cero información antes de
 * desplazarse, y el botón más prominente era **la vista de brigada**: la acción más destacada del
 * sitio apuntaba a las poquísimas personas que son brigada.
 *
 * Ahora abre con la cifra que tenemos y que no tiene nadie más: en cuántos municipios sacudió
 * fuerte y todavía no ha ido nadie. Es nuestra, sale de la API, y se actualiza sola.
 */
export function HomeHero() {
  const [coverage, setCoverage] = useState<Coverage | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/v1/public/incidents/${INCIDENT}/census-coverage?limit=1`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("coverage unavailable");
        return response.json() as Promise<Coverage>;
      })
      .then(setCoverage)
      .catch(() => setCoverage(null));
    return () => controller.abort();
  }, []);

  const silent = coverage?.counts.silencio ?? 0;

  return (
    <section className="homeHero">
      <div className="homeHeroText">
        {/* Sin dato no se inventa un número: se dice lo que el proyecto hace, que también es cierto.
            Un titular que dijera «En 0 municipios…» sería peor que no tener titular. */}
        <h1>
          {silent > 0 ? (
            <>
              En <strong>{silent}</strong> municipios todavía no ha ido nadie a contar a los
              afectados.
            </>
          ) : (
            <>Lo que se sabe del terremoto, y lo que todavía no.</>
          )}
        </h1>

        <p className="homeHeroLede">
          Reunimos lo que publican las autoridades y lo que reporta la gente,{" "}
          <strong>con la fuente y la fecha de cada dato</strong>. Ocho días después del sismo, la
          pregunta ya no es solo qué pasó: es a dónde no ha llegado nadie todavía.
        </p>

        <div className="homeHeroActions">
          {/* El orden cambia respecto a antes, y es la decisión de esta pantalla: el botón lleno es
              para quien perdió la casa, no para las brigadas. Ellas saben a dónde entrar. */}
          <a className="homeHeroPrimary" href="/necesito-ayuda">
            Necesito ayuda
          </a>
          <a className="homeHeroSecondary" href="#mapa">
            Ver el mapa
          </a>
        </div>
      </div>

      {coverage ? (
        <aside className="homeHeroAside" aria-label="Resumen de la cobertura del censo">
          <dl>
            <div>
              <dt>Municipios sin que haya ido nadie</dt>
              <dd className="alarm">{silent}</dd>
            </div>
            <div>
              <dt>Con señal de afectación y sin censo</dt>
              <dd>{coverage.counts.sin_censo.toLocaleString("es-CO")}</dd>
            </div>
            <div>
              <dt>Municipios con lectura de sacudida</dt>
              <dd>{coverage.municipalitiesWithShaking.toLocaleString("es-CO")}</dd>
            </div>
          </dl>
          <a href="#censo">Cómo se calcula</a>
        </aside>
      ) : null}
    </section>
  );
}
