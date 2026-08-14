CREATE TYPE coverage_status AS ENUM (
  'unknown',
  'remote_report',
  'assigned',
  'in_progress',
  'partial',
  'visited',
  'inaccessible',
  'revisit_required',
  'closed'
);

CREATE UNIQUE INDEX territories_incident_type_code_uidx
  ON territories(incident_id, territory_type, external_code)
  WHERE deleted_at IS NULL AND external_code IS NOT NULL;

CREATE TABLE operational_zones (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  territory_id uuid REFERENCES territories(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 180),
  geometry geometry(Geometry, 4326) NOT NULL,
  priority smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed')),
  coverage_status coverage_status NOT NULL DEFAULT 'unknown',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX operational_zones_incident_status_idx
  ON operational_zones(incident_id, status, coverage_status);
CREATE INDEX operational_zones_geometry_gist ON operational_zones USING gist(geometry);

CREATE TABLE field_visits (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  zone_id uuid NOT NULL REFERENCES operational_zones(id),
  team_id uuid,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  result text NOT NULL DEFAULT 'in_progress',
  track geometry(LineString, 4326),
  access_notes text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX field_visits_incident_time_idx ON field_visits(incident_id, started_at);
CREATE INDEX field_visits_zone_time_idx ON field_visits(zone_id, started_at);
CREATE INDEX field_visits_track_gist ON field_visits USING gist(track);

CREATE TABLE coverage_events (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  zone_id uuid NOT NULL REFERENCES operational_zones(id),
  visit_id uuid REFERENCES field_visits(id),
  status coverage_status NOT NULL CHECK (status <> 'unknown'),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  idempotency_key text,
  CHECK (notes IS NULL OR char_length(notes) <= 2000)
);

CREATE INDEX coverage_events_incident_time_idx ON coverage_events(incident_id, occurred_at);
CREATE INDEX coverage_events_zone_time_idx ON coverage_events(zone_id, occurred_at);
CREATE UNIQUE INDEX coverage_events_idempotency_uidx
  ON coverage_events(incident_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

CREATE INDEX outbox_events_pending_idx ON outbox_events(occurred_at)
  WHERE published_at IS NULL;
