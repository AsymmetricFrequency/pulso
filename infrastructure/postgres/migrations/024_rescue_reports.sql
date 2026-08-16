-- Reportes de personas atrapadas bajo escombros.
--
-- Hasta aquí un ciudadano solo podía reportar un puesto de mando o una necesidad. La categoría
-- `escombros` existía, pero significa «hay que remover escombros», no «hay alguien debajo». Son
-- cosas distintas y confundirlas cuesta vidas: la primera espera a una retroexcavadora, la segunda
-- espera a un equipo USAR con cámaras y perros, y espera ahora.
--
-- Esto es la P0 declarada del proyecto, así que el tipo es propio y no una categoría más: el mapa,
-- la cola pública y la consola de operaciones tienen que poder separarlo sin leer un enum de once
-- valores.
ALTER TABLE community_reports
  DROP CONSTRAINT IF EXISTS community_reports_report_type_check;

ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_report_type_check
  CHECK (report_type IN ('rescate', 'pmu', 'necesidad'));

-- La restricción original era `report_type = 'pmu' OR category IS NOT NULL`, escrita cuando solo
-- había dos tipos. Un rescate tampoco lleva categoría: la categoría describe qué falta, y aquí lo
-- que falta es sacar a alguien.
ALTER TABLE community_reports
  DROP CONSTRAINT IF EXISTS community_reports_check;

ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_category_required_ck
  CHECK (report_type <> 'necesidad' OR category IS NOT NULL);

-- Los tres datos que un equipo de búsqueda y rescate necesita para priorizar entre dos puntos, y
-- ninguno más. No hay nombres, ni teléfonos, ni parentescos: quien reporta casi nunca los sabe con
-- certeza y pedirlos convierte un reporte de treinta segundos en un formulario que nadie termina.
ALTER TABLE community_reports
  -- Cuántas personas se cree que hay debajo. Aproximado y declarado por quien reporta; sirve para
  -- dimensionar el equipo que se manda, no para llevar una cuenta de víctimas.
  ADD COLUMN people_reported integer
    CHECK (people_reported IS NULL OR (people_reported > 0 AND people_reported <= 500)),
  -- Señales de vida: voces, golpes, movimiento. Es el dato que más pesa al ordenar la cola, porque
  -- separa un rescate en curso de una recuperación. `unknown` es una respuesta legítima y frecuente
  -- —quien reporta llegó hace un minuto— y forzar sí/no produciría datos inventados.
  ADD COLUMN signs_of_life text
    CHECK (signs_of_life IS NULL OR signs_of_life IN ('yes', 'no', 'unknown')),
  -- Si ya hay bomberos, Defensa Civil o Cruz Roja en el sitio. Existe para evitar el peor
  -- desperdicio de esta fase: mandar un segundo equipo a un punto ya atendido mientras otro punto
  -- sigue sin nadie.
  ADD COLUMN responders_on_site boolean;

-- Estas columnas solo tienen sentido en un rescate. Sin esta restricción acabarían llenándose desde
-- ingestas externas con significados distintos, y la cola de rescate ordenaría por un campo que en
-- la mitad de las filas quiere decir otra cosa.
ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_rescue_fields_ck
  CHECK (
    report_type = 'rescate'
    OR (people_reported IS NULL AND signs_of_life IS NULL AND responders_on_site IS NULL)
  );

-- La cola de rescate. Índice parcial porque los rescates son una fracción diminuta de la tabla
-- (2.288 reportes, casi todos necesidades importadas) y esta consulta es la que tiene que responder
-- rápido siempre, incluso con el mapa entero cargando al lado.
CREATE INDEX community_reports_rescue_queue_idx
  ON community_reports(incident_id, created_at DESC)
  WHERE report_type = 'rescate' AND status <> 'rejected';
