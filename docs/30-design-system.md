# Sistema de diseño

## Decisión

La interfaz no tenía sistema. Cada componente elegía su propio gris, su propio radio y su propia
duración de transición, repartidos en 2.400 líneas de CSS con más de sesenta hexadecimales sueltos.
El resultado se sentía hecho por manos distintas, y cambiar cualquier cosa obligaba a buscar y
reemplazar a ciegas.

`apps/web/app/design-system.css` concentra las decisiones —espacio, radio, tipografía, superficie,
elevación, estado, movimiento— y todo lo demás las consume.

## Sobre la referencia visual

El referente que se pidió es un kit *soft UI*: superficies táctiles, degradados pastel, esquinas
generosas, profundidad emocional. De ahí se toma **el oficio**:

- **Profundidad en dos capas.** Cada nivel de elevación combina una sombra ambiental amplia con una
  directa cercana, que es como se comporta la luz real. Y van **teñidas con la tinta del proyecto**,
  no con negro puro: una sombra gris sobre papel crema se ve sucia.
- **Superficies con luz.** Las tarjetas llevan un degradado casi imperceptible de blanco hacia el
  crema. Es lo que produce la sensación física del estilo de referencia sin recurrir al color.
- **Esquinas generosas** y una escala de espacio de base 4.

Lo que **no** se toma es el pastel decorativo. Esta interfaz publica cifras de fallecidos y de
dinero público; un color de juguete le restaría la credibilidad que el contenido necesita. Calidez
sí, frivolidad no.

## Tokens

| Familia | Ejemplos | Regla |
| --- | --- | --- |
| Espacio | `--space-1` … `--space-20` | Base 4. Nada de márgenes inventados. |
| Radio | `--r-xs` … `--r-full` | Cinco pasos; más nadie los distingue. |
| Superficie | `base`, `raised`, `sunken`, `accent`, `inverse` | Cuatro planos. Con más, nadie recuerda cuál va encima. |
| Elevación | `--elev-1` … `--elev-4` | Dos capas por nivel, teñidas de tinta. |
| Texto | `primary`, `secondary`, `tertiary`, `inverse` | Semántico, no "gris claro". |
| Estado | `critical`, `severe`, `strong`, `moderate`, `light`, `none` | **Un color por significado, no por componente.** |
| Movimiento | `--dur-fast/--dur/--dur-slow`, `--ease-out` | Un solo vocabulario para todo el sitio. |

La familia de estado es la que más trabajo ahorra: la intensidad sísmica, la relevancia de un
contrato y el estado de un reporte comparten escala, así que un usuario aprende el código de color
una vez.

## Primitivas

`.psCard`, `.psEyebrow`, `.psBadge[data-status]`, `.psStat`, `.psTableWrap`/`.psTable`, `.psChart`,
`.psLegend`, `.psNavBar`/`.psNavLink`.

## Gráficos: SVG sin librería

`apps/web/app/components/charts.tsx` implementa `BarChart`, `DonutChart`, `ChartLegend` y
`DataTable` en SVG plano.

No es purismo. Chart.js pesa unos 200 KB para tres formas simples, y sobre todo **una librería
genérica dibuja lo que le pidas y no sabe que un valor ausente no es un cero** — la distinción
central de este proyecto. Aquí se maneja explícitamente: una barra de valor mínimo nunca es de
ancho cero, porque una barra invisible se confunde con una fila que no existe.

Reglas que se siguieron:

- Todo gráfico lleva `role="img"` con título y descripción.
- **Los datos existen siempre además como texto**, en la tabla que acompaña al gráfico. Un gráfico
  nunca es la única forma de leer una cifra.
- La barra se prefiere al anillo para comparar magnitudes: el ojo compara longitudes bien y ángulos
  mal. El anillo solo se usa cuando las partes suman un todo con sentido.
- Cifras tabulares en toda columna numérica, para que no bailen al cambiar de dígito.

