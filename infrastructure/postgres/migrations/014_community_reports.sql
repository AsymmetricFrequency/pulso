CREATE TABLE community_reports (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  territory_id uuid REFERENCES territories(id),
  report_type text NOT NULL CHECK (report_type IN ('pmu', 'necesidad')),
  category text CHECK (category IS NULL OR category IN (
    'agua', 'alimentos', 'salud', 'refugio', 'higiene', 'herramienta',
    'escombros', 'voluntariado', 'animales', 'logistica', 'otro'
  )),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 140),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  location geometry(Point, 4326) NOT NULL,
  public_location_precision text NOT NULL DEFAULT 'approximate'
    CHECK (public_location_precision IN ('hidden', 'zone', 'neighborhood', 'approximate')),
  contact_encrypted bytea,
  status text NOT NULL DEFAULT 'reported'
    CHECK (status IN ('reported', 'corroborated', 'validated', 'rejected', 'superseded')),
  reviewed_by_actor_id uuid REFERENCES actors(id),
  reviewed_at timestamptz,
  review_notes text CHECK (review_notes IS NULL OR char_length(review_notes) <= 2000),
  source_ip_hash text CHECK (source_ip_hash IS NULL OR char_length(source_ip_hash) = 64),
  client_mutation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, client_mutation_id),
  CHECK (report_type = 'pmu' OR category IS NOT NULL),
  CHECK (
    (status = 'reported' AND reviewed_at IS NULL AND reviewed_by_actor_id IS NULL)
    OR (status <> 'reported' AND reviewed_by_actor_id IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX community_reports_incident_status_idx
  ON community_reports(incident_id, status, created_at DESC);
CREATE INDEX community_reports_location_gist ON community_reports USING gist(location);
