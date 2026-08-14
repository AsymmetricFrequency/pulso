# Donaciones de materiales de construcción

## Principio contable

Una donación atraviesa estados distintos que no deben mezclarse:

```text
Oferta → compromiso → recepción → inspección → disponible
       → reserva → despacho → entrega aceptada → instalación verificada
```

- **Ofrecido** expresa intención; no es inventario.
- **Comprometido** tiene donante, cantidad y fecha esperada; no es inventario.
- **Recibido** llegó físicamente, pero puede estar pendiente de inspección.
- **Aceptado** cumple cantidad, identidad y condición mínima.
- **Disponible** está aceptado y no reservado.
- **Entregado** fue aceptado por el receptor en destino.
- **Instalado** fue asociado a una obra y cuenta con evidencia o certificación.

Los tableros nunca sumarán estas cifras como si representaran lo mismo.

## Unidad original y unidad canónica

Cada registro conserva simultáneamente:

```text
cantidad original + unidad original + presentación
cantidad canónica + unidad canónica
método de conversión + fuente + versión + incertidumbre
```

PULSO VIDA usa unidades del Sistema Internacional como referencia. No se obliga a los brigadistas a introducir conversiones manuales: seleccionan la presentación observada y el catálogo aprobado realiza la conversión.

## Dimensiones admitidas

| Dimensión | Unidad canónica | Ejemplos de captura |
|---|---|---|
| Conteo | `piece` | bloque, teja, lámina, sanitario |
| Masa | `kg` | cemento, acero, clavos, agregados pesados |
| Longitud | `m` | tubería, cable, perfil, madera lineal |
| Área | `m²` | membrana, malla, revestimiento |
| Volumen | `m³` | arena, grava, concreto, madera dimensionada |
| Líquido | `L` y conversión documentada a `m³` | pintura, sellador, combustible |
| Tiempo de activo | `h` | mezcladora, retroexcavadora, generador |
| Energía | `kWh` | suministro temporal de energía |

Nunca se suman dimensiones diferentes. El valor monetario tampoco se usa para ocultar diferencias físicas.

## Reglas por familia

### Cemento y morteros

- Captura: número de sacos, peso neto por saco y masa total en `kg`.
- Especificación: fabricante, producto, lote, fecha de fabricación, condición del empaque y almacenamiento.
- Sacos húmedos, abiertos o endurecidos se ponen en cuarentena; no se cuentan como disponibles.

### Acero de refuerzo y perfiles

- Captura: piezas, longitud, diámetro o sección, grado, lote y fabricante.
- La masa puede derivarse únicamente mediante una tabla técnica versionada o certificado del fabricante.
- Diámetros, grados o perfiles diferentes no son equivalentes aunque tengan la misma masa.

### Arena, grava y otros agregados

- Medición preferida: masa en báscula calibrada (`kg` o `t`, normalizada a `kg`).
- Puede recibirse volumen en `m³`, conservando método, densidad usada, humedad y margen de incertidumbre.
- No convertir volumen a masa con una densidad genérica silenciosa.

### Bloques, ladrillos y unidades de mampostería

- Captura: piezas aceptadas y rechazadas.
- Especificación: dimensiones, tipo, resistencia declarada, fabricante/lote y porcentaje de rotura inspeccionado.
- La cobertura estimada se calcula aparte; no sustituye el conteo físico.

### Madera

- Captura: piezas, largo, ancho y espesor; volumen derivado en `m³`.
- Especificación: especie o clase, grado, tratamiento, humedad y defectos.
- Piezas de secciones o grados distintos permanecen en lotes diferentes.

### Cubiertas y láminas

- Captura: piezas, dimensiones, espesor/calibre y área bruta.
- La **cobertura efectiva** se guarda separadamente porque depende de traslapos, orientación y especificación del fabricante.

### Concreto premezclado

- Captura: `m³` por remisión y lote.
- Especificación: diseño de mezcla, resistencia declarada, hora de despacho/recepción y documentos de control.
- Su aceptación estructural requiere el procedimiento y profesional definidos por la jurisdicción.

### Pinturas, adhesivos y selladores

- Captura: recipientes, contenido neto y litros totales.
- Rendimiento se expresa como rango condicionado por sustrato, preparación y número de capas; no como equivalencia garantizada.

### Equipos y herramientas

No se modelan como consumibles. Cada activo reutilizable puede tener identificador individual, propietario, custodio, condición, ubicación y horas de uso.

## Catálogo de materiales

`material_catalog_item` define:

