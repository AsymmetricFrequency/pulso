# Evidencia fotográfica offline P0

## Objetivo

Adjuntar una fotografía verificable a una evaluación rápida sin bloquear el trabajo cuando no existe conectividad.

## Flujo de campo

1. La brigada guarda primero el reporte de daño o necesidad.
2. Puede abrir la cámara o seleccionar una imagen existente.
3. El navegador corrige el tamaño a un máximo de 1280 píxeles y genera JPEG con calidad operativa.
4. Calcula SHA-256 sobre los bytes comprimidos.
5. Guarda imagen, metadatos y huella en IndexedDB.
6. Si hay conexión, la envía; si no, la cola se procesa después de sincronizar el reporte asociado.

La foto es opcional. Nunca bloquea el registro del hallazgo.

## Integridad y límites

- Formatos admitidos: JPEG, PNG y WebP en la API; el cliente normaliza a JPEG.
- Tamaño máximo aceptado: 5 MiB.
- La API vuelve a calcular SHA-256 y compara tamaño y firma básica del archivo.
- Una discrepancia produce cuarentena lógica mediante rechazo con `evidence_integrity_error`.
- La respuesta API solo contiene metadatos; nunca devuelve la imagen como base64.
- La idempotencia usa emergencia y `clientMutationId`.

## Asociación verificable

La evidencia referencia `assessmentClientMutationId`. El servidor resuelve la evaluación real dentro del mismo incidente y asignación de la sesión. Incidente, zona, actor y equipo nunca se aceptan desde el formulario.

## Persistencia P0

La migración `009_field_evidence.sql` almacena contenido en `bytea` para mantener un despliegue de emergencia autocontenido. Para producción con volumen, el contenido debe migrar a almacenamiento de objetos privado; PostgreSQL conservará metadatos, hash, asociación y estado.

Cada evidencia almacenada genera `field_evidence.stored` en el outbox transaccional.

## Privacidad

- La interfaz recuerda no fotografiar documentos ni datos personales.
- La ubicación no se captura automáticamente.
- La cámara solo se abre por acción explícita de la persona usuaria.
- Retención, borrado y acceso público deben definirse antes de producción.