## Navegación

`SiteNav` marca la sección activa con `IntersectionObserver` y no con el evento de `scroll`:
escuchar scroll obliga a leer la posición de cada sección en cada cuadro, que es el patrón clásico
de *layout thrashing*. El margen superior del observador descuenta la propia barra; sin él una
sección se marcaría activa mientras todavía está oculta detrás.

La barra vive fuera de `<main>` porque dentro quedaría limitada al ancho de la columna de contenido
y el desenfoque se cortaría a media pantalla.

## Un error que valió la pena documentar

La primera versión pintaba la intensidad sísmica con cortes de color en 6.0 y 7.0, mientras el
worker nombraba la percepción con cortes en 6.5 y 7.5. En pantalla aparecían dos departamentos con
la **misma etiqueta "Fuerte" y colores distintos**, uno ámbar y otro azul.

No es un detalle estético: un color que contradice a su propia etiqueta rompe la lectura de la
tabla y hace dudar del dato. La lección quedó incorporada como regla del sistema — **si un valor
tiene nombre y color, ambos salen del mismo umbral**.

## Migración completa

El CSS anterior ya no existe como capa aparte: **169 valores literales pasaron a tokens** —120
colores, 46 radios y 3 sombras— en `globals.css` y en el módulo de operaciones. Fuera de los
bloques `:root` no queda un solo hexadecimal ni un radio en píxeles.

La migración obligó a nombrar tres familias que estaban implícitas en los valores sueltos:

- **Tinta sobre superficie suave de estado.** El color del texto sobre un fondo tenue no es el tono
  pleno del estado: usarlo no alcanza el 4.5:1 que exige el texto. Cada estado tiene su tinta.
- **Acceso restringido** como sexto estado con familia propia. No cabía en la escala de severidad
  porque no es "más grave que crítico", es otra cosa.
- **Escala de texto sobre superficie oscura.** Los paneles invertidos necesitan la suya: el gris
  que funciona sobre crema es ilegible sobre verde profundo.

También se migró la tipografía. El cuerpo del sitio seguía en **Arial** —la única familia que no
salía de un token, y la más visible de todas—; ahora usa la pila del sistema, así que cada
plataforma rinde su propia tipografía de interfaz sin descargar un byte de fuente.

## Iconos: SVG de trazo, no emoji

`components/icons.tsx` reemplaza los emoji que hacían de icono en el detalle de un reporte y en la
barra de reporte del mapa.

No es preferencia estética. Un emoji **lo dibuja el sistema operativo**: el mismo `📦` sale plano en
Windows, tridimensional en Android y con otro color en cada plataforma, imposible de alinear con
una paleta, y su tamaño no responde al peso tipográfico del texto que acompaña. Además el lector de
pantalla lee su nombre completo en medio de una frase donde solo era decoración.

Los iconos comparten caja de 24, trazo de 1.75 y `currentColor`, así que heredan el color del texto
y escalan con él. Los decorativos van con `aria-hidden`: la etiqueta ya está escrita al lado y
anunciarla dos veces estorba más de lo que ayuda.

La migración quedó completa: las once **categorías de necesidad**, los ocho **oficios de
reconstrucción**, las pestañas del módulo y los dos **marcadores del mapa**.

Los marcadores se exportan como trazo (`REPORT_MARKER_PATH`, `reportMarkerSvg`) y no como
componente, porque se dibujan en dos contextos incompatibles: dentro del SVG del mapa de país,
donde son nodos de React, y dentro del `divIcon` de Leaflet, donde son una cadena de HTML.

Se conservan `✕` y `✓`: son signos tipográficos monocromos, no emoji de color. Heredan color y
tamaño de la fuente y son la convención para cerrar y para marcar.

## Lo que falta

- La escala tipográfica del sistema (`--text-*`) todavía convive con tamaños en píxeles en las
  secciones más antiguas; se irán sustituyendo al tocarlas.
