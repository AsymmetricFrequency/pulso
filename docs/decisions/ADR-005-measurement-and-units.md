# ADR-005: Cantidad original, cantidad canónica y conversión trazable

- Estado: aceptada
- Fecha: 2026-08-14

## Decisión

Cada medición conserva la cantidad/unidad observada y una cantidad/unidad canónica. Toda conversión registra regla, versión, fuente, responsable e incertidumbre cuando aplique.

## Razón

Los materiales llegan como sacos, piezas, rollos, metros, litros, toneladas o metros cúbicos. Sobrescribir la captura original impide auditar conversiones y puede hacer parecer equivalentes materiales incompatibles.

## Consecuencia

- No se suman dimensiones diferentes.
- La compatibilidad depende de especificaciones, no solo de cantidad.
- Valor monetario y cobertura estimada son proyecciones separadas.
- Conversiones de volumen/masa o longitud/masa requieren información técnica validada.
- La interfaz presenta unidades familiares, mientras el núcleo conserva unidades canónicas.
