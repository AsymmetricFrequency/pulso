# Resumen operacional por misión P0

## Alcance seguro

El primer tablero agregado se limita a la asignación de la sesión de campo. Una brigada no puede consultar datos de otras misiones ni de toda la emergencia.

La API `GET /v1/field-assessment-summary` deriva incidente y asignación desde el token de sesión. No recibe identificadores territoriales elegidos por el cliente.

## Indicadores

- Total de reportes.
- Hogares y personas aproximadas.
- Reportes urgentes o inmediatos.
- Distribución por gravedad y urgencia.
- Daños principales.
- Necesidades principales.
- Resumen de presión por zona dentro del alcance autorizado.

Los resultados son agregados operacionales y no contienen notas, fotografías ni identificadores personales.

## Experiencia

El resumen aparece dentro de la visita después del primer hallazgo sincronizado. Se actualiza automáticamente tras cada nuevo reporte y mantiene cuatro métricas legibles en móvil.

## Siguiente evolución

El tablero de coordinación para toda la emergencia requiere primero autenticación específica de operaciones. Solo roles `coordinator`, `auditor` e `incident_admin` podrán acceder a agregados entre misiones. No se reutilizará una llave administrativa en el navegador.
