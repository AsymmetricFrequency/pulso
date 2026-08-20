-- Bandeja de posibles duplicados (P1-3).
--
-- Una familia aparece dos veces. Pasa siempre y no es mala fe: la mamá llena el formulario, al día
-- siguiente el hijo lo llena otra vez porque no sabe que ya está, y el barrio queda contado dos
-- veces en la lista que se le entrega a una alcaldía. Ese es el daño concreto — no un número feo en
-- un tablero, sino una brigada que va a dos puertas que son la misma mientras otra queda sin visita.
--
-- Lo que este archivo construye es **una bandeja, no un deduplicador**. La diferencia es toda la
-- tarea:
--
-- · La plataforma **empareja** y dice con qué señal emparejó.
-- · Una persona identificada **decide**, y firma con un motivo.
-- · Nada se fusiona, nada se borra: la fila que se descarta se marca `duplicado` y se queda ahí.
--
-- ## Lo que había que arreglar antes de poder emparejar nada
--
-- La señal más fuerte —el mismo documento— **no se podía observar**, porque el índice único
-- `household_self_registrations_fingerprint_uidx` rechazaba el segundo registro en el INSERT. Eso
-- tenía dos consecuencias, y las dos son malas:
--
-- 1. La API devolvía un 500 a una familia que solo estaba intentando registrarse. Sin explicación,
--    sin código, sin saber que ya estaban en la lista.
-- 2. Era **fusión automática disfrazada de restricción**: el sistema decidía solo que dos registros
--    eran el mismo hogar y descartaba uno, que es exactamente lo que este ticket dice que no se
--    puede hacer. Y podía equivocarse: un padre que registra su hogar y después registra el de su
--    madre —que no tiene documento— con su propia cédula, veía desaparecer el segundo hogar.
--
-- Así que el índice deja de ser único. La colisión no se rechaza: entra a la bandeja, donde una
-- persona mira si son el mismo hogar o dos hogares con un documento prestado.

-- ## 1. La huella del teléfono
--
-- El documento es opcional a propósito, así que en la práctica la señal que más va a servir es el
-- teléfono: es el dato que una familia sí da, porque es por donde espera que la llamen.
--
-- Va como HMAC con el mismo secreto que ya se usa para el documento, **no como texto**. La razón no
-- es simetría: es que permite descubrir que dos registros comparten teléfono **sin descifrar
-- ninguno de los dos**. La alternativa —descifrar todos los teléfonos para compararlos— pondría los
-- números en claro en memoria cada vez que corre el emparejador, para responder una pregunta que se
-- puede responder sin verlos.
--
-- Sin índice único, y esto es deliberado: dos hogares vecinos pueden dar el mismo teléfono porque
-- solo hay uno en la cuadra. Eso es un candidato para que alguien lo mire, no un motivo para
-- negarle el registro a nadie.
ALTER TABLE household_self_registrations
  ADD COLUMN IF NOT EXISTS phone_fingerprint text;

CREATE INDEX IF NOT EXISTS household_self_registrations_phone_fingerprint_idx
  ON household_self_registrations(incident_id, phone_fingerprint)
  WHERE phone_fingerprint IS NOT NULL;

COMMENT ON COLUMN household_self_registrations.phone_fingerprint IS
  'HMAC del teléfono con la sal del incidente. Existe para poder emparejar dos registros del mismo '
  'hogar sin descifrar ningún teléfono. No es único: dos vecinos pueden compartir un número.';

-- La invariante de borrado tiene que cubrir también esta huella. Sin esto, un registro retirado
-- conservaría un identificador derivado de un dato personal que la persona pidió borrar — que es
-- justo lo que la restricción original existe para impedir.
--
-- Esa restricción nació sin nombre propio, así que Postgres le puso uno automático. Se
-- localiza por su definición y no por ese nombre: apostar a que en producción se llame igual que
-- aquí es apostar a que las restricciones se crearon en el mismo orden, y si la apuesta sale mal el
-- `DROP ... IF EXISTS` no falla — se salta en silencio y deja la invariante vieja en pie.
DO $$
DECLARE
  old_name text;
