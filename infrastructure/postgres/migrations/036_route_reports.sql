-- Vías bloqueadas y aeropuertos cerrados. Cierra `P0-10`.
--
-- Un equipo de rescate necesita saber por dónde puede llegar antes de saber a dónde va. Gravitas
-- publica 14 de estos puntos —derrumbes sobre la calzada, aeropuertos sin operación, un túnel
-- cerrado— y los descartábamos en la ingesta porque no existía un tipo donde cupieran.
--
-- No es una categoría de `necesidad`: una vía cerrada no pide que le manden nada, informa de que no
-- se puede pasar. Y no es un `pmu`: registrar el aeropuerto de Buenaventura como Puesto de Mando
-- Unificado le diría a quien coordina que ahí hay mando. Es un tipo propio, por la misma razón por
-- la que `rescate` lo es.
ALTER TABLE community_reports
  DROP CONSTRAINT IF EXISTS community_reports_report_type_check;

ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_report_type_check
  CHECK (report_type IN ('rescate', 'pmu', 'necesidad', 'via'));

-- Una vía reabierta importa tanto como una cerrada, y son el mismo tipo de reporte: sin esta
-- columna, el punto de Bogotá —«Reabierto, monitoreo continuo»— se pintaría igual que un cierre
-- total y mandaría a un equipo a rodear una vía que ya está abierta.
--
-- Va como columna y no dentro de `metadata` a propósito. `mapCommunityReportSchema` deja fuera todo
-- el jsonb para que el mapa no arrastre cientos de KB, así que un dato que decide **cómo se pinta el
-- marcador** tiene que viajar en la proyección ligera. Es exactamente el motivo por el que
-- `signs_of_life` también es columna.
ALTER TABLE community_reports
  ADD COLUMN route_status text
    CHECK (route_status IS NULL OR route_status IN ('bloqueada', 'habilitada'));

-- Dos valores, no tres. La tentación es añadir `parcial` para casos como «posible reapertura
-- parcial pronto», pero eso es lo que la fuente *espera*, no lo que observó: hoy sigue bloqueada.
-- Un estado intermedio invitaría a que alguien intente pasar por donde no se puede.

-- Simétrica a `community_reports_rescue_fields_ck`: la columna solo significa algo en una vía. Sin
-- esto acabaría rellenándose desde otra ingesta con otro sentido, y el mapa pintaría cierres donde
-- no los hay.
ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_route_fields_ck
  CHECK (report_type = 'via' OR route_status IS NULL);

-- Y al revés: una vía sin estado no se puede dibujar ni interpretar. Aquí sí se exige, a diferencia
-- de los campos de rescate —que son opcionales porque un reporte incompleto de gente atrapada vale
-- igual—. Una vía de la que no sabemos si está abierta o cerrada no le sirve a nadie.
ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_route_status_required_ck
  CHECK (report_type <> 'via' OR route_status IS NOT NULL);

-- Índice parcial, como el de la cola de rescate: los cierres son una fracción diminuta de la tabla
-- y la pregunta «¿por dónde no se puede pasar en este municipio?» tiene que responder rápido
-- mientras el mapa entero carga al lado.
CREATE INDEX community_reports_route_idx
  ON community_reports(incident_id, route_status, created_at DESC)
  WHERE report_type = 'via' AND status <> 'rejected';
