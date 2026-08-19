-- Daño visto desde un satélite. La primera evaluación de esta emergencia que no espera a que
-- alguien reporte.
--
-- ## Por qué una tabla aparte y no una fila más en la capa de daños
--
-- Hoy el mapa tiene daños que alguien vio y reportó. Meter aquí 1.627 puntos de satélite duplicaría
-- esa capa y borraría la única diferencia que importa: **«alguien estuvo ahí» y «un sensor lo
-- señaló» no son la misma afirmación**, y la segunda no se puede usar para las mismas decisiones
-- que la primera. Un equipo que sale a verificar necesita saber cuál de las dos está mirando antes
-- de subirse al carro.
--
-- La tabla vive aparte, se dibuja aparte y se cuenta aparte.
--
-- ## Lo que se ingiere
--
-- · **UNOSAT** (CC BY-SA) — un analista mirando imagen Pleiades de muy alta resolución, en Anserma,
--   Manizales y Viterbo. 393 puntos.
-- · **Microsoft AI for Good Lab** (CC BY) — un modelo sobre imagen Airbus y Vantor, en Cali y
--   Pereira. 1.234 puntos, filtrados de 396.053 huellas de edificación.
--
-- **Viterbo es la razón de que esto valga la pena:** MMI 7,2, tres reportes ciudadanos, y 154
-- edificaciones señaladas desde el aire. Anserma, seis reportes y 104 señaladas. No es verificación
-- cruzada de lo que ya sabíamos: es lo que nadie había contado.
CREATE TABLE remote_damage_assessments (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  territory_id uuid REFERENCES territories(id),

  source text NOT NULL CHECK (source IN ('unosat', 'microsoft_ai_for_good')),
  source_dataset text NOT NULL,
  external_id text NOT NULL,

  /*
   * **El eje que el mapa tiene que poder dibujar.**
   *
   * · `analista` — una persona entrenada miró la imagen y marcó el edificio.
   * · `modelo`   — un modelo puntuó la huella de la edificación.
   *
   * No es un matiz de procedencia: son dos niveles de confianza distintos, y publicarlos con el
   * mismo símbolo haría que la cifra grande se comiera a la buena.
   */
  method text NOT NULL CHECK (method IN ('analista', 'modelo')),
  sensor text,
  -- La fecha de la imagen, no la de la ingesta. Una evaluación del 11 de agosto no dice nada del
  -- estado de hoy, y sin esta fecha a la vista el mapa aparenta ser actual.
  imagery_date date NOT NULL,

  damage_level text NOT NULL CHECK (damage_level IN ('dano', 'posible_dano', 'sin_clasificar')),
  -- La etiqueta original, tal cual vino. Normalizar sin guardar el original hace imposible volver
  -- al dato de la fuente, que es justo lo que este proyecto promete poder hacer siempre.
  raw_damage_label text,
  -- Puntaje del modelo cuando lo hay. Nulo en UNOSAT porque ahí no hay modelo: hay una persona.
  model_score numeric(6, 4) CHECK (model_score IS NULL OR (model_score >= 0 AND model_score <= 1)),

  /*
   * Si alguien fue a mirarlo en el terreno.
   *
   * **Hoy es `false` en las 1.627 filas**, y UNOSAT lo dice en cada rasgo con esas palabras: «not
   * yet field validated». Que sea una columna y no una nota al pie es a propósito — es la
   * diferencia entre una pista y un hecho, y el día que una brigada confirme una, esta columna es
   * donde se nota.
   */
  field_validated boolean NOT NULL DEFAULT false,
  field_validated_at timestamptz,
  -- El código de evento tal como venía. En Manizales 8 de 135 rasgos traen `EQ20260822COL` en vez
  -- de `EQ20260810COL`, con la misma fecha de sensor y dentro del mismo paquete. Parece un error de
  -- captura de la fuente; se arrastra sin corregir para que se pueda ver, en vez de normalizarlo en
  -- silencio y perder la señal de que algo no cuadra.
  raw_event_code text,

  location geometry(Point, 4326) NOT NULL,

  /*
   * ## La licencia, como columna obligatoria
   *
   * «La licencia se respeta o no se usa el dato» — CC BY y CC BY-SA exigen atribución, y una
   * atribución que vive solo en el código de una página se pierde en el primer refactor. Aquí es
   * NOT NULL con un CHECK de longitud: **una fila sin atribución no entra**, y cualquier consulta
   * que saque el dato saca con qué citarlo.
   */
  license text NOT NULL CHECK (char_length(btrim(license)) BETWEEN 3 AND 60),
  attribution text NOT NULL CHECK (char_length(btrim(attribution)) BETWEEN 5 AND 200),
  source_url text NOT NULL CHECK (source_url LIKE 'http%'),

  provenance_id uuid REFERENCES provenance_records(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Reingerir el mismo conjunto actualiza en vez de duplicar. Sin esto, dos corridas publicarían
  -- 3.254 daños donde hay 1.627.
  UNIQUE (source_dataset, external_id)
);

CREATE INDEX remote_damage_location_idx ON remote_damage_assessments USING GIST (location);
CREATE INDEX remote_damage_incident_idx
  ON remote_damage_assessments(incident_id, method, damage_level);
CREATE INDEX remote_damage_territory_idx
  ON remote_damage_assessments(territory_id) WHERE territory_id IS NOT NULL;

COMMENT ON TABLE remote_damage_assessments IS
  'Daño señalado desde imagen satelital. Tabla aparte de los daños reportados por personas a '
  'propósito: «alguien estuvo ahí» y «un sensor lo señaló» no son la misma afirmación.';

-- ## El área que se pudo mirar
--
-- Sin esto el mapa miente por omisión. UNOSAT resume San José del Palmar —el municipio del
-- epicentro— así: un edificio con daño visible y ningún otro daño generalizado observable **«within
-- the cloud-free areas»**. El Chocó es de los sitios más nublados del planeta. Publicar «1 daño» sin
-- decir qué trozo se pudo mirar convertiría una limitación del sensor en una buena noticia.
--
-- Con el área dibujada, un punto solitario se lee como lo que es: esto es lo único que se alcanzó a
-- ver, y lo de fuera sigue sin mirar.
CREATE TABLE remote_damage_analysed_areas (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  territory_id uuid REFERENCES territories(id),
  source text NOT NULL CHECK (source IN ('unosat', 'microsoft_ai_for_good')),
  external_id text NOT NULL,
  imagery_date date NOT NULL,
  area geometry(MultiPolygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX remote_damage_areas_idx ON remote_damage_analysed_areas USING GIST (area);

COMMENT ON TABLE remote_damage_analysed_areas IS
  'Qué trozo de territorio alcanzó a mirar cada satélite. Sin esto, «no se vio daño» se lee como '
  '«no hay daño», cuando casi siempre significa «había nubes».';

-- ## Lo que se publica
--
-- Agregado por municipio y por método, para poder responder la pregunta que hace que esto importe:
-- **dónde señala el satélite mucho más de lo que reportó la gente**. Ahí es donde no ha ido nadie.
DROP VIEW IF EXISTS remote_damage_vs_reports;
CREATE VIEW remote_damage_vs_reports AS
SELECT
  c.divipola,
  c.municipality,
  c.department,
  c.mmi_max,
  c.report_count AS citizen_reports,
  count(*) FILTER (WHERE r.method = 'analista') AS analyst_flagged,
  count(*) FILTER (WHERE r.method = 'modelo') AS model_flagged,
  count(*) FILTER (WHERE r.damage_level = 'dano') AS level_damage,
  count(*) FILTER (WHERE r.damage_level = 'posible_dano') AS level_possible,
  count(*) FILTER (WHERE r.field_validated) AS field_validated,
  min(r.imagery_date) AS imagery_from,
  max(r.imagery_date) AS imagery_to
FROM remote_damage_assessments r
JOIN territory_census_coverage c ON c.territory_id = r.territory_id
GROUP BY c.divipola, c.municipality, c.department, c.mmi_max, c.report_count;

COMMENT ON VIEW remote_damage_vs_reports IS
  'Cuánto señala el satélite frente a cuánto reportó la gente, por municipio. La brecha grande '
  'señala dónde no ha ido nadie: Viterbo tiene 3 reportes y 154 edificaciones señaladas.';
