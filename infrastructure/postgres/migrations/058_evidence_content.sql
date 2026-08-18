-- El contenido de la foto vive en la base, no en disco.
--
-- Es el patrón que ya usa `field_evidence` desde la migración 009, y aquí conviene por lo mismo:
-- la imagen hereda el cifrado del respaldo, los permisos de la base y el borrado transaccional. Un
-- archivo en disco se queda cuando la fila se va — y esa fila se va cuando una familia usa su
-- código para borrarse.
ALTER TABLE registration_evidence
  DROP COLUMN storage_key,
  ADD COLUMN content bytea,
  ADD COLUMN file_name text CHECK (file_name IS NULL OR char_length(file_name) BETWEEN 1 AND 180);

-- Sin contenido no hay evidencia; con `redacted_at` no puede quedar ninguno. La invariante va en la
-- base y no en el código por la misma razón que las demás: sobrevive al día que alguien escriba un
-- UPDATE a mano.
ALTER TABLE registration_evidence
  ADD CONSTRAINT registration_evidence_content_ck CHECK (
    (redacted_at IS NULL AND content IS NOT NULL)
    OR (redacted_at IS NOT NULL AND content IS NULL)
  );
