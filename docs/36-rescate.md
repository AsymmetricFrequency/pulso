# Reportar personas atrapadas

## El hueco

Hasta esta versión, alguien parado frente a un edificio colapsado no tenía cómo decirlo en Pulso.
Los tipos de reporte eran dos: puesto de mando y necesidad.

La categoría `escombros` existía y parecía suficiente, pero significa otra cosa: «hay que remover
escombros». Eso espera a una retroexcavadora. «Hay alguien debajo» espera a un equipo USAR con
cámaras térmicas y perros, y espera ahora. Meterlos en la misma casilla obligaría a leer el texto
libre de 2.288 reportes para separarlos.

Es la P0 declarada del proyecto y era lo único de las cuatro prioridades que no tenía ni modelo de
datos.

## Lo que se construyó

Un tercer tipo de reporte, `rescate`, con tres campos propios y su propio camino por todo el sistema.

**Tipo propio, no categoría.** El mapa, la cola pública y la consola de operaciones tienen que poder
separarlo sin leer un enum de once valores ni hacer coincidir texto.

**Tres campos y ninguno más:**

| Campo | Por qué está |
| --- | --- |
| `people_reported` | Dimensiona el equipo que se manda. Aproximado y declarado |
| `signs_of_life` | Separa un rescate en curso de una recuperación. Es el que más pesa al ordenar |
| `responders_on_site` | Evita el peor desperdicio de esta fase: dos equipos al mismo punto y ninguno al otro |

Son los tres datos que un equipo de búsqueda mira para decidir entre dos puntos. No hay nombres, ni
teléfonos, ni parentescos: quien reporta casi nunca los sabe con certeza, y pedirlos convierte un
reporte de treinta segundos en un formulario que nadie termina.

## Decisiones

**Ninguno de los tres es obligatorio.** La ubicación ya es la mitad del valor del reporte. Un
formulario que exige respuestas es un formulario que se abandona — y el reporte que se abandona a
mitad no deja nada, ni siquiera el punto en el mapa. Hay una prueba que fija esto
(`community-report.test.ts`).

**`unknown` es una respuesta legítima en señales de vida**, y es la más común: quien reporta acaba de
llegar. Forzar sí/no produciría datos inventados justo en el campo que más pesa al ordenar la cola.

**El título se deduce, no se escribe.** Los botones ya dicen todo lo que el título necesita decir, así
que el campo de texto desaparece del formulario de rescate: «3 personas bajo escombros — se oyen
señales de vida». Nadie debería redactar un titular de pie al lado de un derrumbe.

**Un rescate va primero en la cola pública, por encima del estado de revisión.** Esto es lo menos
obvio de todo el cambio. La lista pública va recortada —800 en vista de país sobre más de 2.288
reportes— y se ordenaba por estado de revisión. Un rescate recién enviado, que por definición nadie
ha validado todavía, quedaba detrás de cada necesidad ya validada y **podía no entrar en la
respuesta**. Esperar a que alguien lo valide es exactamente el tiempo que no hay.

**Fuera del clúster en el mapa.** Los marcadores de rescate no se agrupan: dentro del globo de «37
reportes en esta cuadra» existirían en los datos y no en la pantalla, que para esto es lo mismo que
no existir. Van en capa propia, más grandes y en el rojo crítico.

**El marcador solo pulsa cuando hay señales de vida reportadas.** Si pulsara siempre sería
decoración; así el movimiento es información. Con `prefers-reduced-motion` se cambia por un contorno
fijo.

**El aviso del 123 va dentro del formulario, antes de enviar.** Pulso no despacha equipos y quien
reporta tiene que saberlo mientras decide, no después. Es la regla de producto de
[`32-direccion.md`](32-direccion.md): una plataforma que insinúa que enviará ayuda produce gente
esperando en vez de gente llamando.

## Lo que falta

Esto habilita el reporte, no cierra la prioridad. En [`33-backlog.md`](33-backlog.md):

- `P0-1` cola de rescate en Operaciones — hoy los rescates entran pero no hay dónde trabajarlos;
- `P0-2` que un rescate sobreviva a la falta de señal, que es justo donde peor anda la red;
- `P0-3` marcar «ya hay equipo aquí» desde el mapa público;
- `P0-4` que la gente en Cali sepa que el botón existe. Sin esto, lo demás es teatro.

## Migración

`024_rescue_reports.sql` — aplicada en producción el 16 de agosto de 2026.

Reemplaza dos restricciones nombradas por Postgres al crear la tabla (`community_reports_check` y
`community_reports_report_type_check`), verificadas contra la base real antes de aplicar. Los tres
campos nuevos tienen una restricción que los deja en `NULL` para cualquier tipo que no sea `rescate`:
sin ella acabarían llenándose desde ingestas externas con otro significado, y la cola ordenaría por
un campo que en la mitad de las filas quiere decir otra cosa.
