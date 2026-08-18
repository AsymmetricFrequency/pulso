-- Censo comunitario: un hogar afectado puede registrarse solo.
--
-- **Esto no es el Registro Único de Damnificados y no lo reemplaza.** El censo oficial lo diligencia
-- personal autorizado casa a casa; la Alcaldía de Cali advirtió expresamente que no existe censo por
-- QR, teléfono ni formulario digital, y eso se respeta literalmente: ninguna pantalla de este flujo
-- dice ni insinúa que registrarse aquí da derecho a una ayuda.
--
-- Lo que sí hace, y es la razón de existir:
--
-- La Defensoría del Pueblo advirtió el 13 de agosto que la falta de censo impide saber cuántos son.
-- Nosotros ya publicamos **44 municipios donde no ha ido nadie**. Lo que faltaba era el otro lado de
-- esa moneda: que un hogar de esos municipios pueda decir «aquí estamos y nadie ha venido». Con eso
-- se le puede entregar a una alcaldía una lista de hogares que declaran no haber sido censados, por
-- barrio, para que la brigada vaya. **El registro alimenta el censo oficial en vez de competir con
-- él** — esa es la única forma en que un registro paralelo es defendible.
--
-- ## Qué se guarda, y por qué tan poco
--
-- El diccionario del RUD del DANE tiene decenas de campos. Aquí hay ocho, porque cada campo extra
-- es una razón más para que alguien abandone el formulario a mitad y una responsabilidad más que
-- asumimos sobre datos que no somos autoridad para tratar. Lo que no sirva para que una brigada
-- llegue a una puerta, no se pide.

-- Texto de consentimiento versionado.
--
-- Va en su propia tabla y no en una constante del código porque la Ley 1581 exige poder demostrar
-- **a qué** consintió una persona, y el texto cambia. Guardar solo un booleano «aceptó» convierte
-- esa prueba en la palabra de quien programó el formulario ese día.
CREATE TABLE consent_texts (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  body text NOT NULL CHECK (char_length(body) BETWEEN 80 AND 4000),
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);

-- Hogar que se registra por su cuenta.
--
-- No toca `affected_households`, que es el expediente de operaciones y solo se llena bajo convenio.
-- Este es un canal distinto con una procedencia distinta, y mezclarlos haría imposible responder
-- después «¿esto lo dijo una brigada o lo escribió alguien en un teléfono?».
CREATE TABLE household_self_registrations (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),

  -- El código que la persona usa para volver a consultar o borrar lo suyo. Aleatorio y sin relación
  -- con su identidad: es lo único que le entregamos y lo único que necesita.
  public_code text NOT NULL,

  territory_id uuid REFERENCES territories(id),
  -- Barrio o vereda, en texto libre. Es lo que permite ordenar una lista para que una brigada
  -- camine una zona, y es el único dato de ubicación que se pide: **no se pide dirección exacta.**
  neighborhood text CHECK (neighborhood IS NULL OR char_length(btrim(neighborhood)) BETWEEN 2 AND 120),
  -- Punto aproximado, opcional, si la persona decide compartir ubicación. Se guarda con precisión
  -- reducida a propósito — ver `public_location_precision`.
  location geometry(Point, 4326),

  -- Cuántas personas viven en el hogar, y cuántas de ellas necesitan atención prioritaria. Dos
  -- números, no un listado nominal: para saber cuánta agua hace falta en una cuadra no se necesita
  -- saber cómo se llama cada quien.
  people_count integer NOT NULL CHECK (people_count BETWEEN 1 AND 40),
  children_count integer NOT NULL DEFAULT 0 CHECK (children_count >= 0),
  older_adults_count integer NOT NULL DEFAULT 0 CHECK (older_adults_count >= 0),
  -- Condiciones que cambian la prioridad de un albergue. Booleanos y no diagnósticos: «hay alguien
  -- con discapacidad» es lo que decide si esa familia necesita un sitio en planta baja; el detalle
  -- médico no es asunto nuestro.
  has_disability boolean NOT NULL DEFAULT false,
  has_pregnancy boolean NOT NULL DEFAULT false,
  has_chronic_illness boolean NOT NULL DEFAULT false,

  -- Estado de la vivienda según quien reporta. Es una declaración, no una evaluación estructural:
  -- eso lo hace un profesional y tiene su propio flujo.
  dwelling_status text NOT NULL CHECK (dwelling_status IN (
    'destruida', 'inhabitable', 'con_danos', 'sin_danos', 'no_sabe'
  )),
  -- Dónde está durmiendo el hogar ahora. Es la pregunta operativa: decide si hace falta un albergue
  -- esta noche o un subsidio de arriendo en dos semanas.
  sheltering_at text NOT NULL CHECK (sheltering_at IN (
    'vivienda', 'albergue', 'familiares', 'calle_o_carpa', 'otro'
  )),

  -- **La pregunta que justifica todo esto.** Si el hogar dice que no lo han censado, entra en la
  -- lista que se le entrega a la alcaldía.
  officially_censused text NOT NULL DEFAULT 'no_sabe'
    CHECK (officially_censused IN ('si', 'no', 'no_sabe')),

  -- Datos personales, cifrados con `apps/api/src/field-encryption.ts` (AES-256-GCM). Nunca salen
  -- por una ruta pública: las rutas públicas de este registro devuelven **solo agregados**.
  contact_name_encrypted bytea,
  contact_phone_encrypted bytea,
  -- Documento opcional a propósito. Una persona sin documento no puede quedar bloqueada — es
  -- requisito, no caso borde — y quien no quiera darlo debe poder registrarse igual.
  document_encrypted bytea,
  -- Huella HMAC con sal del incidente, para detectar que el mismo documento se registró dos veces
  -- sin tener que descifrar nada ni compararlo en claro.
  identity_fingerprint text,

  public_location_precision text NOT NULL DEFAULT 'neighborhood'
    CHECK (public_location_precision IN ('hidden', 'zone', 'neighborhood', 'approximate')),

  status text NOT NULL DEFAULT 'registrado' CHECK (status IN (
    'registrado', 'contactado', 'entregado_a_autoridad', 'duplicado', 'retirado'
  )),

  -- Consentimiento: a qué texto y cuándo. Sin esto no se puede insertar la fila.
  consent_text_id uuid NOT NULL REFERENCES consent_texts(id),
  consented_at timestamptz NOT NULL,

  source_ip_hash text,
  client_mutation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Cuándo la persona pidió borrar lo suyo. La fila se vacía de datos personales y se conserva el
  -- agregado: el conteo del municipio no puede bajar porque alguien ejerció su derecho, y el dato
  -- personal no puede quedarse porque lo pidió.
  redacted_at timestamptz,

  UNIQUE (incident_id, public_code),
  UNIQUE (incident_id, client_mutation_id),

  -- Los conteos parciales no pueden superar el total del hogar.
  CHECK (children_count + older_adults_count <= people_count),

  -- **Invariante, no validación:** una fila retirada no puede conservar datos personales. Si el
  -- borrado se hiciera solo en el código, el día que alguien escriba un `UPDATE` a mano se queda
  -- sin efecto y nadie se entera.
  CHECK (
    redacted_at IS NULL
    OR (contact_name_encrypted IS NULL AND contact_phone_encrypted IS NULL
        AND document_encrypted IS NULL AND identity_fingerprint IS NULL)
  )
);

