-- Intensidad sísmica percibida por territorio.
--
-- Hasta ahora el mapa público no tenía una sola capa de afectación con dato real: la de daños
-- decía "sin datos publicados" en los 33 departamentos, porque nadie ha registrado evaluaciones de
-- campo. Esta tabla no reemplaza esa evaluación —la intensidad no es daño— pero sí responde con
-- dato oficial una pregunta que hoy queda sin responder: dónde sacudió más fuerte, y por lo tanto
-- dónde hay que ir a mirar primero.
--
-- El valor viene de la malla ShakeMap del USGS, que modela la sacudida a partir de estaciones
-- sismológicas y reportes de personas. Es un modelo, no una medición en cada punto, y por eso la
-- columna guarda el máximo observado en el territorio junto con la cobertura de la malla sobre él:
-- un departamento con tres celdas dentro no está medido igual que uno con doscientas.
CREATE TABLE territory_shaking (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  territory_id uuid NOT NULL REFERENCES territories(id),
  source_id text NOT NULL REFERENCES external_sources(id),
  -- Escala de Mercalli modificada, como la publica el USGS (un decimal).
  mmi_max numeric(3, 1) NOT NULL CHECK (mmi_max >= 0 AND mmi_max <= 12),
  mmi_mean numeric(3, 1),
  mmi_label text NOT NULL,
  /** Celdas de la malla que caen dentro del territorio: es la cobertura del dato, no su calidad. */
  grid_cells integer NOT NULL DEFAULT 0 CHECK (grid_cells >= 0),
  provenance_id uuid REFERENCES provenance_records(id),
  computed_at timestamptz NOT NULL DEFAULT now(),
  -- Una lectura por territorio y fuente: reingerir actualiza en vez de acumular.
  UNIQUE (incident_id, territory_id, source_id)
);

CREATE INDEX territory_shaking_incident_idx ON territory_shaking(incident_id, mmi_max DESC);
CREATE INDEX territory_shaking_territory_idx ON territory_shaking(territory_id);
