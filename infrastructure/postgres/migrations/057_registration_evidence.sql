-- Evidencia del daño, y la relación con la vivienda. Cierra el flujo `censar → validar → auditar`.
--
-- ## La decisión que ordena todo esto
--
-- **La propiedad es la puerta equivocada.** La mayoría de damnificados en Colombia no son
-- propietarios: son arrendatarios, ocupantes, o viven en asentamientos informales. En el Chocó hay
-- territorios colectivos de consejos comunitarios que no tienen matrícula inmobiliaria, y el Chocó
-- es buena parte de los 43 municipios donde no ha ido nadie a censar. Un arrendatario cuya casa
-- arrendada se cayó está afectado exactamente igual.
--
-- Exigir prueba de propiedad reduciría el fraude y dejaría fuera justo a la población con menos
-- atención — que es lo contrario de para qué existe este registro.
--
-- Por eso: **la foto del daño es la vía universal** —sirve para propietario, arrendatario y ocupante
-- por igual— y la referencia catastral es un refuerzo opcional que sube el nivel de evidencia, no un
-- requisito que lo condiciona.
--
-- ## Lo que se puede comprobar solo, y lo que no
--
-- Verificado el 18/08: el certificado de tradición y libertad de la Superintendencia de Notariado y
-- Registro es **lo único que acredita quién es propietario**, cuesta entre 18.700 y 23.000 pesos por
-- consulta y **no tiene API pública**. Así que la propiedad no se puede verificar automáticamente y
-- este esquema no finge que sí: guarda la referencia, y quien la comprueba es una persona.
--
-- Lo que sí es automático y gratis: que el número predial exista y caiga en el municipio declarado.
-- Los catastros abiertos de Pereira, Dosquebradas, La Virginia y Valle del Cauca están en
-- datos.gov.co **sin nombres de propietarios** —solo predio, dirección, uso y áreas— así que ese
-- cruce no toca datos personales de nadie.

ALTER TABLE household_self_registrations
  -- Qué relación tiene con la vivienda. Cinco opciones y ninguna privilegiada: se pregunta para
  -- saber a quién le corresponde qué ayuda, no para decidir quién merece estar en la lista.
  ADD COLUMN dwelling_relation text CHECK (dwelling_relation IS NULL OR dwelling_relation IN (
    'propietario', 'arrendatario', 'ocupante', 'territorio_colectivo', 'otro'
  )),
  -- Referencia catastral o matrícula inmobiliaria, cifrada. Opcional siempre.
  ADD COLUMN property_reference_encrypted bytea,
  -- El municipio que declara la referencia catastral, si se pudo resolver contra un catastro
  -- abierto. Sirve para el cruce de coherencia sin guardar la referencia en claro.
  ADD COLUMN property_reference_municipality text;

COMMENT ON COLUMN household_self_registrations.dwelling_relation IS
  'Relación con la vivienda. No condiciona el registro: un arrendatario cuya casa se cayó está '
  'afectado igual que el dueño. Se pregunta para saber a quién le corresponde qué ayuda.';

-- ## Evidencia
--
-- Una foto de una vivienda destruida puede mostrar caras, la fachada, el número de la casa, y lleva
-- la coordenada GPS incrustada en los metadatos. Por eso: se le quitan los EXIF al subirla, **no se
-- publica nunca**, y solo la ve quien tenga rol de auditor — quedando registrado en `pii_access_log`
-- quién la miró y para qué.
CREATE TABLE registration_evidence (
  id uuid PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES household_self_registrations(id) ON DELETE CASCADE,

  kind text NOT NULL CHECK (kind IN ('foto_dano', 'documento_predial', 'otro')),

  -- Dónde está el archivo. Fuera del alcance público: no hay ruta que lo sirva sin sesión.
  storage_key text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 12 * 1024 * 1024),

  -- Hash del contenido. Detecta que la misma foto se subió en veinte registros distintos, que es la
  -- forma más barata de inflar un censo — y se detecta **sin mirar ninguna imagen**.
  content_hash text NOT NULL CHECK (char_length(content_hash) = 64),

  -- Que se hayan quitado los metadatos se registra, no se supone. Una foto sin esta marca es una
  -- foto que puede llevar la coordenada exacta de la casa de alguien.
  exif_stripped boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  -- Se borra con el registro, y también sola cuando la persona usa su código.
  redacted_at timestamptz
);

CREATE INDEX registration_evidence_registration_idx
  ON registration_evidence(registration_id, created_at DESC);

-- La misma imagen en muchos registros distintos. No es prueba de fraude —una vecina puede ayudar a
-- registrar a tres familias con la foto de la misma cuadra— pero por encima de cierto número
-- merece que alguien mire.
CREATE INDEX registration_evidence_hash_idx ON registration_evidence(content_hash);

COMMENT ON TABLE registration_evidence IS
  'Evidencia aportada por quien se registra. Nunca pública: solo la ve un auditor, y queda '
  'constancia de quién la miró. Los metadatos EXIF se eliminan al recibirla.';

-- ## El nivel de evidencia
--
-- Sube con lo que cada quien **pueda** aportar, y arranca en un nivel que ya es útil. Nadie empieza
-- en cero por no tener papeles: estar en un municipio que sacudió fuerte ya es evidencia.
CREATE OR REPLACE FUNCTION pulso_evidence_level(target uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    -- Alguien identificado lo revisó y lo respaldó. Es el techo, y solo lo pone una persona.
    WHEN EXISTS (
      SELECT 1 FROM registration_reviews rr
      WHERE rr.registration_id = target AND rr.outcome = 'respaldado'
    ) THEN 'auditado'
    -- Foto del daño más referencia de la vivienda: lo más que puede aportar quien se registra solo.
    WHEN EXISTS (
      SELECT 1 FROM registration_evidence e
      WHERE e.registration_id = target AND e.kind = 'foto_dano' AND e.redacted_at IS NULL
    ) AND EXISTS (
      SELECT 1 FROM household_self_registrations h
      WHERE h.id = target AND h.property_reference_encrypted IS NOT NULL
    ) THEN 'reforzada'
    WHEN EXISTS (
      SELECT 1 FROM registration_evidence e
      WHERE e.registration_id = target AND e.kind = 'foto_dano' AND e.redacted_at IS NULL
    ) THEN 'con_foto'
    -- Sin foto pero coherente con la sacudida y los daños ya reportados por otras fuentes.
    WHEN EXISTS (
      SELECT 1 FROM registration_validations v
      WHERE v.registration_id = target AND v.signal = 'coherente'
    ) THEN 'contrastada'
    ELSE 'declarada'
  END;
$$;

COMMENT ON FUNCTION pulso_evidence_level IS
  'Nivel de evidencia de un registro. Sube con lo que cada quien PUEDA aportar y arranca en un '
  'nivel útil: nadie empieza en cero por no tener papeles. El techo lo pone una persona, no el '
  'sistema.';

-- Y el borrado a petición se lleva la evidencia con él. Sin esto, alguien podría pedir el borrado
-- de sus datos y su foto se quedaría — que es exactamente la clase de promesa a medias que no
-- podemos permitirnos.
CREATE OR REPLACE FUNCTION pulso_redact_registration_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.redacted_at IS NOT NULL AND OLD.redacted_at IS NULL THEN
    UPDATE registration_evidence
      SET redacted_at = NEW.redacted_at
      WHERE registration_id = NEW.id AND redacted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER household_self_registrations_redact_evidence
  AFTER UPDATE ON household_self_registrations
  FOR EACH ROW
  EXECUTE FUNCTION pulso_redact_registration_evidence();
