CREATE TABLE rapid_assessments (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  assignment_id uuid NOT NULL REFERENCES field_assignments(id),
  zone_id uuid NOT NULL REFERENCES operational_zones(id),
  team_id uuid NOT NULL REFERENCES teams(id),
  actor_id uuid NOT NULL REFERENCES actors(id),
  client_mutation_id uuid NOT NULL,
  device_id text NOT NULL CHECK (char_length(device_id) BETWEEN 3 AND 120),
  observed_at timestamptz NOT NULL,
  damage_types text[] NOT NULL DEFAULT '{}',
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  need_types text[] NOT NULL DEFAULT '{}',
  urgency text NOT NULL CHECK (urgency IN ('routine', 'priority', 'urgent', 'immediate')),
  affected_households integer NOT NULL DEFAULT 0 CHECK (affected_households BETWEEN 0 AND 100000),
  affected_people integer NOT NULL DEFAULT 0 CHECK (affected_people BETWEEN 0 AND 1000000),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'reviewed', 'duplicate')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(damage_types) > 0 OR cardinality(need_types) > 0),
  UNIQUE (incident_id, client_mutation_id)
);

CREATE INDEX rapid_assessments_assignment_time_idx
  ON rapid_assessments (assignment_id, observed_at DESC);
CREATE INDEX rapid_assessments_zone_urgency_idx
  ON rapid_assessments (zone_id, urgency, observed_at DESC);
