# ADR-003: Blockchain fuera de la ruta crítica del MVP

- Estado: aceptada
- Fecha: 2026-08-13

## Decisión

PostgreSQL será la fuente de verdad del MVP. La auditoría utilizará eventos encadenados por hashes. No se almacenarán personas, casos ni evidencias directamente en una blockchain.

## Razón

El problema inmediato es cobertura, calidad de datos, evidencia y coordinación. Introducir una red distribuida no resuelve la captura offline, la validación humana ni la privacidad.

## Consecuencia

En una fase posterior podrá publicarse una raíz criptográfica periódica en Solana o incorporarse lógica financiera en USDC, sin rediseñar el modelo operacional. La selección de red se documenta en ADR-007 y no cambia que blockchain permanezca fuera de la ruta crítica.
