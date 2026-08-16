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

        <div className="psNavActions">
          <a className="psNavLink" href="/reconstruccion">
            Reconstrucción
          </a>
          <a className="psNavCta" href="/operations">
            Operaciones
          </a>
        </div>
      </div>
    </header>
  );
}
