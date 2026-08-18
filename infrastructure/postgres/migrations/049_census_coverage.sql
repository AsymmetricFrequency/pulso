-- Dónde falta censar. Primera pieza de `censo de personas afectadas`, y la única que se puede
-- construir sin convenio: **no guarda una sola persona**.
--
-- El 13 de agosto la Defensoría del Pueblo advirtió que **la falta de censo impide saber cuántos
-- son** y pidió «acelerar el censo para establecer el Registro Único de Damnificados». La
-- Procuraduría está en los PMU de Caldas, Chocó, Quindío, Risaralda y Valle del Cauca vigilando la
-- entrega, y Contraloría, Procuraduría y Defensoría coinciden en pedir lo mismo: **trazabilidad**.
--
-- Pulso no puede levantar un censo propio —la Alcaldía de Cali ya advirtió que no hay censo por QR,
-- teléfono ni formulario digital, y el RUFE se diligencia presencialmente— y no debe: sería un
-- censo paralelo. Lo que sí puede, hoy y sin permiso de nadie, es responder **dónde no ha llegado
-- nadie a censar**. Esa pregunta no necesita el nombre de ninguna persona.
--
-- ## El vocabulario es el de la autoridad, a propósito
--
-- Los nombres de columna salen del conjunto «Emergencias UNGRD 2023-2024» de datos.gov.co
-- (`rgre-6ak4`), que la propia UNGRD publica con código DIVIPOLA por municipio. De ahí viene la
-- distinción que sostiene toda esta tabla: ese conjunto trae **`personas`/`familias`** —lo
-- reportado como afectado— y aparte **`rud_personas`/`rud_familias`** —lo efectivamente inscrito en
-- el Registro Único de Damnificados—. La diferencia entre esas dos columnas **es** el hueco del
-- censo, y la autoridad ya la mide así.
--
-- Un ejemplo real de ese mismo conjunto, sismo de Acandí (Chocó), 24 de mayo de 2023: 282 personas
-- y 94 familias reportadas, `rud_personas` = 0, `rud_familias` = 0. Reportadas y nunca inscritas.
--
-- Usar sus nombres y su DIVIPOLA no es cosmético: significa que lo que salga de aquí es un archivo
-- que la UNGRD puede leer sin que nadie traduzca nada.
CREATE TABLE territory_census_status (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  territory_id uuid NOT NULL REFERENCES territories(id),

  -- Lo reportado como afectado por la autoridad.
  reported_people integer CHECK (reported_people IS NULL OR reported_people >= 0),
  reported_families integer CHECK (reported_families IS NULL OR reported_families >= 0),

  -- Lo efectivamente inscrito en el RUD. **Nulo no es cero.** Un cero dice «fueron y no inscribieron
  -- a nadie»; un nulo dice «no sabemos si fueron». Confundirlos aquí sería inventar cobertura donde
  -- solo hay silencio, que es exactamente el error que esta tabla existe para no cometer.
  registered_people integer CHECK (registered_people IS NULL OR registered_people >= 0),
  registered_families integer CHECK (registered_families IS NULL OR registered_families >= 0),

  houses_destroyed integer CHECK (houses_destroyed IS NULL OR houses_destroyed >= 0),
  houses_damaged integer CHECK (houses_damaged IS NULL OR houses_damaged >= 0),

  -- Declarado por la fuente, nunca deducido. Si nadie lo dice, es `sin_dato` — y `sin_dato` es una
  -- respuesta, no un hueco que haya que rellenar con una suposición.
  census_state text NOT NULL DEFAULT 'sin_dato'
    CHECK (census_state IN ('sin_dato', 'sin_iniciar', 'en_curso', 'completo')),

  source_id text NOT NULL REFERENCES external_sources(id),
  source_url text,
  -- Cuándo lo dijo la fuente, no cuándo lo guardamos. Una cifra de censo de hace cinco días se lee
  -- distinto que una de hoy, y sin esta columna las dos se ven iguales.
  observed_at timestamptz NOT NULL,
  note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Una lectura por territorio y fuente: reingerir actualiza en vez de acumular.
  UNIQUE (incident_id, territory_id, source_id)
);

CREATE INDEX territory_census_status_incident_idx
  ON territory_census_status(incident_id, census_state);

COMMENT ON TABLE territory_census_status IS
  'Estado del censo oficial por territorio, en agregados. No contiene ni puede contener datos de '
  'ninguna persona: el expediente individual vive en affected_people y solo se llena bajo convenio.';

-- ## Zonas silenciosas
--
-- La vista que responde la pregunta. Cruza tres cosas que ya tenemos y ninguna es un dato personal:
--
-- · **cuánto sacudió** — malla ShakeMap del USGS, 680 municipios con lectura, 149 con MMI ≥ 6;
-- · **cuánta señal ciudadana llegó** — reportes en el mapa, contados por contención geográfica;
-- · **qué dice la autoridad del censo** — la tabla de arriba.
--
-- El cruce importante es el tercero contra el primero. **La ausencia de reportes no es ausencia de
-- daño**: un municipio sin un solo reporte puede ser uno donde no pasó nada o uno donde no hay
-- señal, ni internet, ni nadie con tiempo de abrir un mapa. La sacudida distingue esos dos casos
-- sin necesidad de que nadie reporte, y por eso es la columna que ordena la lista.
CREATE VIEW territory_census_coverage AS
SELECT
  t.id AS territory_id,
  t.incident_id,
  t.external_code AS divipola,
  t.name AS municipality,
  parent.name AS department,
  ts.mmi_max,
  ts.mmi_label,
  coalesce(r.report_count, 0) AS report_count,
  cs.census_state,
  cs.reported_people,
  cs.registered_people,
  cs.observed_at AS census_observed_at,
  -- La clasificación. Deliberadamente cuatro casos y no un puntaje: un número del 0 al 100 se
  -- discute, y estas cuatro frases se verifican.
  CASE
    -- Sacudió fuerte, nadie reportó nada y nadie dice haber censado. Es el caso que la Defensoría
    -- nombró: no sabemos cuántos son porque no ha ido nadie.
    WHEN coalesce(ts.mmi_max, 0) >= 6 AND coalesce(r.report_count, 0) = 0
         AND coalesce(cs.census_state, 'sin_dato') = 'sin_dato' THEN 'silencio'
    -- Hay señal de que hay gente afectada, pero nadie ha censado.
    WHEN coalesce(r.report_count, 0) > 0
         AND coalesce(cs.census_state, 'sin_dato') IN ('sin_dato', 'sin_iniciar') THEN 'sin_censo'
    WHEN cs.census_state = 'en_curso' THEN 'en_curso'
    WHEN cs.census_state = 'completo' THEN 'con_censo'
    ELSE 'fuera_de_alcance'
  END AS coverage_state
FROM territories t
LEFT JOIN territories parent ON parent.id = t.parent_id
LEFT JOIN territory_shaking ts ON ts.territory_id = t.id
LEFT JOIN territory_census_status cs ON cs.territory_id = t.id
LEFT JOIN LATERAL (
  SELECT count(*) AS report_count
  FROM community_reports cr
  WHERE cr.status NOT IN ('rejected', 'superseded')
    AND ST_Contains(t.geometry, cr.location)
) r ON true
WHERE t.territory_type = 'municipality' AND t.deleted_at IS NULL;

COMMENT ON VIEW territory_census_coverage IS
  'Dónde falta censar. Cruza sacudida (USGS), señal ciudadana y estado declarado del censo. '
  'Sin un solo dato personal: responde dónde no ha ido nadie, no quién vive ahí.';
