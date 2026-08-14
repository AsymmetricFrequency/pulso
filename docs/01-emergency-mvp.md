# MVP de emergencia

## Resultado P0

Dos brigadas deben poder descargar una misión, trabajar simultáneamente sin conexión, registrar visitas, casos, necesidades y evidencias, recuperar conectividad y sincronizar sin perder información. El centro de operaciones debe observar qué territorio fue cubierto y qué permanece sin verificar.

## Capacidades incluidas

- Crear una emergencia.
- Importar límites territoriales oficiales.
- Dibujar zonas operativas.
- Registrar organizaciones, equipos y actores.
- Asignar misiones a brigadas.
- Descargar el paquete mínimo para trabajo offline.
- Registrar visitas, casos, evaluaciones y necesidades.
- Capturar fotografía, hora, ubicación y precisión.
- Sincronizar operaciones de forma idempotente.
- Revisar conflictos y posibles duplicados.
- Mostrar mapas privados y agregados públicos.

## Fuera del P0

- Donaciones monetarias y desembolsos.
- Smart contracts o tokens.
- Blockchain como base de datos.
- Decisiones automáticas sobre elegibilidad.
- Aplicaciones móviles nativas separadas.
- Integraciones gubernamentales profundas.

## Estados de cobertura

- `unknown`: no existe evidencia suficiente.
- `remote_report`: existe un reporte sin visita confirmada.
- `assigned`: hay una misión asignada.
- `partial`: visita incompleta.
- `visited`: visita terminada según el objetivo definido.
- `inaccessible`: brigada no pudo acceder.
- `revisit_required`: requiere nueva visita.
- `closed`: cobertura revisada y cerrada por un coordinador.

Una zona sin reportes nunca debe mostrarse como zona sin daño.