BEGIN
  SELECT conname INTO old_name
  FROM pg_constraint
  WHERE conrelid = 'household_self_registrations'::regclass
    AND contype = 'c'
    AND conname <> 'household_self_registrations_redaction_leaves_nothing'
    AND pg_get_constraintdef(oid) LIKE '%redacted_at IS NULL%'
    AND pg_get_constraintdef(oid) LIKE '%identity_fingerprint IS NULL%';
  IF old_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE household_self_registrations DROP CONSTRAINT %I', old_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'household_self_registrations'::regclass
      AND conname = 'household_self_registrations_redaction_leaves_nothing'
  ) THEN
    ALTER TABLE household_self_registrations
      ADD CONSTRAINT household_self_registrations_redaction_leaves_nothing CHECK (
        redacted_at IS NULL
        OR (contact_name_encrypted IS NULL AND contact_phone_encrypted IS NULL
            AND document_encrypted IS NULL AND identity_fingerprint IS NULL
            AND phone_fingerprint IS NULL)
      );
  END IF;
END;
$$;

-- El índice único del documento se convierte en índice a secas. Ver el encabezado: rechazar el
-- segundo registro era decidir solo, y además rompía la página con un 500.
DROP INDEX IF EXISTS household_self_registrations_fingerprint_uidx;

CREATE INDEX IF NOT EXISTS household_self_registrations_fingerprint_idx
  ON household_self_registrations(incident_id, identity_fingerprint)
  WHERE identity_fingerprint IS NOT NULL;

-- ## 2. Normalizar el barrio sin instalar nada
--
-- «Siloé», «siloe» y «SILOE » son el mismo barrio escrito por tres personas distintas. `unaccent`
-- resolvería esto, pero instalar una extensión en producción exige superusuario y no se puede
-- verificar desde aquí; `translate` sobre las cinco vocales acentuadas del español cubre el caso
-- real y no añade una dependencia al despliegue.
CREATE OR REPLACE FUNCTION pulso_normalize_text(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
    btrim(regexp_replace(
      translate(lower(coalesce(value, '')), 'áéíóúüñ', 'aeiouun'),
      '\s+', ' ', 'g'
    )),
    ''
  );
$$;

