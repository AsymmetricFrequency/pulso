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

## Lo que falta

El sistema convive con el CSS anterior en vez de reemplazarlo: `globals.css` sigue teniendo estilos
con hexadecimales sueltos en secciones que todavía no se migraron (mapa, formularios, informe de
ayuda). La migración se hará por secciones a medida que se toquen, no en una pasada masiva que
arriesgaría romper pantallas que hoy funcionan.
