CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE incident_status AS ENUM ('draft', 'active', 'stabilized', 'closed');
CREATE TYPE disaster_type AS ENUM (
  'earthquake',
  'flood',
  'fire',
  'hurricane',
  'landslide',
  'other'
);

CREATE TABLE incidents (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]{3,40}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 160),
  disaster_type disaster_type NOT NULL,
  country_code char(2) NOT NULL,
  timezone text NOT NULL,
  started_at timestamptz NOT NULL,
  status incident_status NOT NULL DEFAULT 'active',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE territories (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  parent_id uuid REFERENCES territories(id),
  external_code text,
  territory_type text NOT NULL,
  name text NOT NULL,
  geometry geometry(Geometry, 4326) NOT NULL,
  access_status text NOT NULL DEFAULT 'unknown',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX territories_incident_idx ON territories(incident_id);
CREATE INDEX territories_parent_idx ON territories(parent_id);
CREATE INDEX territories_geometry_gist ON territories USING gist(geometry);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  incident_id uuid REFERENCES incidents(id),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_hash text,
  after_hash text NOT NULL,
  previous_event_hash text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_events_incident_time_idx ON audit_events(incident_id, occurred_at);
CREATE INDEX audit_events_entity_idx ON audit_events(entity_type, entity_id, occurred_at);
