"use client";

import { useState } from "react";
import { RegistryForm } from "./registry-form";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INCIDENT = "colombia-2026";

type Municipality = {
  divipola: string | null;
  municipality: string;
  department: string | null;
  mmiMax: number | null;
  mmiLabel: string | null;
  reportCount: number;
  coverageState: "silencio" | "sin_censo" | "en_curso" | "con_censo" | "fuera_de_alcance";
  censusObservedAt: string | null;
};

type Estado = "inicio" | "ubicando" | "buscando" | "encontrado" | "sin_resultado" | "fuera";

/**
 * La página empieza preguntando dónde estás, y de ahí sale todo lo demás.
 *
 * **Esto arregla una contradicción del propio sitio.** Publicábamos que en 43 municipios no ha ido
 * nadie a censar y, en la misma página, le decíamos a toda Colombia «el censo es presencial,
 * pregunta cuándo pasa la brigada por tu barrio». A quien vive en uno de esos 43 le estábamos
 * diciendo que esperara a alguien que lleva ocho días sin aparecer.
 *
 * El error de origen fue generalizar: la advertencia de que no hay censo por QR ni formulario la
 * hizo **la Alcaldía de Cali**, sobre Cali. Es cierta y hay que respetarla ahí. Extenderla a una
 * vereda del Chocó donde no ha llegado ninguna brigada no la hace más cierta: la vuelve un consejo
 * que no lleva a ninguna parte.
 */
