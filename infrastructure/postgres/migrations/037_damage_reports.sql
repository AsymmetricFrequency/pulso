-- Daño estructural: el tipo que faltaba para poder ingerir un registro de daños.
--
-- Sale de conectar mapadelterremoto.com. De sus 1.097 puntos con coordenada, **886 no caben en
-- ningún tipo que tuviéramos**: un edificio colapsado, una escuela agrietada, un hospital fuera de
-- servicio, un templo con daño patrimonial. No son `necesidad` —no piden que les manden nada—, no
-- son `pmu`, y no son `via`. Sin este tipo, ingerir un registro de daños obliga a mentir en la
-- etiqueta de cuatro de cada cinco puntos.
--
-- Es además el hueco que el propio README declaraba: «Viviendas afectadas: 0 · Suma de evaluaciones
-- de campo revisadas por brigadas». Teníamos el contador y no teníamos de dónde llenarlo.
ALTER TABLE community_reports
  DROP CONSTRAINT IF EXISTS community_reports_report_type_check;

ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_report_type_check
  CHECK (report_type IN ('rescate', 'pmu', 'necesidad', 'via', 'dano'));

-- La severidad va como columna, y no dentro de `metadata`, por la misma razón que `route_status` y
-- `signs_of_life`: `mapCommunityReportSchema` deja fuera todo el jsonb para que el mapa no arrastre
-- cientos de KB, y **un edificio colapsado no puede dibujarse igual que una fachada agrietada**.
-- Con 200 colapsos entre miles de daños leves, esa diferencia es la mitad del valor del mapa.
ALTER TABLE community_reports
  ADD COLUMN damage_severity text
    CHECK (damage_severity IS NULL OR damage_severity IN
      ('colapso', 'grave', 'moderado', 'leve', 'sin_evaluar'));

-- `sin_evaluar` es un valor de primera clase y no un hueco. Es el más frecuente en la fuente (1.663
-- de 3.110), y significa algo distinto de «no sabemos si hay daño»: significa que hay daño reportado
-- y **nadie con criterio técnico ha ido a calificarlo todavía**. Colapsarlo a NULL borraría
-- justamente la cola de trabajo de las brigadas de evaluación.

-- Simétrica a las de rescate y vía: la columna solo significa algo en un daño.
ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_damage_fields_ck
  CHECK (report_type = 'dano' OR damage_severity IS NULL);

ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_damage_severity_required_ck
  CHECK (report_type <> 'dano' OR damage_severity IS NOT NULL);

-- Los colapsos son la fracción que importa para P0 —es donde puede haber gente debajo— y son ~200
-- entre miles. Índice parcial, como el de la cola de rescate.
CREATE INDEX community_reports_collapse_idx
  ON community_reports(incident_id, created_at DESC)
  WHERE report_type = 'dano' AND damage_severity = 'colapso' AND status <> 'rejected';
