-- Proteger los datos personales del censo comunitario.
--
-- Desde hoy la base guarda nombres, teléfonos y documentos de familias que acaban de perder su
-- casa. El cifrado de columna ya estaba; esto añade las tres cosas que faltaban y que no son
-- criptografía: **saber quién los miró, que no se queden para siempre, y que el sistema pueda
-- demostrar las dos cosas.**

-- ## 1. Quién miró un dato personal
--
-- Hoy nada descifra nada: el registro es de solo escritura y esa es la posición más segura posible.
-- `P1-6` va a crear la primera ruta que descifre un teléfono para que alguien llame, y **la tabla
-- tiene que existir antes que esa ruta**, no después. Un registro de acceso que se añade luego
-- siempre nace con un hueco: los accesos que hubo antes de ponerlo.
--
-- Esto no es contabilidad. Es lo que permite responder «¿quién consultó los datos de esta familia y
-- para qué?» — una pregunta que, cuando se hace, se hace en serio.
CREATE TABLE pii_access_log (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),

  -- Qué se miró. Se guarda la tabla y la fila, nunca el valor descifrado: un registro de accesos
  -- que copiara el dato al que da acceso sería otro sitio más del que se puede filtrar.
  subject_table text NOT NULL CHECK (subject_table IN ('household_self_registrations')),
  subject_id uuid NOT NULL,

  actor_id uuid NOT NULL REFERENCES actors(id),
  actor_role text NOT NULL,

  -- Qué campos se descifraron, para poder distinguir «vio el barrio» de «vio el teléfono».
  fields text[] NOT NULL CHECK (array_length(fields, 1) > 0),

  -- Para qué. Obligatorio y con largo mínimo, por la misma razón que el motivo de mover un punto:
  -- un registro que dice quién y no dice para qué deja sin responder lo único que se pregunta
  -- después.
  purpose text NOT NULL CHECK (char_length(btrim(purpose)) BETWEEN 8 AND 500),

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pii_access_log_subject_idx ON pii_access_log(subject_table, subject_id, created_at DESC);
CREATE INDEX pii_access_log_actor_idx ON pii_access_log(actor_id, created_at DESC);

COMMENT ON TABLE pii_access_log IS
  'Quién descifró qué dato personal, cuándo y para qué. Nunca guarda el valor descifrado.';

-- ## 2. Que no se queden para siempre
--
-- La Ley 1581 dice que los datos se conservan mientras sean necesarios para la finalidad que los
-- justificó. La finalidad aquí es concreta y **se agota**: decirle a una alcaldía que a este hogar
-- falta censarlo. Pasado un tiempo razonable, o esa información ya llegó y sirvió, o ya no va a
-- servir — y en los dos casos el nombre de la familia deja de tener razón de estar.
--
-- Noventa días desde el registro. No es una cifra sacada del aire: es más de lo que dura la fase de
-- respuesta y menos de lo que dura la reconstrucción, así que cubre el uso real sin convertirse en
-- un archivo permanente de damnificados, que es exactamente lo que no queremos ser.
--
-- **Borra los datos personales y conserva los conteos**, igual que el borrado a petición: la cifra
-- de hogares afectados de un municipio no puede bajar porque pasó el tiempo.
CREATE OR REPLACE FUNCTION pulso_redact_expired_registrations(retention interval DEFAULT '90 days')
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE household_self_registrations SET
    contact_name_encrypted = NULL,
    contact_phone_encrypted = NULL,
    document_encrypted = NULL,
    identity_fingerprint = NULL,
    location = NULL,
    redacted_at = now(),
    updated_at = now()
  WHERE redacted_at IS NULL
    AND created_at < now() - retention
    AND (contact_name_encrypted IS NOT NULL
      OR contact_phone_encrypted IS NOT NULL
      OR document_encrypted IS NOT NULL);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMENT ON FUNCTION pulso_redact_expired_registrations IS
  'Borra los datos personales de registros que superaron la retención y conserva sus conteos. '
  'La finalidad que justificó pedirlos se agota; la cifra agregada del municipio no.';

-- ## 3. Que el sistema pueda demostrarlo
--
-- La versión de la clave con la que se cifró cada fila. Sin esto, rotar la clave obliga a adivinar
-- qué filas están cifradas con cuál, y la rotación se vuelve imposible en la práctica — que es la
-- razón por la que casi nadie rota una clave nunca.
ALTER TABLE household_self_registrations
  ADD COLUMN key_version integer NOT NULL DEFAULT 1 CHECK (key_version > 0);

COMMENT ON COLUMN household_self_registrations.key_version IS
  'Con qué versión de clave se cifraron los campos de esta fila. Existe para que rotar la clave '
  'sea una operación posible y no una teoría.';
