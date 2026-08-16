-- Los teléfonos de terceros se tapan en la base, no en el código.
--
-- Primero se intentó en el esquema Zod por el que valida la ingesta externa, que parecía el único
-- punto por el que pasan todas las fuentes. No lo era: los seis importadores del worker escriben su
-- propio `INSERT INTO community_reports` y ninguno pasa por ahí. La prueba fue inmediata —al volver
-- a correr la ingesta de `terremotocolombia`, los 27 móviles reaparecieron tapados hacía diez
-- minutos.
--
-- Un disparador es el único sitio que ningún camino puede rodear: da igual qué importador, qué ruta
-- de la API o qué `psql` a mano escriba la fila. La invariante 1 del proyecto —ningún dato personal
-- de terceros entra a la base— merece esa garantía y no una convención que cada autor nuevo tiene
-- que recordar.
--
-- Qué NO se toca: cifras de dinero y cantidades. Enmascarar toda corrida larga de dígitos destruiría
-- información que sirve para decidir sin ganar privacidad — el riesgo está en el número al que se
-- puede llamar, no en «2.500.000 pesos».
CREATE OR REPLACE FUNCTION redact_third_party_contacts(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN input IS NULL THEN NULL ELSE
    regexp_replace(
      -- 2) Móvil colombiano suelto: 3 y nueve dígitos más, con separadores opcionales. Los grupos
      --    de alrededor se conservan para no comerse el carácter vecino.
      regexp_replace(
        -- 1) Cualquier número largo anunciado por una palabra de contacto. Cubre los fijos y los
        --    escritos de forma rara, que el patrón de móvil no atrapa.
        input,
        '(contacto|celular|cel|whatsapp|wpp|tel[eé]fono|tel|llamar|comunicarse)([[:space:]:.-]{0,12})([0-9][0-9[:space:].-]{5,14}[0-9])',
        '\1\2(contacto omitido)',
        'gi'
      ),
      '(^|[^0-9])(3[0-9]{2}[ .-]?[0-9]{3}[ .-]?[0-9]{4})([^0-9]|$)',
      '\1(contacto omitido)\3',
      'g'
    )
  END
$$;

CREATE OR REPLACE FUNCTION community_reports_redact_contacts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Solo el texto libre importado y la nota de revisión. El `title` de las fuentes externas es corto
  -- y estructurado; si algún día trae teléfonos, se añade aquí.
  NEW.description := redact_third_party_contacts(NEW.description);
  NEW.review_notes := redact_third_party_contacts(NEW.review_notes);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS community_reports_redact_contacts_trg ON community_reports;
CREATE TRIGGER community_reports_redact_contacts_trg
  BEFORE INSERT OR UPDATE OF description, review_notes ON community_reports
  FOR EACH ROW EXECUTE FUNCTION community_reports_redact_contacts();

-- Y se limpia lo que ya está dentro, incluido lo que la reingesta volvió a meter.
UPDATE community_reports
   SET description = redact_third_party_contacts(description)
 WHERE description IS NOT NULL
   AND description <> redact_third_party_contacts(description);
