ALTER TABLE mission_invitations
  ADD COLUMN issued_by_actor_id uuid REFERENCES actors(id);

CREATE TABLE access_rate_limits (
  key_hash text PRIMARY KEY CHECK (char_length(key_hash) = 64),
  attempts integer NOT NULL CHECK (attempts > 0),
  reset_at timestamptz NOT NULL
);

CREATE INDEX access_rate_limits_reset_idx ON access_rate_limits(reset_at);

CREATE TABLE passkey_authentication_attempts (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES actors(id),
  assignment_id uuid NOT NULL REFERENCES field_assignments(id),
  device_id text NOT NULL CHECK (char_length(device_id) BETWEEN 8 AND 120),
  challenge text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX passkey_authentication_attempts_expiry_idx
  ON passkey_authentication_attempts(expires_at) WHERE consumed_at IS NULL;

CREATE TABLE mission_access_events (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  actor_id uuid REFERENCES actors(id),
  assignment_id uuid REFERENCES field_assignments(id),
  source_ip inet,
  succeeded boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mission_access_events_actor_time_idx
  ON mission_access_events(actor_id, occurred_at DESC);
CREATE INDEX mission_access_events_assignment_time_idx
  ON mission_access_events(assignment_id, occurred_at DESC);