- código interno y, cuando exista, identificador comercial;
- nombre multilingüe y familia;
- dimensión y unidad canónica;
- presentaciones aceptadas;
- esquema de especificaciones obligatorio;
- si admite mezcla entre lotes;
- riesgo y nivel de trazabilidad requerido;
- si puede tener uso estructural;
- reglas de sustitución aprobadas y versionadas.

Materiales de uso estructural o alto riesgo se rastrean por lote o instancia. Elementos de bajo riesgo pueden rastrearse por clase, de acuerdo con el costo y la precisión necesarios.

## Lotes y calidad

Cada `material_lot` mantiene:

- material y especificación exacta;
- donante y organización receptora;
- fabricante, lote comercial y procedencia cuando existan;
- cantidad y presentación declaradas;
- cantidad medida al recibir;
- cantidades aceptada, rechazada y en cuarentena;
- documentos, fotografías y resultados de inspección;
- ubicación, custodio y restricciones;
- fecha de vencimiento o vida útil cuando corresponda.

Una inspección nunca modifica la cantidad declarada: produce una observación nueva y explica la diferencia.

## Libro de inventario

El inventario se deriva de movimientos append-only:

```text
receipt | accept | quarantine | release | reject
reserve | unreserve | transfer_out | transfer_in
dispatch | delivery_accept | return | install
damage | loss | correction
```

Cada movimiento incluye lote, cantidad canónica, unidad, origen, destino, actor, fecha de ocurrencia, evidencia, motivo e idempotency key.

Las correcciones compensan movimientos anteriores; no se reescribe el historial.

## Cálculos operacionales

```text
on_hand = aceptado + transferencias_entrada + devoluciones
          - despachos - transferencias_salida - daños - pérdidas ± correcciones

available = on_hand - reservado - cuarentena

in_transit = despachado - entrega_aceptada - devolución_en_tránsito

fulfilled = entrega_aceptada / cantidad_requerida_compatible

installed = cantidad vinculada a eventos de instalación verificados
```

Los cálculos se realizan por material y especificación compatible. No se agregan simplemente “toneladas de materiales” para medir satisfacción de una necesidad.

## De necesidad a obra

Una necesidad material se expresa mediante una línea de cantidades:

```text
material requerido
especificación mínima
cantidad y unidad
tolerancia
sustituciones permitidas
fecha y lugar de necesidad
responsable técnico
```

La asignación reserva lotes compatibles. La entrega requiere confirmación de origen y destino. La instalación consume la asignación y la vincula al `Recovery Passport` del activo reconstruido.

## Cobertura estimada

Preguntas como “¿para cuántas viviendas alcanza?” no se responden dividiendo por un promedio global. Se usa una **lista de cantidades o Bill of Quantities versionada** para una solución concreta.

```text
capacidad estimada = mínimo por componente(
  cantidad compatible disponible / cantidad requerida por solución
)
```

La estimación registra diseño, versión, desperdicio previsto, ubicación, responsable técnico y supuestos. Se muestra como rango cuando exista incertidumbre.

## Valoración

El valor físico y el valor financiero son dimensiones separadas. `valuation_snapshot` guarda moneda, valor unitario, fecha, fuente y ubicación de mercado. Sirve para transparencia y seguros; no determina equivalencia técnica ni avance de obra.

## Prevención de fraude y pérdidas

- Código QR por lote o unidad logística.
- Recepción con doble confirmación cuando el riesgo lo exija.
- Fotografías, documento de transporte y medición del instrumento.
- Identificación de báscula o instrumento y estado de calibración.
- Separación de funciones entre recepción, inspección y ajuste.
- Alertas por diferencias, movimientos retroactivos, rutas imposibles y ajustes repetidos.
- Confirmación del receptor en entrega.
- Conciliación periódica entre existencia calculada y conteo físico.
- Ninguna persona aprueba su propio ajuste de alto impacto.

## Seguridad estructural

PULSO VIDA registra información y evidencia; no declara por sí mismo que un material sea apto para una estructura. Los usos estructurales requieren especificaciones, inspecciones y profesionales conforme a la norma vigente en la jurisdicción. Para Colombia debe registrarse la versión y acto aplicable del Reglamento de Construcción Sismorresistente y cualquier exigencia local.

## Referencias de diseño

- BIPM, Sistema Internacional de Unidades: https://www.bipm.org/en/publications/si-brochure
- GS1 Global Traceability Standard: https://www.gs1.org/standards/gs1-global-traceability-standard/current-standard
- UNHCR, Emergency Shelter Solutions and Standards: https://emergency.unhcr.org/emergency-assistance/settlement-and-shelter/guidance-shelter/emergency-shelter-solutions-and-standards
- MinVivienda, construcción sismorresistente: https://www.minvivienda.gov.co/viceministerio-de-vivienda/espacio-urbano-y-territorial
