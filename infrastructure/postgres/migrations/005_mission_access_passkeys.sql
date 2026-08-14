CREATE TABLE mission_invitations (
  id uuid PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES field_assignments(id),
  actor_id uuid NOT NULL REFERENCES actors(id),
  code_hash text NOT NULL UNIQUE CHECK (char_length(code_hash) = 64),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mission_invitations_assignment_idx
  ON mission_invitations(assignment_id, actor_id, expires_at DESC);

CREATE TABLE field_sessions (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES actors(id),
  assignment_id uuid NOT NULL REFERENCES field_assignments(id),
  device_id text NOT NULL CHECK (char_length(device_id) BETWEEN 8 AND 120),
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  registration_challenge text,
  challenge_expires_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (registration_challenge IS NULL AND challenge_expires_at IS NULL)
    OR (registration_challenge IS NOT NULL AND challenge_expires_at IS NOT NULL)
  )
);

CREATE INDEX field_sessions_actor_active_idx
  ON field_sessions(actor_id, expires_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE actor_passkeys (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES actors(id),
  credential_id text NOT NULL UNIQUE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports text[] NOT NULL DEFAULT '{}',
  device_type text NOT NULL,
  backed_up boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX actor_passkeys_actor_idx ON actor_passkeys(actor_id);