CREATE INDEX household_self_registrations_incident_idx
  ON household_self_registrations(incident_id, status, created_at DESC);

-- El índice que sirve la lista que se le entrega a una alcaldía.
CREATE INDEX household_self_registrations_uncensused_idx
  ON household_self_registrations(incident_id, territory_id)
  WHERE officially_censused = 'no' AND status = 'registrado' AND redacted_at IS NULL;

CREATE INDEX household_self_registrations_location_gist
  ON household_self_registrations USING gist(location)
  WHERE location IS NOT NULL;

-- Una huella por incidente: el mismo documento no se registra dos veces sin que se sepa.
CREATE UNIQUE INDEX household_self_registrations_fingerprint_uidx
  ON household_self_registrations(incident_id, identity_fingerprint)
  WHERE identity_fingerprint IS NOT NULL;

COMMENT ON TABLE household_self_registrations IS
  'Censo comunitario de hogares afectados, con autoinscripción y consentimiento explícito. NO es el '
  'Registro Único de Damnificados y no da derecho a ninguna ayuda. Su valor operativo es la lista '
  'de hogares que declaran no haber sido censados, para entregarla a la autoridad competente.';

-- El texto al que consiente quien se registra. Se escribe una vez y se versiona; cambiarlo obliga a
-- insertar una versión nueva, nunca a editar esta fila, porque las filas que ya apuntan aquí son la
-- prueba de a qué consintió esa gente.
INSERT INTO consent_texts (id, slug, version, body) VALUES (
  gen_random_uuid(), 'censo-comunitario', 1,
  'Autorizo a Pulso a tratar los datos que entrego en este formulario con una única finalidad: '
  || 'entregarle a la alcaldía o a la autoridad de gestión del riesgo de mi municipio la '
  || 'información de que mi hogar resultó afectado y, si es el caso, que todavía no nos ha '
  || 'censado nadie, para que una brigada pueda venir. Entiendo que Pulso no es una autoridad, '
  || 'que registrarme aquí NO me inscribe en ninguna ayuda y NO me da derecho a recibirla, y que '
  || 'el censo oficial se hace de forma presencial. Entiendo que mi nombre, mi teléfono y mi '
  || 'documento se guardan cifrados, que nunca se publican, y que puedo consultar o pedir el '
  || 'borrado de mis datos en cualquier momento con el código que se me entrega al terminar. '
  || 'Este tratamiento se hace conforme a la Ley 1581 de 2012.'
);
