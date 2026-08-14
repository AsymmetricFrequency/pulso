CREATE TABLE identity_claims (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  actor_id uuid NOT NULL REFERENCES actors(id),
  claim_type text NOT NULL CHECK (claim_type IN ('legal_name', 'government_id', 'phone', 'email')),
  country_code char(2) NOT NULL,
  document_type text,
  value_fingerprint char(64) NOT NULL,
  display_hint text NOT NULL,
  status text NOT NULL DEFAULT 'asserted' CHECK (status IN ('asserted', 'verified', 'rejected', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX identity_claims_active_fingerprint_unique
  ON identity_claims (incident_id, value_fingerprint)
  WHERE status <> 'revoked';
CREATE INDEX identity_claims_actor_idx ON identity_claims (actor_id, created_at);

CREATE TABLE identity_verifications (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  claim_id uuid NOT NULL REFERENCES identity_claims(id),
  subject_actor_id uuid NOT NULL REFERENCES actors(id),
  verifier_actor_id uuid NOT NULL REFERENCES actors(id),
  method text NOT NULL CHECK (method IN ('self_asserted', 'organization_endorsement', 'document_review', 'official_registry', 'government_biometric')),
  provider text NOT NULL,
  result text NOT NULL CHECK (result IN ('passed', 'failed', 'inconclusive')),
  evidence_ref text,
  checked_at timestamptz NOT NULL,
  expires_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_verifications_subject_idx
  ON identity_verifications (subject_actor_id, checked_at DESC);

CREATE TABLE actor_endorsements (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  subject_actor_id uuid NOT NULL REFERENCES actors(id),
  issuer_actor_id uuid NOT NULL REFERENCES actors(id),
  scope text NOT NULL CHECK (scope IN ('community_member', 'field_worker', 'team_member', 'coordinator', 'professional')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (subject_actor_id <> issuer_actor_id)
);

CREATE UNIQUE INDEX actor_endorsements_active_unique
  ON actor_endorsements (subject_actor_id, issuer_actor_id, scope)
  WHERE status = 'active';
CREATE INDEX actor_endorsements_subject_idx ON actor_endorsements (subject_actor_id, created_at DESC);

CREATE TABLE professional_credentials (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  actor_id uuid NOT NULL REFERENCES actors(id),
  verified_by_actor_id uuid NOT NULL REFERENCES actors(id),
  registry text NOT NULL CHECK (registry IN ('CPNAA', 'COPNIA', 'RETHUS', 'OTHER')),
  profession text NOT NULL,
  registration_fingerprint char(64) NOT NULL,
  registration_hint text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'revoked', 'not_found')),
  checked_at timestamptz NOT NULL,
  expires_at timestamptz,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, registry, registration_fingerprint)
);

CREATE INDEX professional_credentials_actor_idx
  ON professional_credentials (actor_id, checked_at DESC);

CREATE TABLE identity_trust_events (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  subject_actor_id uuid NOT NULL REFERENCES actors(id),
  performed_by_actor_id uuid REFERENCES actors(id),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_trust_events_subject_idx
  ON identity_trust_events (subject_actor_id, occurred_at DESC);
