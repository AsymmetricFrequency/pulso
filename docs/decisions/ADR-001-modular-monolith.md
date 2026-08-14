# ADR-001: Monolito modular para el MVP

- Estado: aceptada
- Fecha: 2026-08-13

## Decisión

Construir una API modular, una base PostgreSQL/PostGIS y workers separados por proceso dentro de un único repositorio.

## Razón

Reduce el tiempo de entrega, mantiene transacciones consistentes y simplifica despliegue y observabilidad. Los límites de dominio y contratos permitirán extraer servicios cuando exista una necesidad medida.

## Consecuencia

No se crearán microservicios durante el P0 salvo que un requisito de seguridad o escala lo exija.
