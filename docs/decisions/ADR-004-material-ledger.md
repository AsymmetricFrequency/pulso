# ADR-004: Inventario físico derivado de movimientos

- Estado: aceptada
- Fecha: 2026-08-14

## Decisión

Las existencias de materiales se calcularán desde un libro append-only de movimientos por lote, ubicación y cantidad canónica. Ofertas, compromisos, recepción, aceptación, entrega e instalación serán conceptos separados.

## Razón

Un campo mutable `stock` oculta pérdidas, correcciones y diferencias entre actores. Mezclar materiales prometidos con inventario disponible produce decisiones falsas y facilita duplicidad o fraude.

## Consecuencia

- Las correcciones se hacen con movimientos compensatorios.
- Toda cantidad lleva unidad y especificación.
- Las reservas afectan disponibilidad, no existencia física.
- La entrega requiere aceptación del receptor.
- La instalación se registra como transformación vinculada a una obra.
- Las proyecciones de stock pueden reconstruirse desde el libro.

## Excepción

Se permiten cachés y proyecciones para lectura, pero nunca son la fuente primaria de verdad.
