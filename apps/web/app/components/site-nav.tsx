"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "informe", label: "Informe" },
  { id: "situacion", label: "Qué pasa" },
  { id: "intensidad", label: "Intensidad" },
  { id: "mapa", label: "Mapa" },
  { id: "ayuda", label: "Ayuda" },
  { id: "metodologia", label: "Cómo verificamos" },
];

/**
 * Barra de navegación con la sección activa marcada.
 *
 * Se usa IntersectionObserver y no el evento de scroll a propósito: escuchar
 * scroll obliga a leer la posición de cada sección en cada cuadro, que es el
 * patrón clásico de *layout thrashing*. El observador avisa solo cuando algo
 * entra o sale, y el navegador hace ese cálculo fuera del hilo principal.
 */
export function SiteNav() {
  const [active, setActive] = useState<string>("informe");

  /**
   * Corrige el destino de un enlace profundo mientras la página termina de crecer.
   *
   * Casi todo el contenido llega por fetch después del primer pintado: el feed pasa de tres filas
   * de respaldo a ocho reales, la intensidad de un esqueleto a una tabla de veintiún filas. El
   * navegador salta al ancla con las alturas del primer pintado y, cuando el contenido de arriba
   * crece, la sección buscada se va hacia abajo y el visitante queda mirando un hueco vacío — que
   * es exactamente lo que pasaba al abrir /#intensidad.
   *
   * Se vuelve a apuntar mientras la altura del documento siga cambiando, con un tope de tiempo
   * para no pelear con el desplazamiento de la persona si decide moverse.
   */
  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    if (!targetId) return;

    let lastHeight = document.body.scrollHeight;
    const deadline = Date.now() + 4_000;
    let cancelled = false;

    const stopOnUserScroll = () => {
      cancelled = true;
    };
    window.addEventListener("wheel", stopOnUserScroll, { once: true, passive: true });
    window.addEventListener("touchstart", stopOnUserScroll, { once: true, passive: true });

    const timer = window.setInterval(() => {
      if (cancelled || Date.now() > deadline) {
        window.clearInterval(timer);
        return;
      }
      const height = document.body.scrollHeight;
      if (height === lastHeight) return;
      lastHeight = height;
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    }, 250);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("wheel", stopOnUserScroll);
      window.removeEventListener("touchstart", stopOnUserScroll);
    };
  }, []);

  useEffect(() => {
    const elements = SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (element): element is HTMLElement => element !== null,
    );
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Se elige la sección visible más arriba, no la última que disparó: al
        // desplazarse rápido entran varias a la vez y quedarse con la última
        // haría parpadear el subrayado.
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      // El margen superior descuenta la propia barra; sin él la sección se
      // marcaría activa cuando todavía está oculta detrás de ella.
      { rootMargin: "-72px 0px -55% 0px", threshold: 0 },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <header className="psNavBar" id="top">
      <div className="psNavInner">
        <a className="brand" href="#top" aria-label="Inicio de PULSO">
          <span className="brandMark" aria-hidden="true" />
          <span>PULSO</span>
        </a>

        <nav className="psNavSections" aria-label="Secciones del informe">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              className="psNavLink"
              href={`#${section.id}`}
              aria-current={active === section.id ? "true" : undefined}
            >
              {section.label}
            </a>
          ))}
        </nav>

        {/* Las páginas propias van en su propia zona, separadas de las anclas del informe: son
            destinos distintos y mezclarlas hacía que ni se encontraran ni se entendieran. */}
        <div className="psNavActions">
          <a className="psNavLink" href="/auditoria">
            Auditoría
          </a>
          <a className="psNavLink" href="/reconstruccion">
            Reconstrucción
          </a>
          <a className="psNavLink" href="/field">
            Campo
          </a>
          <a className="psNavCta" href="/operations">
            Operaciones
          </a>
        </div>
      </div>
    </header>
  );
}
