-- El trigger tiene que **vaciar la imagen**, no solo marcarla.
--
-- Antes ponía `redacted_at` y dejaba el bytea donde estaba: la foto de la casa de alguien se
-- quedaba en la base después de que esa persona pidiera el borrado. La restricción que acaba de
-- entrar lo habría hecho fallar, que es justo para lo que sirve una invariante — pero el arreglo
-- correcto no es relajar la restricción, es borrar de verdad.
CREATE OR REPLACE FUNCTION pulso_redact_registration_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.redacted_at IS NOT NULL AND OLD.redacted_at IS NULL THEN
    UPDATE registration_evidence
      SET redacted_at = NEW.redacted_at,
          content = NULL,
          file_name = NULL
      WHERE registration_id = NEW.id AND redacted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION pulso_redact_registration_evidence IS
  'Cuando una familia usa su código para borrarse, su foto se vacía en la misma transacción. '
  'Marcarla sin vaciarla sería cumplir la promesa a medias.';
