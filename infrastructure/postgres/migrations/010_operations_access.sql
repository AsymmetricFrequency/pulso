CREATE TABLE operations_invitations (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  actor_id uuid NOT NULL REFERENCES actors(id),
  issued_by_actor_id uuid NOT NULL REFERENCES actors(id),
  code_hash text NOT NULL UNIQUE CHECK (char_length(code_hash) = 64),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operations_invitations_actor_time_idx
  ON operations_invitations(actor_id, expires_at DESC);

CREATE TABLE operations_sessions (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  actor_id uuid NOT NULL REFERENCES actors(id),
  device_id text NOT NULL CHECK (char_length(device_id) BETWEEN 8 AND 120),
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operations_sessions_actor_active_idx
  ON operations_sessions(actor_id, expires_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE operations_access_events (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  actor_id uuid REFERENCES actors(id),
  incident_id uuid REFERENCES incidents(id),
  succeeded boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operations_access_events_incident_time_idx
  ON operations_access_events(incident_id, occurred_at DESC);
