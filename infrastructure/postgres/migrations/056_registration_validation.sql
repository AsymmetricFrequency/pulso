-- Validar y auditar lo que se registra. Segundo y tercer tramo de `censar → validar → auditar`.
--
-- El registro ya existe. Lo que faltaba es poder responder, sobre cada hogar registrado, dos
-- preguntas distintas que se confunden con facilidad:
--
-- · **¿Es coherente con lo que sabemos por otras vías?** — eso lo puede calcular la plataforma.
-- · **¿Esta familia fue realmente afectada?** — eso **no lo puede decidir un algoritmo**, y decir
--   lo contrario sería la peor forma de fallar aquí: negarle la existencia a alguien porque una
--   consulta no encontró evidencia de su desgracia.
--
-- Por eso hay dos capas. La automática produce **señales**, nunca un veredicto. La humana produce
-- una decisión, y queda firmada.

-- ## 1. Señales automáticas
--
-- Cruzan el registro contra evidencia que ya teníamos **antes** de que esa persona escribiera: la
-- sacudida modelada por el USGS y los daños que otras fuentes reportaron en ese municipio. Es la
-- única forma honesta de contrastar: comparar lo que alguien dice contra lo que ya estaba escrito.
CREATE TABLE registration_validations (
  id uuid PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES household_self_registrations(id) ON DELETE CASCADE,

  /*
   * El resultado del cruce. Tres estados y ninguno es «rechazado»:
   *
   * · `coherente`      — lo que declara encaja con la sacudida y con los daños ya reportados.
   * · `sin_contraste`  — no tenemos con qué comparar. **No es sospecha**: es el caso normal en un
   *                      municipio del que no hay dato, que es justamente donde más falta hace
   *                      registrarse. Tratarlo como duda castigaría a quien más nos necesita.
   * · `revisar`        — algo no cuadra y una persona debería mirarlo. Nunca se descarta solo.
   */
  signal text NOT NULL CHECK (signal IN ('coherente', 'sin_contraste', 'revisar')),

  -- Qué se miró, con el valor que tenía. Guardar el detalle y no solo el resultado es lo que
  -- permite responder después «¿por qué salió esto?» sin volver a correr nada — y descubrir que la
  -- regla estaba mal, que es lo que de verdad pasa.
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,

  computed_at timestamptz NOT NULL DEFAULT now(),
  -- Una validación vigente por registro; recalcular reemplaza.
  UNIQUE (registration_id)
);

CREATE INDEX registration_validations_signal_idx ON registration_validations(signal, computed_at DESC);

