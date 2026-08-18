"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { IconCollapse, IconRescue, IconRouteBlocked } from "./icons";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INCIDENT = "colombia-2026";

type Coverage = {
  counts: { silencio: number; sin_censo: number };
  municipalitiesWithShaking: number;
};

/**
 * Cuenta desde cero hasta el valor real.
 *
 * **No se usa en el titular, y la razón importa.** Lo intenté ahí primero: durante los 900 ms de la
 * animación la portada afirmaba «En 0 municipios todavía no ha ido nadie a contar a los afectados»
 * —exactamente lo contrario de lo que el sitio existe para decir— y se quedaba así el tiempo que
 * tarda alguien en leer una frase. Una animación que hace que una frase sea falsa mientras dura no
 * es un adorno discutible: es una afirmación errónea en pantalla.
 *
 * Se usa donde el cero no invierte el sentido: en la cifra del panel, que es un número junto a su
 * etiqueta y no una oración.
 *
 * Respeta `prefers-reduced-motion`: quien pidió que nada se mueva ve el número final directamente.
 */
function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (target <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // Desaceleración cúbica: arranca rápido y frena, que es como se lee un contador real.
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    setValue(0);
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, durationMs]);

  return value;
}

/**
 * La portada abre con el hallazgo, no con un eslogan.
 *
 * Antes decía «Lo que ocurre, lo que falta y dónde se está ayudando» — una frase que ocupaba la
 * primera pantalla entera y no contenía un solo dato, con el botón más prominente apuntando a la
 * vista de brigada: la acción más destacada del sitio, para las poquísimas personas que son brigada.
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
  const counted = useCountUp(silent);

  return (
    <section className="homeHero">
      <div className="homeHeroText">
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
          {/* El botón lleno es para quien perdió la casa, no para las brigadas. Ellas saben entrar. */}
          <a className="homeHeroPrimary" href="/necesito-ayuda">
            Necesito ayuda
          </a>
          <a className="homeHeroSecondary" href="#mapa">
            Ver el mapa
          </a>
        </div>

        {/* Tres cosas que el mapa distingue, con el mismo glifo que usa el mapa. No son adorno: son
            la leyenda antes de la leyenda, para que quien baje ya sepa qué está mirando. */}
        <ul className="homeHeroLegend">
          <li>
            <IconRescue width={18} height={18} aria-hidden="true" />
            <span>Personas atrapadas reportadas</span>
          </li>
          <li>
            <IconCollapse width={18} height={18} aria-hidden="true" />
            <span>Edificaciones colapsadas</span>
          </li>
          <li>
            <IconRouteBlocked width={18} height={18} aria-hidden="true" />
            <span>Vías sin paso</span>
          </li>
        </ul>
      </div>

      <div className="homeHeroPanel">
        {/* `next/image` sirve WebP y AVIF a quien los acepte, y el tamaño declarado reserva el
            hueco antes de que llegue: sin eso, el texto de al lado salta cuando la imagen carga.
            Sin `priority` a propósito — la cifra es lo que hay que leer primero y una imagen que
            bloquea el pintado retrasaría justo eso. */}
        <Image
          className="homeHeroImage"
          src="/hero-mapa.jpg"
          width={700}
          height={630}
          alt="Ilustración de Colombia con los puntos y rutas de la respuesta a la emergencia"
          // 34vw es el ancho real del panel en pantalla ancha; con 40vw Next elegía una variante
          // demasiado pequeña y la ampliaba, que es como se ve borrosa una imagen que sí está bien.
          sizes="(max-width: 900px) 92vw, 34vw"
        />

        {coverage ? (
          <dl className="homeHeroFigures">
            <div>
              <dt>Municipios sin que haya ido nadie</dt>
              <dd className="alarm">{counted}</dd>
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
        ) : null}

        <a className="homeHeroMethod" href="#censo">
          Cómo se calcula
        </a>
      </div>
    </section>
  );
}
