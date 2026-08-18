"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

/**
 * La navegación está organizada por **intención, no por sección**.
 *
 * Antes eran once enlaces planos en una sola fila: siete anclas del informe y cuatro páginas, todos
 * con el mismo estilo. Dos problemas que se notaban sin poder nombrarlos:
 *
 * 1. **Las anclas estaban muertas en cuatro de las cinco páginas.** `#mapa` no existe en
 *    `/auditoria`, así que media barra no hacía nada y la sección activa se marcaba mal.
 * 2. **No decían a quién le servía cada cosa.** Quien llega a este sitio llega con una de cuatro
 *    intenciones —necesito ayuda, quiero ayudar, quiero ver qué pasa, quiero verificar— y once
 *    sustantivos en fila no responden ninguna.
 *
 * Ahora la barra tiene los cuatro caminos, un botón de reportar que no se esconde nunca, y las
 * vistas de trabajo separadas porque son para equipos, no para el público.
 */
const PATHS = [
  {
    href: "/necesito-ayuda",
    label: "Necesito ayuda",
    hint: "Cómo te censan, dónde hay acopio y albergue",
  },
  { href: "/#ayuda", label: "Quiero ayudar", hint: "Qué falta y dónde llevarlo" },
  { href: "/#mapa", label: "El mapa", hint: "Daños, vías, acopios y albergues" },
  { href: "/auditoria", label: "Auditoría", hint: "A dónde va la plata y si la ayuda llegó" },
];

/** Vistas de trabajo. Van aparte porque son para equipos identificados, no para quien pasa. */
const CREW = [
  { href: "/field", label: "Brigada en terreno" },
  { href: "/reconstruccion", label: "Reconstrucción" },
  { href: "/operations", label: "Operaciones" },
];

/**
 * Las secciones del informe. **Solo se dibujan en la portada**, que es la única página donde
 * existen: una barra que ofrece saltar a un sitio que no está en esta página es una promesa
 * incumplida y era exactamente lo que hacía.
 */
const SECTIONS = [
  { id: "informe", label: "Cifras" },
  { id: "situacion", label: "Qué pasa" },
  { id: "intensidad", label: "Intensidad" },
  { id: "censo", label: "Censo" },
  { id: "mapa", label: "Mapa" },
  { id: "ayuda", label: "Ayuda" },
  { id: "metodologia", label: "Cómo verificamos" },
];

export function SiteNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [active, setActive] = useState<string>("informe");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  /**
   * Corrige el destino de un enlace profundo mientras la página termina de crecer.
   *
   * Casi todo el contenido llega por fetch después del primer pintado: el feed pasa de tres filas
   * de respaldo a ocho reales, la intensidad de un esqueleto a una tabla de veintiún filas. El
   * navegador salta al ancla con las alturas del primer pintado y, cuando el contenido de arriba
   * crece, la sección buscada se va hacia abajo y el visitante queda mirando un hueco vacío.
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

  /**
   * Marca la sección visible con IntersectionObserver y no con el evento de scroll: escuchar
   * scroll obliga a leer la posición de cada sección en cada cuadro, que es el patrón clásico de
   * *layout thrashing*. El observador avisa solo cuando algo entra o sale.
   */
  useEffect(() => {
    if (!isHome) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const section of SECTIONS) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [isHome]);

  // Escape cierra el menú y devuelve el foco al botón que lo abrió. Sin esto, quien navega con
  // teclado queda dentro de un panel del que no puede salir sin buscar el botón a ciegas.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const isCurrentPath = (href: string) =>
    href.startsWith("/#") ? false : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header className="psNavBar" id="top">
        <div className="psNavInner">
          <a className="brand" href="/" aria-label="Inicio de PULSO">
            <span className="brandMark" aria-hidden="true" />
            <span>PULSO</span>
          </a>

          <nav className="psNavPaths" aria-label="Secciones principales">
            {PATHS.map((path) => (
              <a
                key={path.href}
                className="psNavLink"
                href={path.href}
                aria-current={isCurrentPath(path.href) ? "page" : undefined}
              >
                {path.label}
              </a>
            ))}
          </nav>

          <div className="psNavActions">
            {/* El botón de reportar no se esconde nunca, ni detrás de un menú en móvil. Es la única
                acción del sitio que alguien puede necesitar con una mano, de pie, al lado de un
                derrumbe — y en ese momento no va a buscarla en un desplegable. */}
            <a className="psNavCta" href="/#mapa">
              Reportar
            </a>

            <button
              ref={toggleRef}
              type="button"
              className="psNavMenuToggle"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="psNavBurger" aria-hidden="true" data-open={menuOpen} />
              <span className="srOnly">{menuOpen ? "Cerrar el menú" : "Abrir el menú"}</span>
            </button>
          </div>
        </div>

        {/* Las secciones del informe son navegación **de esta página**, así que van en su propia
            franja debajo de la barra y solo en la portada. Mezclarlas con los destinos del sitio era
            lo que hacía que once enlaces se vieran como una sola lista sin jerarquía. */}
        {isHome ? (
          <nav className="psNavSections" aria-label="Secciones de esta página">
            <div className="psNavSectionsTrack">
              {SECTIONS.map((section) => (
                <a
                  key={section.id}
                  className="psNavSectionLink"
                  href={`#${section.id}`}
                  aria-current={active === section.id ? "true" : undefined}
                >
                  {section.label}
                </a>
              ))}
            </div>
          </nav>
        ) : null}
      </header>

      {/* Un panel de verdad, no una tira con desplazamiento horizontal. La tira escondía enlaces
          detrás de un gesto que nadie sabe que existe: si no se ve, no está. */}
      <div
        id={menuId}
        ref={panelRef}
        className="psNavPanel"
        data-open={menuOpen}
        hidden={!menuOpen}
      >
        <div className="psNavPanelInner">
          <p className="psNavPanelLabel">Qué necesitas</p>
          <ul>
            {PATHS.map((path) => (
              <li key={path.href}>
                <a href={path.href} onClick={() => setMenuOpen(false)}>
                  <strong>{path.label}</strong>
                  <small>{path.hint}</small>
                </a>
              </li>
            ))}
          </ul>

          <p className="psNavPanelLabel">Para equipos</p>
          <ul className="crew">
            {CREW.map((view) => (
              <li key={view.href}>
                <a href={view.href} onClick={() => setMenuOpen(false)}>
                  <strong>{view.label}</strong>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