-- ## 3. La bandeja
CREATE TABLE IF NOT EXISTS registration_duplicate_candidates (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),

  -- El par, siempre en el mismo orden (`a < b`). Sin eso la misma pareja entraría dos veces, una
  -- por cada dirección, y quien audita vería el mismo caso dos veces con los papeles cambiados.
  registration_a_id uuid NOT NULL REFERENCES household_self_registrations(id) ON DELETE CASCADE,
  registration_b_id uuid NOT NULL REFERENCES household_self_registrations(id) ON DELETE CASCADE,

  -- **Qué los emparejó.** Es lo que pide el criterio del ticket, y es lo único que convierte la
  -- bandeja en algo revisable: sin la señal, quien decide está aceptando la palabra de una consulta.
  signals text[] NOT NULL CHECK (
    array_length(signals, 1) >= 1
    AND signals <@ ARRAY['documento', 'telefono', 'barrio_y_tamano', 'ubicacion', 'conexion']
  ),

  /*
   * Cuánto pesa el emparejamiento. **No hay puntaje.**
   *
   * Un número entre 0 y 1 aquí sería inventado: no hay ningún conjunto etiquetado con el que
   * calibrarlo, y una cifra falsamente precisa hace que quien audita confíe en el tercer decimal en
   * vez de mirar el caso. Dos niveles con una regla escrita dicen la verdad de lo que sabemos.
   *
   * · `fuerte` — comparten documento o teléfono. Es un identificador, no una coincidencia.
   * · `media`  — mismo municipio, mismo barrio escrito igual, mismo número de personas, y además
   *              el mismo punto o la misma conexión.
   */
  strength text NOT NULL CHECK (strength IN ('fuerte', 'media')),

  -- Los valores que se miraron, para poder responder «¿por qué salió esto?» sin volver a correr el
  -- emparejador. Nunca lleva el teléfono ni el documento: lleva que coincidieron.
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,

  status text NOT NULL DEFAULT 'propuesto' CHECK (status IN (
    'propuesto',   -- esperando que alguien lo mire
    'confirmado',  -- una persona dijo que son el mismo hogar
    'descartado',  -- una persona dijo que no lo son, y no vuelve a proponerse
    'caducado'     -- uno de los dos se borró o se retiró; ya no hay nada que decidir
  )),

  -- Cuál de los dos se queda. **Lo elige la persona, no la fecha.** El registro más antiguo no es
  -- necesariamente el bueno: el segundo puede traer la foto del daño y el teléfono que sí contesta.
  keep_registration_id uuid REFERENCES household_self_registrations(id),

  resolved_by_actor_id uuid REFERENCES actors(id),
  resolved_at timestamptz,
  rationale text CHECK (rationale IS NULL OR char_length(btrim(rationale)) BETWEEN 10 AND 1000),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (registration_a_id < registration_b_id),
  UNIQUE (registration_a_id, registration_b_id),

  -- **Invariante, no validación.** Una decisión sin firma y sin motivo no se puede revisar después,
  -- que es para lo que existe la bandeja. Escrito aquí y no en el repositorio porque el día que
  -- alguien resuelva un par con un UPDATE a mano tiene que fallar igual.
  CHECK (
    status IN ('propuesto', 'caducado')
    OR (resolved_by_actor_id IS NOT NULL AND resolved_at IS NOT NULL AND rationale IS NOT NULL)
  ),
  -- El que se queda tiene que ser uno de los dos del par, y solo se elige al confirmar.
  CHECK (
    (status = 'confirmado' AND keep_registration_id IN (registration_a_id, registration_b_id))
    OR (status <> 'confirmado' AND keep_registration_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS registration_duplicate_candidates_open_idx
  ON registration_duplicate_candidates(incident_id, strength, created_at DESC)
  WHERE status = 'propuesto';

CREATE INDEX IF NOT EXISTS registration_duplicate_candidates_a_idx
  ON registration_duplicate_candidates(registration_a_id);
CREATE INDEX IF NOT EXISTS registration_duplicate_candidates_b_idx
  ON registration_duplicate_candidates(registration_b_id);

COMMENT ON TABLE registration_duplicate_candidates IS
  'Pares de registros que podrían ser el mismo hogar, con la señal que los emparejó. Propone; no '
  'fusiona. La decisión la toma una persona identificada y queda firmada con un motivo.';

-- El borrado por retención tiene que soltar la huella nueva igual que las otras. Si no se
-- actualizara, la restricción de arriba haría fallar el borrado de los noventa días — el trabajo se
-- caería en silencio y los datos personales se quedarían **por haber añadido una protección**.
--
-- Se reescribe entera partiendo de la versión de la migración 065, no de la 055: la 065 le añadió
-- las dos pausas del artículo 11 del Decreto 1377, y un `CREATE OR REPLACE` escrito sobre la
-- versión vieja se las llevaría por delante sin que nada falle.
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
    phone_fingerprint = NULL,
    location = NULL,
    redacted_at = now(),
    updated_at = now()
  WHERE r.redacted_at IS NULL
    AND r.created_at < now() - retention
    AND (r.contact_name_encrypted IS NOT NULL
      OR r.contact_phone_encrypted IS NOT NULL
      OR r.document_encrypted IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM household_aid_deliveries d
      WHERE d.registration_id = r.id AND d.confirmation = 'rechazada'
    )
    AND NOT EXISTS (
      SELECT 1 FROM registration_validations v
      WHERE v.registration_id = r.id
        AND v.signal = 'revisar'
        AND NOT EXISTS (
          SELECT 1 FROM registration_reviews rr WHERE rr.registration_id = r.id
        )
    )
    -- **Tercera pausa, nueva y por la misma razón que las dos anteriores.** Un par abierto en la
    -- bandeja es una decisión pendiente sobre este hogar, y la forma de resolverla suele ser
    -- llamar a los dos teléfonos para preguntar si son la misma familia. Borrar el contacto en
    -- medio deja a quien audita decidiendo a ciegas, y el par se queda abierto para siempre.
    --
    -- **Con tope de treinta días, y el tope es lo importante.** Una pausa sin límite convierte una
    -- bandeja desatendida en una retención indefinida: bastaría con que nadie abra la bandeja para
    -- que los datos de esas familias se queden guardados para siempre, sin que ninguna decisión lo
    -- haya justificado. Si en un mes nadie miró el par, no se va a resolver por seguir reteniendo
    -- el teléfono de alguien. Pasado el tope el borrado sigue, y el emparejador marca el par
    -- `caducado` en su siguiente pasada.
    AND NOT EXISTS (
      SELECT 1 FROM registration_duplicate_candidates c
      WHERE c.status = 'propuesto'
        AND c.created_at > now() - interval '30 days'
        AND r.id IN (c.registration_a_id, c.registration_b_id)
    );
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- ## 4. El emparejador
--
-- Corre sobre un incidente y deja la bandeja al día. Es idempotente: volver a correrlo no duplica
-- pares ni reabre lo que alguien ya resolvió.
CREATE OR REPLACE FUNCTION pulso_match_registrations(target_incident uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  proposed integer;
BEGIN
  -- Primero se cierra lo que ya no tiene sentido decidir: si una de las dos familias pidió borrar
  -- sus datos o retiró su registro, no hay par que resolver. Va antes de proponer para que un par
  -- caducado no vuelva a entrar en el mismo paso.
  UPDATE registration_duplicate_candidates c
  SET status = 'caducado', updated_at = now()
  WHERE c.incident_id = target_incident
    AND c.status = 'propuesto'
    AND EXISTS (
      SELECT 1 FROM household_self_registrations r
      WHERE r.id IN (c.registration_a_id, c.registration_b_id)
        AND (r.redacted_at IS NOT NULL OR r.status = 'retirado')
    );

  WITH vivos AS (
    SELECT id, incident_id, identity_fingerprint, phone_fingerprint, territory_id,
           pulso_normalize_text(neighborhood) AS barrio, people_count, location, source_ip_hash
    FROM household_self_registrations
    WHERE incident_id = target_incident
      AND redacted_at IS NULL
      AND status NOT IN ('retirado', 'duplicado')
  ),
  senales AS (
    SELECT a.id AS a_id, b.id AS b_id, 'documento'::text AS signal
    FROM vivos a JOIN vivos b
      ON b.id > a.id AND b.identity_fingerprint = a.identity_fingerprint
    WHERE a.identity_fingerprint IS NOT NULL

    UNION ALL
    SELECT a.id, b.id, 'telefono'
    FROM vivos a JOIN vivos b
      ON b.id > a.id AND b.phone_fingerprint = a.phone_fingerprint
    WHERE a.phone_fingerprint IS NOT NULL

    UNION ALL
    SELECT a.id, b.id, 'barrio_y_tamano'
    FROM vivos a JOIN vivos b
      ON b.id > a.id
     AND b.territory_id = a.territory_id
     AND b.barrio = a.barrio
     AND b.people_count = a.people_count
    WHERE a.territory_id IS NOT NULL AND a.barrio IS NOT NULL

    UNION ALL
    -- Ochenta metros. Es el orden de magnitud de una cuadra, y la ubicación que se guarda ya viene
    -- con precisión reducida a propósito, así que pedir menos sería fingir una exactitud que el
    -- dato no tiene.
    SELECT a.id, b.id, 'ubicacion'
    FROM vivos a JOIN vivos b
      ON b.id > a.id
     AND ST_DWithin(b.location::geography, a.location::geography, 80)
    WHERE a.location IS NOT NULL

    UNION ALL
    SELECT a.id, b.id, 'conexion'
    FROM vivos a JOIN vivos b
      ON b.id > a.id AND b.source_ip_hash = a.source_ip_hash
    WHERE a.source_ip_hash IS NOT NULL
  ),
  agrupadas AS (
    SELECT a_id, b_id, array_agg(DISTINCT signal ORDER BY signal) AS signals
    FROM senales GROUP BY a_id, b_id
  ),
  juzgadas AS (
    SELECT a_id, b_id, signals,
      CASE WHEN signals && ARRAY['documento', 'telefono'] THEN 'fuerte' ELSE 'media' END AS strength
    FROM agrupadas
    WHERE
      signals && ARRAY['documento', 'telefono']
      -- **Ni la ubicación ni la conexión hacen un candidato, juntas o por separado.** Es lo que
      -- dice el ticket con «misma dirección no significa duplicado», y el caso que lo demuestra es
      -- un albergue: veinte familias distintas comparten el punto y el wifi. Si eso bastara, la
      -- bandeja se llenaría de parejas falsas justo donde más gente hay, y quien audita dejaría de
      -- abrirla. Por eso el barrio con el tamaño del hogar es obligatorio para el nivel `media`.
      OR (signals @> ARRAY['barrio_y_tamano'] AND signals && ARRAY['ubicacion', 'conexion'])
  )
  INSERT INTO registration_duplicate_candidates (
    id, incident_id, registration_a_id, registration_b_id, signals, strength, detail
  )
  SELECT gen_random_uuid(), target_incident, a_id, b_id, signals, strength,
         jsonb_build_object('matched_at', now(), 'signal_count', array_length(signals, 1))
  FROM juzgadas
  ON CONFLICT (registration_a_id, registration_b_id) DO UPDATE
    SET signals = EXCLUDED.signals,
        strength = EXCLUDED.strength,
        detail = EXCLUDED.detail,
        updated_at = now()
    -- Refrescar solo lo que nadie ha resuelto. Un par descartado por una persona no vuelve a la
    -- bandeja porque el emparejador corrió otra vez.
    WHERE registration_duplicate_candidates.status = 'propuesto';

  GET DIAGNOSTICS proposed = ROW_COUNT;
  RETURN proposed;
END;
$$;

COMMENT ON FUNCTION pulso_match_registrations IS
  'Empareja registros del censo comunitario y deja los pares en la bandeja. No fusiona, no marca '
  'duplicados y no reabre lo que una persona ya resolvió.';

-- ## 5. Resolver un par
--
-- Va en la base y no solo en el repositorio porque son tres escrituras que tienen que pasar juntas:
-- la decisión, el estado del registro descartado y la constancia firmada. Si la tercera fallara
-- después de la segunda, quedaría un hogar marcado como duplicado sin nadie que responda por eso.
CREATE OR REPLACE FUNCTION pulso_resolve_duplicate_candidate(
  candidate uuid,
  actor uuid,
  decision text,
  keep uuid,
  reason text
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  row_c registration_duplicate_candidates;
  discarded uuid;
BEGIN
  SELECT * INTO row_c FROM registration_duplicate_candidates WHERE id = candidate FOR UPDATE;
  IF NOT FOUND OR row_c.status <> 'propuesto' THEN
    RETURN false;
  END IF;

  IF decision = 'descartado' THEN
    UPDATE registration_duplicate_candidates
    SET status = 'descartado', resolved_by_actor_id = actor, resolved_at = now(),
        rationale = reason, updated_at = now()
    WHERE id = candidate;
    RETURN true;
  END IF;

  IF decision <> 'confirmado' THEN
    RAISE EXCEPTION 'Decisión desconocida: %', decision USING ERRCODE = 'check_violation';
  END IF;

  IF keep IS NULL OR keep NOT IN (row_c.registration_a_id, row_c.registration_b_id) THEN
    RAISE EXCEPTION 'El registro que se conserva tiene que ser uno de los dos del par.'
      USING ERRCODE = 'check_violation';
  END IF;

  discarded := CASE WHEN keep = row_c.registration_a_id
                    THEN row_c.registration_b_id ELSE row_c.registration_a_id END;

  UPDATE registration_duplicate_candidates
  SET status = 'confirmado', keep_registration_id = keep, resolved_by_actor_id = actor,
      resolved_at = now(), rationale = reason, updated_at = now()
  WHERE id = candidate;

  -- El registro descartado se marca, **no se borra**. Sus conteos siguen ahí y su fila sigue
  -- pudiendo explicarse; lo que cambia es que deja de contar como un hogar distinto en las listas.
  UPDATE household_self_registrations
  SET status = 'duplicado', updated_at = now()
  WHERE id = discarded AND redacted_at IS NULL;

  -- La constancia va a `registration_reviews` y no a una tabla propia: ya existe el sitio donde se
  -- guarda «una persona identificada revisó este registro y concluyó X», y tener dos rastros de
  -- auditoría para la misma clase de decisión es la forma más segura de que uno de los dos quede
  -- sin mirar.
  INSERT INTO registration_reviews (
    id, registration_id, outcome, reviewer_actor_id, rationale, evidence_kind
  ) VALUES (
    gen_random_uuid(), discarded, 'duplicado', actor, reason, 'senales_automaticas'
  );

  RETURN true;
END;
$$;

COMMENT ON FUNCTION pulso_resolve_duplicate_candidate IS
  'Cierra un par de la bandeja. Al confirmar marca el registro descartado como duplicado, conserva '
  'la fila y deja constancia firmada en registration_reviews.';

-- ## 6. Lo que ve quien audita
--
-- Sin nombre, sin teléfono y sin documento: para decidir si dos registros son el mismo hogar hace
-- falta ver el barrio, el tamaño y las señales, no la identidad de nadie. `has_contact` dice si hay
-- un teléfono con el que llamar a confirmar, que es lo único que se necesita saber del dato en sí.
CREATE OR REPLACE VIEW registration_duplicate_tray AS
SELECT
  c.id,
  c.incident_id,
  c.signals,
  c.strength,
  c.status,
  c.created_at,
  c.resolved_at,
  c.rationale,
  c.keep_registration_id,
  a.id AS a_id, a.public_code AS a_code, a.neighborhood AS a_neighborhood,
  ta.name AS a_territory, a.people_count AS a_people, a.dwelling_status AS a_dwelling,
  a.sheltering_at AS a_sheltering, a.officially_censused AS a_censused,
  a.contact_phone_encrypted IS NOT NULL AS a_has_contact, a.created_at AS a_created_at,
  b.id AS b_id, b.public_code AS b_code, b.neighborhood AS b_neighborhood,
  tb.name AS b_territory, b.people_count AS b_people, b.dwelling_status AS b_dwelling,
  b.sheltering_at AS b_sheltering, b.officially_censused AS b_censused,
  b.contact_phone_encrypted IS NOT NULL AS b_has_contact, b.created_at AS b_created_at
FROM registration_duplicate_candidates c
JOIN household_self_registrations a ON a.id = c.registration_a_id
JOIN household_self_registrations b ON b.id = c.registration_b_id
LEFT JOIN territories ta ON ta.id = a.territory_id
LEFT JOIN territories tb ON tb.id = b.territory_id;

COMMENT ON VIEW registration_duplicate_tray IS
  'La bandeja tal como se sirve a Operaciones. No expone nombre, teléfono ni documento: para '
  'decidir si dos registros son el mismo hogar no hace falta saber quién es nadie.';
