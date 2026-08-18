import type { SVGProps } from "react";

/**
 * Iconos de trazo, dibujados a mano en SVG.
 *
 * Reemplazan a los emoji que hacían de icono. No es preferencia estética: un
 * emoji lo dibuja el sistema operativo, así que el mismo "📦" sale plano en
 * Windows, tridimensional en Android y con otro color en cada plataforma —
 * imposible de alinear con una paleta— y su tamaño no responde al peso
 * tipográfico del texto que acompaña. Además el lector de pantalla lee su
 * nombre completo ("paquete") en medio de una frase donde solo era decoración.
 *
 * Todos comparten caja de 24, trazo de 1.75 y `currentColor`, así que heredan
 * el color del texto y basta cambiar `font-size` para escalarlos.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number; title?: string };

function Icon({ size = 16, title, children, ...props }: IconProps) {
  // El `<title>` se dibuja siempre, pero cuando el icono es decorativo el
  // `aria-hidden` lo saca del árbol de accesibilidad y el lector de pantalla
  // nunca lo lee. Es lo correcto: la etiqueta ya está escrita al lado en texto,
  // y anunciarla dos veces estorba más de lo que ayuda.
  const decorative = !title;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "img"}
      focusable="false"
      {...props}
    >
      <title>{title ?? ""}</title>
      {children}
    </svg>
  );
}

export const IconLocation = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </Icon>
);

export const IconBuilding = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15" />
    <path d="M14 10h4a2 2 0 0 1 2 2v9" />
    <path d="M2 21h20M8 8h2M8 12h2M8 16h2M17 14h1M17 18h1" />
  </Icon>
);

export const IconBox = (props: IconProps) => (
  <Icon {...props}>
    <path d="m21 8-9-5-9 5v8l9 5 9-5V8Z" />
    <path d="m3 8 9 5 9-5M12 13v8" />
  </Icon>
);

export const IconClock = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const IconUsers = (props: IconProps) => (
  <Icon {...props}>
    <path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="3.2" />
    <path d="M22 20v-2a4 4 0 0 0-3-3.87M16.5 4.2a3.2 3.2 0 0 1 0 5.6" />
  </Icon>
);

export const IconCheck = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </Icon>
);

export const IconCalendar = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);

export const IconFlag = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 22V4M4 4h10l-1.5 3L14 10H4" />
  </Icon>
);

export const IconAlert = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </Icon>
);

export const IconTools = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14.7 6.3a4 4 0 0 0 5 5L21 21l-2 2-9.7-9.7a4 4 0 0 0-5-5L2 4.3 4.3 2Z" />
  </Icon>
);

export const IconWorker = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 11a8 8 0 0 1 16 0" />
    <path d="M2.5 11h19M12 3v2M8 21v-2a4 4 0 0 1 8 0v2" />
    <circle cx="12" cy="15" r="2.2" />
  </Icon>
);

export const IconNote = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 3h8a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z" />
    <path d="M9 8h6M9 12h6" />
  </Icon>
);

export const IconExternal = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </Icon>
);

export const IconCrosshair = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </Icon>
);

/* -------------------------------------------------------------------------
   Categorías de necesidad
   ---------------------------------------------------------------------- */

export const IconWater = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3s6 6.4 6 10.4a6 6 0 0 1-12 0C6 9.4 12 3 12 3Z" />
    <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
  </Icon>
);

export const IconFood = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 12a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6Z" />
    <path d="M8 7V5.5M12 7V5M16 7V5.5M8 12h8" />
  </Icon>
);

export const IconHealth = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 3v5a4 4 0 0 0 8 0V3" />
    <path d="M9 12v2a5 5 0 0 0 10 0v-1" />
    <circle cx="19" cy="11" r="2" />
  </Icon>
);

export const IconShelter = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4 3 20h18L12 4Z" />
    <path d="M12 4v16M8.5 20l3.5-6 3.5 6" />
  </Icon>
);

export const IconHygiene = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 8h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
    <path d="M10 8V5h4v3M7 13h10" />
  </Icon>
);

export const IconRubble = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 20h18" />
    <path d="M5 20l2.5-5 3 3 2.5-6 3 5 2 3" />
    <path d="M7 9 5.5 6M16 7l2-2" />
  </Icon>
);

export const IconVolunteer = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 9.5c-1.6-2.6-5.5-1.4-5.5 1.4 0 2.2 3 4.4 5.5 6.1 2.5-1.7 5.5-3.9 5.5-6.1 0-2.8-3.9-4-5.5-1.4Z" />
    <path d="M3 21c1.2-2 3.4-3 5-3M21 21c-1.2-2-3.4-3-5-3" />
  </Icon>
);

export const IconPaw = (props: IconProps) => (
  <Icon {...props}>
    <ellipse cx="6.5" cy="10" rx="1.9" ry="2.5" />
    <ellipse cx="17.5" cy="10" rx="1.9" ry="2.5" />
    <ellipse cx="10" cy="6" rx="1.8" ry="2.3" />
    <ellipse cx="14" cy="6" rx="1.8" ry="2.3" />
    <path d="M12 13c-2.5 0-4.5 1.9-4.5 4S9.5 21 12 21s4.5-1.9 4.5-4-2-4-4.5-4Z" />
  </Icon>
);

export const IconTruck = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 7a1 1 0 0 1 1-1h9v10H4a1 1 0 0 1-1-1V7Z" />
    <path d="M13 10h4l3 3v3h-7" />
    <circle cx="7.5" cy="18" r="1.8" />
    <circle cx="16.5" cy="18" r="1.8" />
  </Icon>
);

export const IconDot = (props: IconProps) => (
  <Icon {...props}>
    <path d="m12 4 3.5 8-3.5 8-3.5-8 3.5-8Z" />
  </Icon>
);

