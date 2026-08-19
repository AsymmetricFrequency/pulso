-- La retención de 90 días borraba la prueba de una entrega en disputa.
--
-- **Fallo de diseño propio, encontrado al contrastar con el artículo 11 del Decreto 1377.**
--
-- El artículo dice dos cosas, y yo solo había implementado la primera: los datos se suprimen una
-- vez cumplida la finalidad, **«no obstante lo anterior, los datos personales deberán ser
-- conservados cuando así se requiera para el cumplimiento de una obligación legal o contractual»**.
--
-- El caso concreto: una familia dice el día 89 que una entrega registrada a su nombre nunca le
-- llegó. El día 90 el borrado automático se lleva su nombre y su teléfono, y la disputa queda sin
-- nadie a quien preguntarle. **El sistema borraría justo la evidencia de lo único que existe para
-- detectar.** No es un problema de privacidad: es lo contrario, es privacidad mal aplicada
-- destruyendo un derecho de la misma persona.
--
-- La corrección no es alargar la retención para todos —eso sería conservar de más a quien no lo
-- necesita— sino **pausarla mientras haya algo abierto que dependa de ese dato**.
CREATE OR REPLACE FUNCTION pulso_redact_expired_registrations(retention interval DEFAULT '90 days')
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE household_self_registrations r SET
    contact_name_encrypted = NULL,
    contact_phone_encrypted = NULL,
    document_encrypted = NULL,
    identity_fingerprint = NULL,
    location = NULL,
    redacted_at = now(),
    updated_at = now()
  WHERE r.redacted_at IS NULL
    AND r.created_at < now() - retention
    AND (r.contact_name_encrypted IS NOT NULL
      OR r.contact_phone_encrypted IS NOT NULL
      OR r.document_encrypted IS NOT NULL)
    -- Una entrega que la familia desmintió se queda mientras no se resuelva. Es una obligación de
    -- conservación del art. 11, y además es lo que protege a esa misma familia: sin su contacto,
    -- nadie puede llamarla para verificar lo que denunció.
    AND NOT EXISTS (
      SELECT 1 FROM household_aid_deliveries d
      WHERE d.registration_id = r.id AND d.confirmation = 'rechazada'
    )
    -- Y una revisión de auditoría todavía sin firmar. Borrar el dato en medio de una revisión
    -- dejaría a quien audita decidiendo a ciegas sobre una familia que ya no puede contestar.
    AND NOT EXISTS (
      SELECT 1 FROM registration_validations v
      WHERE v.registration_id = r.id
        AND v.signal = 'revisar'
        AND NOT EXISTS (
          SELECT 1 FROM registration_reviews rr WHERE rr.registration_id = r.id
        )
    );
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMENT ON FUNCTION pulso_redact_expired_registrations IS
  'Borra los datos personales pasados los 90 días y conserva los conteos. **Se pausa** mientras '
  'haya una entrega desmentida sin resolver o una revisión de auditoría sin firmar: el art. 11 del '
  'Decreto 1377 obliga a conservar cuando lo exige una obligación legal, y borrar ahí destruiría '
  'la prueba de una denuncia hecha por la propia persona a la que se pretende proteger.';

-- Para que no se conserve indefinidamente por olvido: cuánto lleva cada retención pausada.
CREATE VIEW retention_on_hold AS
SELECT
  r.public_code,
  r.created_at,
  now() - r.created_at AS antiguedad,
  EXISTS (
    SELECT 1 FROM household_aid_deliveries d
    WHERE d.registration_id = r.id AND d.confirmation = 'rechazada'
  ) AS entrega_desmentida,
  EXISTS (
    SELECT 1 FROM registration_validations v
    WHERE v.registration_id = r.id AND v.signal = 'revisar'
      AND NOT EXISTS (SELECT 1 FROM registration_reviews rr WHERE rr.registration_id = r.id)
  ) AS auditoria_pendiente
FROM household_self_registrations r
WHERE r.redacted_at IS NULL
  AND r.created_at < now() - interval '90 days';

COMMENT ON VIEW retention_on_hold IS
  'Registros que pasaron los 90 días y siguen con datos personales porque algo está abierto. Se '
  'mira para que «pausada» no se convierta en «indefinida»: cada fila aquí es una razón que hay '
  'que cerrar, no una excepción permanente.';
