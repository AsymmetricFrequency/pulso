-- Separar la ayuda: acopio, albergue y puesto de mando son tres cosas. Cierra `P0-8`.
--
-- `pmu` se había convertido en un cajón de sastre. Medido el 18/08: **1.121 puntos etiquetados como
-- «Puesto de mando» y solo 5 lo eran**. Los otros 1.116 venían de siete fuentes distintas y son
-- centros de acopio, albergues, puntos de ayuda y bancos de sangre — todos dibujados con la misma
-- bandera y el mismo nombre.
--
-- No es un problema de estética ni de poder filtrar. **Un acopio recibe y despacha cosas; un
-- albergue es donde alguien duerme esta noche.** Mezclarlos hace que el mapa no pueda responder
-- «dónde queda espacio para alojar a alguien», que es la pregunta del cuarto día de una emergencia.
ALTER TABLE community_reports
  DROP CONSTRAINT IF EXISTS community_reports_report_type_check;

ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_report_type_check
  CHECK (report_type IN ('rescate', 'pmu', 'necesidad', 'via', 'dano', 'acopio', 'albergue'));

-- Capacidad y ocupación de un alojamiento temporal.
--
-- Aproximadas y opcionales a propósito: quien reporta una carpa a las once de la noche no cuenta
-- camas. Exigirlas convertiría el dato que sí tenemos —que existe y dónde está— en uno que nadie
-- envía. La pregunta que responden juntas es «¿cabe alguien más aquí?».
ALTER TABLE community_reports
  ADD COLUMN shelter_capacity integer
    CHECK (shelter_capacity IS NULL OR (shelter_capacity > 0 AND shelter_capacity <= 20000)),
  ADD COLUMN shelter_occupancy integer
    CHECK (shelter_occupancy IS NULL OR (shelter_occupancy >= 0 AND shelter_occupancy <= 20000));

-- Como las de rescate, vía y daño: solo significan algo en su tipo.
ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_shelter_fields_ck
  CHECK (
    report_type = 'albergue'
    OR (shelter_capacity IS NULL AND shelter_occupancy IS NULL)
  );

-- Reclasificar lo ya importado, **sin borrar ni reimportar**.
--
-- Se hace por fuente entera y no por texto: buscar «albergue» en el título acertaba 36 de 279 en
-- mapadelterremoto y 0 de 181 en Gravitas, así que adivinar por palabras habría etiquetado mal
-- cientos de puntos. Estas cinco fuentes publican **solo** acopios, y eso sí se sabe con certeza
-- porque es lo que su propio importador extrae.
UPDATE community_reports SET report_type = 'acopio', updated_at = now()
WHERE report_type = 'pmu'
  AND external_source_id IN (
    'gravitas-mapa-ciudadano',
    'redcaliayuda-acopio',
    'ayudaspereira-centros',
    'terremotocolombia-co',
    'cuidarcolombia-acopios',
    'contemos-mapa-situacion'
  );

-- `mapadelterremoto` mezcla `PUNTO_AYUDA` y `ALBERGUE` y no guardamos su tipo original, así que no
-- se toca aquí: su importador ya distingue los dos y la siguiente corrida los corrige en su sitio
-- por `external_key`. Es más lento y es lo correcto — el dato lo pone quien lo sabe, no un
-- `UPDATE` que adivina.

-- Los cinco reportes ciudadanos de PMU se quedan como están: esos sí son puestos de mando.

-- Los albergues son la respuesta a «¿dónde puede dormir esta gente esta noche?», y esa pregunta se
-- hace con prisa. Índice parcial, como los de rescate y colapso.
CREATE INDEX community_reports_shelter_idx
  ON community_reports(incident_id, created_at DESC)
  WHERE report_type = 'albergue' AND status <> 'rejected';