export const IconSos = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9.5c0-.8.9-1.5 2-1.5s2 .7 2 1.5-1 1.2-2 1.5-2 .7-2 1.5.9 1.5 2 1.5 2-.7 2-1.5" />
    <path d="M12 6.5v11" />
  </Icon>
);

/* -------------------------------------------------------------------------
   Oficios de reconstrucción
   ---------------------------------------------------------------------- */

export const IconCompass = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </Icon>
);

export const IconCrane = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 21h8M8 21V4M8 4h11M19 4v4" />
    <path d="M8 4 3 9h5M19 8v4M17 12h4l-2 3h-.1L17 12Z" />
  </Icon>
);

export const IconBrick = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="5" rx="1" />
    <rect x="3" y="14" width="18" height="5" rx="1" />
    <path d="M11 5v5M15 14v5" />
  </Icon>
);

export const IconPlug = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 3v5M15 3v5" />
    <path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" />
    <path d="M12 17v4" />
  </Icon>
);

export const IconWrench = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15.5 3.5a5 5 0 0 0-5.9 6.5L3 16.6 5.4 19l6.6-6.6a5 5 0 0 0 6.5-5.9l-2.9 2.9-2.6-.7-.7-2.6 3.2-2.6Z" />
  </Icon>
);

export const IconSaw = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 8h13l4 4-4 4H3" />
    <path d="m5 16 1.5 2 2-2 2 2 2-2 2 2 1.5-2" />
  </Icon>
);

export const IconStore = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Z" />
    <path d="M3 9 5 4h14l2 5" />
    <path d="M9 20v-6h6v6" />
  </Icon>
);

/* -------------------------------------------------------------------------
   Marcadores del mapa
   -------------------------------------------------------------------------
   Se exportan como trazo y no como componente porque tienen que dibujarse en
   dos contextos distintos: dentro del SVG del mapa de país (donde son nodos de
   React) y dentro del `divIcon` de Leaflet (donde son una cadena de HTML). Un
   componente no sirve para lo segundo. */

/**
 * Clave de dibujo de un marcador. No coincide con `reportType` a propósito: una vía se pinta
 * distinto según esté cerrada o abierta, y esa diferencia tiene que estar en la **forma**, no solo
 * en el color — quien no distingue rojo de verde también necesita saber si puede pasar.
 */
export type ReportMarkerKey =
  | "rescate"
  | "pmu"
  | "necesidad"
  | "via-bloqueada"
  | "via-habilitada"
  | "dano"
  | "dano-colapso";

export const reportMarkerKey = (report: {
  reportType: string;
  routeStatus?: string | null;
  damageSeverity?: string | null;
}): ReportMarkerKey =>
  report.reportType === "via"
    ? report.routeStatus === "habilitada"
      ? "via-habilitada"
      : "via-bloqueada"
    : report.reportType === "dano"
      ? report.damageSeverity === "colapso"
        ? "dano-colapso"
        : "dano"
      : (report.reportType as ReportMarkerKey);

export const REPORT_MARKER_PATH: Record<ReportMarkerKey, string> = {
  // Persona con los brazos levantados: hay alguien ahí abajo. A 14 píxeles no cabe un dibujo de
  // escombros que se distinga de la montañita de la categoría `escombros`, y confundir los dos es
  // justo lo que este tipo de reporte existe para evitar.
  rescate:
    "M12 3.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 1 0 0-3.8M12 8.4v5.4M8.4 6.6 12 10l3.6-3.4M9 19l3-5.2 3 5.2",
  // Bandera: puesto de mando.
  pmu: "M6 21V3M6 3h11l-2 3.5L17 10H6",
  // Triángulo de alerta: necesidad.
  necesidad:
    "M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01",
  // Las dos vías comparten el círculo —son la misma familia, «estado de la vía»— y se separan por
  // lo de dentro: la barra del sentido prohibido cuando está cerrada, el visto cuando está abierta.
  // Es la misma pareja de señales que ya está en cualquier carretera.
  "via-bloqueada": "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M7.5 12h9",
  "via-habilitada": "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M8 12.2l2.7 2.8L16 9.4",
  // Edificio con una grieta: daño estructural. El colapso es el mismo edificio partido, con la
  // mitad caída — se distingue de un vistazo y sin depender del color, que es lo que hace falta
  // cuando lo que se busca en el mapa es dónde pudo quedar gente debajo.
  dano: "M5 21V6l7-3 7 3v15M5 21h14M12 8v3l-2 2 2 2v3",
  "dano-colapso": "M4 21V8l6-3v7M20 21l-2-7-8 3 2 7M4 21h16M9 12l3 2",
};

/** El mismo trazo del marcador, como componente, para el formulario y las leyendas. */
export const IconRescue = (props: IconProps) => (
  <Icon {...props}>
    <path d={REPORT_MARKER_PATH.rescate} />
  </Icon>
);

/** El mismo trazo, para la leyenda del mapa. */
export const IconRouteBlocked = (props: IconProps) => (
  <Icon {...props}>
    <path d={REPORT_MARKER_PATH["via-bloqueada"]} />
  </Icon>
);

/** El mismo trazo, para la leyenda y la ficha de un daño. */
export const IconDamage = (props: IconProps) => (
  <Icon {...props}>
    <path d={REPORT_MARKER_PATH.dano} />
  </Icon>
);

export const IconCollapse = (props: IconProps) => (
  <Icon {...props}>
    <path d={REPORT_MARKER_PATH["dano-colapso"]} />
  </Icon>
);

/** Marcador listo para incrustar como HTML, para el `divIcon` de Leaflet. */
export const reportMarkerSvg = (type: ReportMarkerKey, size = 14) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<path d="${REPORT_MARKER_PATH[type]}"/></svg>`;
