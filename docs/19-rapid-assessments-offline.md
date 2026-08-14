# Evaluación rápida offline P0

## Objetivo

Permitir que una brigada registre daños y necesidades en menos de dos minutos, incluso sin conectividad, sin recopilar datos personales innecesarios.

## Captura mínima

- Tipos de daño observados.
- Gravedad: baja, media, alta o crítica.
- Tipos de necesidad.
- Urgencia: puede esperar, prioritaria, urgente o inmediata.
- Número aproximado de hogares y personas afectadas.
- Nota breve opcional.

El formulario no solicita nombre, documento, teléfono ni dirección exacta. El incidente, zona, equipo, asignación y actor se derivan de la sesión de misión; el cliente no puede elegirlos.

## Funcionamiento offline

1. El reporte recibe un `clientMutationId` único.
2. Se guarda primero en IndexedDB, antes de intentar enviarlo.
3. Si existe conexión se envía inmediatamente.
4. Si no existe conexión permanece en cola y se reintenta cuando el dispositivo vuelve a estar en línea.
5. La API y PostgreSQL son idempotentes por emergencia y `clientMutationId`, de modo que un reintento no crea duplicados.

## API

- `POST /v1/field-assessments`: registra un hallazgo usando una sesión de misión.
- `GET /v1/field-assessments`: lista los hallazgos de la asignación de la sesión actual.

Ambas rutas requieren `Authorization: Bearer <field-session>`. La API deriva todo el contexto territorial y de autoría desde esa sesión.

## Persistencia y eventos

La migración `008_rapid_assessments.sql` crea `rapid_assessments`, índices por asignación, zona y urgencia, y una restricción única contra duplicidad. Cada alta genera `rapid_assessment.recorded` en el outbox transaccional.

## Siguiente evolución

- Evidencia fotográfica con compresión y carga diferida.
- Ubicación aproximada con consentimiento explícito.
- Agrupación y revisión de posibles casos duplicados.
- Tablero operacional agregado por daño, necesidad y urgencia.
- Conversión de necesidades de materiales en cantidades, unidades y especificaciones del libro de materiales.
