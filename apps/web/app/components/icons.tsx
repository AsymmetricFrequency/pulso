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