-- ## 2. La decisión humana
--
-- Aquí sí hay veredicto, y lleva nombre. `auditado` no significa «comprobamos que fue afectado» —
-- eso solo lo puede establecer una autoridad en terreno— sino «una persona identificada revisó
-- este registro y deja constancia de lo que concluyó».
CREATE TABLE registration_reviews (
  id uuid PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES household_self_registrations(id) ON DELETE CASCADE,

  outcome text NOT NULL CHECK (outcome IN (
    'respaldado',      -- hay evidencia independiente que lo respalda
    'sin_evidencia',   -- no encontramos con qué contrastarlo, y se dice así
    'duplicado',       -- ya existe otro registro del mismo hogar
    'inconsistente'    -- lo declarado se contradice con lo que sabemos
  )),

  reviewer_actor_id uuid NOT NULL REFERENCES actors(id),
  -- Obligatorio y con largo mínimo, como el motivo de mover un punto. Una auditoría que dice quién
  -- y no dice con qué se apoyó no se puede revisar después, que es para lo que existe.
  rationale text NOT NULL CHECK (char_length(btrim(rationale)) BETWEEN 10 AND 1000),

  -- En qué se apoyó: visita, llamada, cruce con una lista oficial, revisión de las señales.
  evidence_kind text NOT NULL CHECK (evidence_kind IN (
    'visita_en_terreno', 'llamada', 'lista_oficial', 'senales_automaticas', 'otro'
  )),

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX registration_reviews_registration_idx
  ON registration_reviews(registration_id, created_at DESC);
CREATE INDEX registration_reviews_reviewer_idx
  ON registration_reviews(reviewer_actor_id, created_at DESC);

COMMENT ON TABLE registration_reviews IS
  'Decisión humana sobre un registro, firmada y motivada. `respaldado` no significa que la '
  'plataforma haya comprobado la afectación: significa que una persona identificada lo revisó.';

-- ## 3. El cálculo de las señales
--
-- Corre sobre un registro y devuelve su señal. Se aplica a los registros nuevos y se puede recorrer
-- entera cuando cambie la evidencia — un municipio del que hoy no sabemos nada puede tener daños
-- reportados mañana, y entonces un `sin_contraste` de ayer pasa a ser `coherente`.
CREATE OR REPLACE FUNCTION pulso_validate_registration(target uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  reg record;
  mmi numeric;
  damage_nearby integer;
  same_ip integer;
  result text;
  detail jsonb;
BEGIN
  SELECT * INTO reg FROM household_self_registrations WHERE id = target;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Sacudida del municipio, si lo declaró y si tenemos lectura.
  SELECT ts.mmi_max INTO mmi
  FROM territory_shaking ts
  WHERE ts.territory_id = reg.territory_id;

  -- Daños que **otras fuentes** reportaron en ese municipio. La comparación vale porque estaban
  -- escritos antes de que esta persona llegara.
  SELECT count(*) INTO damage_nearby
  FROM community_reports cr
  JOIN territories t ON t.id = reg.territory_id
  WHERE cr.report_type IN ('dano', 'rescate')
    AND cr.status NOT IN ('rejected', 'superseded')
    AND ST_Contains(t.geometry, cr.location);

  -- Cuántos registros comparten el hash de IP. No es prueba de nada por sí solo —un albergue
  -- entero comparte una conexión, y una familia puede registrar a su vecina— pero por encima de
  -- cierto número merece que alguien mire.
  SELECT count(*) INTO same_ip
  FROM household_self_registrations other
  WHERE other.source_ip_hash IS NOT NULL
    AND other.source_ip_hash = reg.source_ip_hash;

  detail := jsonb_build_object(
    'mmi_max', mmi,
    'damage_reports_in_municipality', damage_nearby,
    'registrations_from_same_ip', same_ip,
    'dwelling_status', reg.dwelling_status,
    'has_territory', reg.territory_id IS NOT NULL
  );

  IF mmi IS NULL AND damage_nearby = 0 THEN
    -- Sin nada con qué comparar. **No es sospecha.** Es lo normal en un municipio del que no hay
    -- dato, que es exactamente donde más falta hace que alguien se registre.
    result := 'sin_contraste';
  ELSIF same_ip > 15 THEN
    result := 'revisar';
  ELSIF reg.dwelling_status IN ('destruida', 'inhabitable')
        AND mmi IS NOT NULL AND mmi < 4 AND damage_nearby = 0 THEN
    -- Declara vivienda destruida donde apenas se sintió y nadie más reportó daño. Puede ser cierto
    -- —una casa en mal estado se cae con poco— así que va a revisión humana, no a la basura.
    result := 'revisar';
  ELSE
    result := 'coherente';
  END IF;

  INSERT INTO registration_validations (id, registration_id, signal, checks, computed_at)
  VALUES (gen_random_uuid(), target, result, detail, now())
  ON CONFLICT (registration_id) DO UPDATE
    SET signal = EXCLUDED.signal, checks = EXCLUDED.checks, computed_at = now();

  RETURN result;
END;
$$;

COMMENT ON FUNCTION pulso_validate_registration IS
  'Cruza un registro contra la sacudida del USGS y los daños que otras fuentes ya reportaban. '
  'Produce señales, nunca un veredicto: si la plataforma pudiera descartar sola a una familia, '
  'el error más probable sería negarle la existencia a alguien porque una consulta no encontró '
  'evidencia de su desgracia.';