export function WhereAreYou() {
  const [estado, setEstado] = useState<Estado>("inicio");
  const [encontrado, setEncontrado] = useState<Municipality | null>(null);
  const [texto, setTexto] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);

  /**
   * Un toque en vez de escribir «El Cantón del San Pablo» con el pulgar.
   *
   * La ubicación se usa para resolver el municipio contra los límites del DANE y **no se guarda en
   * ninguna parte**: entra en la consulta, sale un municipio, y ahí se acaba. Se dice en pantalla
   * porque quien duda de eso no toca el botón, y entonces vuelve a escribir a mano.
   */
  const usarUbicacion = () => {
    if (!navigator.geolocation) {
      setEscribiendo(true);
      return;
    }
    setEstado("ubicando");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const response = await fetch(
            `${apiUrl}/v1/public/incidents/${INCIDENT}/census-coverage?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,
          );
          const data = (await response.json()) as { municipality: Municipality | null };
          if (data.municipality) {
            setEncontrado(data.municipality);
            setEstado("encontrado");
          } else {
            // Fuera de los polígonos del MGN: en el mar, cruzando una frontera, o el GPS mintió.
            setEstado("fuera");
            setEscribiendo(true);
          }
        } catch {
          setEstado("sin_resultado");
          setEscribiendo(true);
        }
      },
      () => {
        // Permiso negado o sin señal de GPS. No se insiste: se abre el campo de texto y ya.
        setEstado("inicio");
        setEscribiendo(true);
      },
      { timeout: 12_000, maximumAge: 120_000 },
    );
  };

  const buscar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (texto.trim().length < 3) return;
    setEstado("buscando");
    try {
      const response = await fetch(
        `${apiUrl}/v1/public/incidents/${INCIDENT}/census-coverage?municipality=${encodeURIComponent(texto.trim())}`,
      );
      const data = (await response.json()) as { municipality: Municipality | null };
      if (data.municipality) {
        setEncontrado(data.municipality);
        setEstado("encontrado");
      } else {
        setEstado("sin_resultado");
      }
    } catch {
      setEstado("sin_resultado");
    }
  };

  // Con brigadas trabajando, esperar sirve. Sin ellas, no hay a quién esperar.
  const hayBrigadas =
    encontrado?.coverageState === "en_curso" || encontrado?.coverageState === "con_censo";

  return (
    <section className="helpStep" id="donde">
      <p className="helpStepNum">Empieza aquí</p>
      <h2>¿En qué municipio estás?</h2>
      <p>
        Lo que conviene hacer no es igual en todas partes. Un toque y te decimos lo que sirve{" "}
        <em>ahí donde estás</em>.
      </p>

      {/* Un botón. Es la ruta de cero fricción y por eso va primero, grande y solo: escribir es la
          alternativa, no el camino principal. */}
      {!escribiendo && estado !== "encontrado" ? (
        <div className="whereActions">
          <button
            type="button"
            className="psNavCta helpPrimary whereLocate"
            onClick={usarUbicacion}
            disabled={estado === "ubicando"}
          >
            {estado === "ubicando" ? "Ubicando…" : "Usar mi ubicación"}
          </button>
          <button type="button" className="whereTypeInstead" onClick={() => setEscribiendo(true)}>
            O escribir el municipio
          </button>
          <p className="whereNote">
            Solo la usamos para saber en qué municipio estás. <strong>No la guardamos.</strong>
          </p>
        </div>
      ) : null}

      {escribiendo && estado !== "encontrado" ? (
        <form className="whereForm" onSubmit={buscar}>
          <label htmlFor="municipio" className="srOnly">
            Municipio
          </label>
          <input
            id="municipio"
            name="municipio"
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            placeholder="Ej. Quibdó, Ulloa, Cali"
            autoComplete="address-level2"
            enterKeyHint="search"
          />
          <button type="submit" className="psNavCta helpPrimary" disabled={estado === "buscando"}>
            {estado === "buscando" ? "Buscando…" : "Continuar"}
          </button>
        </form>
      ) : null}

      {estado === "fuera" ? (
        <p className="helpError" role="status">
          Tu ubicación cae fuera de los municipios que tenemos cargados. Escribe el nombre y
          seguimos.
        </p>
      ) : null}

      {estado === "sin_resultado" ? (
        <p className="helpError" role="status">
          No encontramos ese municipio. Revisa cómo se escribe, o sigue con los pasos de abajo —
          sirven igual.
        </p>
      ) : null}

      {estado === "encontrado" && encontrado ? (
        <div className="whereResult">
          <p className="whereResultPlace">
            <strong>{encontrado.municipality}</strong>
            {encontrado.department ? ` · ${encontrado.department}` : ""}
          </p>

          {hayBrigadas ? (
            <>
              <div className="helpWarning subtle">
                <p>
                  <strong>En {encontrado.municipality} hay censo oficial en marcha.</strong> Ahí la
                  vía que cuenta es la presencial: el registro lo diligencia personal autorizado,
                  casa a casa. No hay inscripción por internet, y quien te pida datos o dinero para
                  «inscribirte en las ayudas» no es el censo.
                </p>
              </div>
              <p>
                <strong>Lo que te conviene hacer:</strong> preguntar en la alcaldía o en la oficina
                de Gestión del Riesgo cuándo pasa la brigada por tu barrio o vereda, y estar cuando
                pase. Si vives en un albergue, pregúntale a quien lo coordina — el censo suele
                llegar antes ahí.
              </p>
              <p className="helpAside">
                Puedes además dejar constancia aquí. No reemplaza al censo y no te inscribe en
                ninguna ayuda, pero si la brigada tarda queda registrado que tu hogar está
                esperando.
              </p>
            </>
          ) : (
            <>
              {/* El caso que la página anterior no contemplaba, y son la mayoría de los municipios. */}
              <div className="helpWarning">
                <p>
                  <strong>
                    En {encontrado.municipality} no tenemos registro de que haya ido nadie a censar.
                  </strong>{" "}
                  {/* «de grado severo» y no «fue severo»: la etiqueta viene en masculino del USGS
                      y concordarla con «la sacudida» daba «la sacudida fue severo». */}
                  {encontrado.mmiLabel
                    ? `Ahí la sacudida fue de grado ${encontrado.mmiLabel.toLowerCase()}, y `
                    : ""}
                  ninguna autoridad reporta censo en curso.
                </p>
                <p>
                  Eso significa que <strong>no hay una brigada a la que esperar</strong>. Decirte
                  «pregunta cuándo pasan» sería mandarte a esperar a alguien que lleva días sin
                  aparecer.
                </p>
              </div>

              <p>
                <strong>Lo más útil que puedes hacer ahora es registrarte aquí abajo.</strong> No es
                el censo oficial y no te inscribe en ninguna ayuda —eso no se lo puede dar nadie que
                no sea autoridad— pero es lo que hace que{" "}
                <strong>{encontrado.municipality} aparezca en la lista</strong> de municipios con
                hogares afectados sin censar que le entregamos a las autoridades. Un municipio del
                que nadie reporta nada parece un municipio donde no pasó nada.
              </p>

              <RegistryForm municipalityCode={encontrado.divipola} />
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
