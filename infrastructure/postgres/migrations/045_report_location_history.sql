-- Corregir dónde está un punto, sin entrar a la base. Cierra la mitad durable de `PL-2`.
--
-- Hoy, mover un punto mal puesto exige un `psql` en producción. Con 3.249 puntos importados de
-- terceros —y 79 de ellos con coordenada deducida de una dirección escrita— eso no es un caso raro:
-- es rutina que hoy solo puede hacer quien tenga acceso al servidor.
--
-- **El historial no es contabilidad, es la invariante del proyecto.** «Corregir crea una nueva
-- versión; no sobrescribe el historial». Si mover un punto solo cambiara `location`, la coordenada
-- original —la que dijo la fuente, o la que puso quien reportó— desaparecería sin dejar rastro, y
-- nadie podría responder después «¿esto lo movimos nosotros o vino así?». Esa pregunta se hace
-- justo cuando algo salió mal.
CREATE TABLE community_report_location_changes (
  id uuid PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES community_reports(id) ON DELETE CASCADE,

  -- De dónde y a dónde. Las dos, siempre: sin la anterior no se puede deshacer ni auditar.
  previous_location geometry(Point, 4326) NOT NULL,
  new_location geometry(Point, 4326) NOT NULL,

  -- Y con qué precisión se decía que estaba antes. Un punto geocodificado que alguien corrige a
  -- mano deja de ser aproximado, y esa transición importa: es la diferencia entre «lo dedujo una
  -- máquina» y «alguien lo miró».
  previous_precision text NOT NULL,
  new_precision text NOT NULL,

  moved_by_actor_id uuid NOT NULL REFERENCES actors(id),
  -- Por qué se movió. Obligatorio y con largo mínimo: un historial de correcciones sin motivo
  -- responde «quién» y deja sin responder «por qué», que es lo que de verdad se pregunta después.
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),

  -- Cuánto se movió, en metros. Se calcula al insertar y se guarda porque es la señal que permite
  -- mirar de un vistazo si alguien está haciendo correcciones finas o arrastrando puntos de ciudad.
  distance_meters double precision NOT NULL CHECK (distance_meters >= 0),

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX community_report_location_changes_report_idx
  ON community_report_location_changes(report_id, created_at DESC);

CREATE INDEX community_report_location_changes_actor_idx
  ON community_report_location_changes(moved_by_actor_id, created_at DESC);

COMMENT ON TABLE community_report_location_changes IS
  'Historial de correcciones de ubicación. Una fila por movimiento, con el punto anterior intacto: '
  'el mapa muestra el último, esta tabla responde de dónde salió.';
