CREATE TABLE field_evidence (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  assignment_id uuid NOT NULL REFERENCES field_assignments(id),
  assessment_id uuid NOT NULL REFERENCES rapid_assessments(id),
  assessment_client_mutation_id uuid NOT NULL,
  zone_id uuid NOT NULL REFERENCES operational_zones(id),
  actor_id uuid NOT NULL REFERENCES actors(id),
  client_mutation_id uuid NOT NULL,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 180),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 4 AND 5242880),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz NOT NULL,
  content bytea NOT NULL,
  status text NOT NULL DEFAULT 'stored' CHECK (status IN ('stored', 'quarantined', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, client_mutation_id)
);

CREATE INDEX field_evidence_assessment_idx ON field_evidence (assessment_id, captured_at DESC);
CREATE INDEX field_evidence_assignment_idx ON field_evidence (assignment_id, captured_at DESC);
CREATE INDEX field_evidence_hash_idx ON field_evidence (incident_id, sha256);
