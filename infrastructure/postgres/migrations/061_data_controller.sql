-- El responsable del tratamiento, como dato y no como texto suelto.
--
-- La Ley 1581 exige identificar al **responsable del tratamiento**: quién responde por esos datos,
-- con nombre, domicilio, correo y teléfono (art. 13.1 del Decreto 1377). Hoy eso está escrito a mano
-- en tres sitios —el cuerpo del consentimiento, la página de política y el formulario— y va a
-- cambiar: los datos se van a canalizar por una fundación constituida que todavía no está
-- registrada aquí.
--
-- Escrito a mano en tres sitios, ese cambio significa buscar y reemplazar en tres archivos y confiar
-- en no haber olvidado ninguno. Como fila, es una fila nueva.
--
-- **Y hay una razón legal, no solo de mantenimiento:** cambiar el responsable es un cambio
-- sustancial de la política, y el artículo 5 del Decreto 1377 obliga a informarlo al titular. Si el
-- responsable vive en una fila versionada, se puede saber exactamente qué registros consintieron
-- ante quién — y a quién hay que volver a preguntarle.
CREATE TABLE data_controllers (
  id uuid PRIMARY KEY,
  version integer NOT NULL CHECK (version > 0),

  -- Razón social. Mientras no haya fundación, es el proyecto, y se dice que es provisional.
  legal_name text NOT NULL CHECK (char_length(btrim(legal_name)) BETWEEN 3 AND 200),
  -- NIT o documento. Nulo mientras la figura jurídica no exista: **nulo es más honesto que un
  -- número inventado**, y una política que declara un NIT falso es peor que una sin NIT.
  tax_id text CHECK (tax_id IS NULL OR char_length(btrim(tax_id)) BETWEEN 5 AND 30),
  legal_form text NOT NULL CHECK (legal_form IN (
    'proyecto_voluntario', 'fundacion', 'corporacion', 'entidad_publica', 'otra'
  )),

  address text,
  city text,
  country text NOT NULL DEFAULT 'Colombia',
  email text NOT NULL CHECK (email LIKE '%@%'),
  phone text,
  -- Quién responde por las peticiones del titular (art. 13.4): una persona o un área, no un buzón
  -- anónimo. Puede ser un cargo — «Dirección de datos» — pero tiene que existir.
  privacy_contact text NOT NULL CHECK (char_length(btrim(privacy_contact)) BETWEEN 3 AND 200),

  -- Si esta figura ya está constituida legalmente. Mientras sea `false`, la página de política lo
  -- dice en vez de aparentar una formalidad que no existe.
  legally_constituted boolean NOT NULL DEFAULT false,

  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version)
);

COMMENT ON TABLE data_controllers IS
  'Responsable del tratamiento, versionado. Cambiarlo es un cambio sustancial de la política que '
  'hay que informar al titular (art. 5, Decreto 1377); versionarlo permite saber qué registros '
  'consintieron ante quién.';

-- El consentimiento apunta al responsable ante el que se dio.
--
-- Sin esto, el día que entre la fundación no se podría responder «¿esta familia autorizó a Pulso o
-- a la fundación?» — y esa es exactamente la pregunta que hay que poder responder.
ALTER TABLE consent_texts
  ADD COLUMN data_controller_id uuid REFERENCES data_controllers(id);

-- La versión provisional. Existe para que el sistema funcione hoy, y **se marca como provisional**
-- en vez de aparentar una constitución que no hay.
INSERT INTO data_controllers (
  id, version, legal_name, tax_id, legal_form, city, country, email, phone,
  privacy_contact, legally_constituted
) VALUES (
  '00000000-0000-4000-9000-000000000001', 1,
  'Pulso — proyecto voluntario de respuesta a la emergencia',
  NULL, 'proyecto_voluntario', NULL, 'Colombia', 'vortexlabcol@gmail.com', NULL,
  'Equipo responsable del proyecto Pulso', false
);

UPDATE consent_texts
  SET data_controller_id = '00000000-0000-4000-9000-000000000001'
  WHERE data_controller_id IS NULL;

-- ## Cómo se entrega a la fundación
--
-- Cuando lleguen sus datos, esto es **una fila**, no un despliegue:
--
--   INSERT INTO data_controllers (
--     id, version, legal_name, tax_id, legal_form, address, city, email, phone,
--     privacy_contact, legally_constituted
--   ) VALUES (
--     gen_random_uuid(), 2, 'Fundación …', '900.xxx.xxx-x', 'fundacion',
--     'Calle … ', 'Cali', 'datos@fundacion.org', '+57 …',
--     'Nombre del oficial de protección de datos', true
--   );
--
-- Y detrás, **una versión 3 del texto de consentimiento** que la nombre. Los registros anteriores
-- siguen apuntando a la versión que firmaron: no se les puede cambiar el responsable por debajo.
-- A quienes ya estén registrados hay que informarles del cambio — la consulta que dice a quiénes es
-- ésta, y por eso el enlace existe.
CREATE VIEW registrations_by_controller AS
SELECT
  dc.version AS controller_version,
  dc.legal_name AS controller,
  ct.version AS consent_version,
  count(r.id) AS registrations,
  count(r.id) FILTER (WHERE r.contact_phone_encrypted IS NOT NULL) AS with_contact
FROM household_self_registrations r
JOIN consent_texts ct ON ct.id = r.consent_text_id
LEFT JOIN data_controllers dc ON dc.id = ct.data_controller_id
WHERE r.redacted_at IS NULL
GROUP BY dc.version, dc.legal_name, ct.version
ORDER BY ct.version;

COMMENT ON VIEW registrations_by_controller IS
  'Cuántos registros consintieron ante qué responsable y con qué versión del texto. Es la consulta '
  'que dice a quién hay que informarle cuando el responsable cambie.';
