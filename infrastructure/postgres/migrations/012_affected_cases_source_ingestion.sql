CREATE TABLE affected_people (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  public_case_code text NOT NULL,
  identity_fingerprint text,
  display_name_encrypted bytea,
  birth_date_encrypted bytea,
  contact_encrypted bytea,
  document_hint text,
  status text NOT NULL DEFAULT 'referred'
    CHECK (status IN ('referred', 'contacted', 'field_verified', 'officially_characterized', 'eligibility_reviewed', 'active_assistance', 'closed', 'disputed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, public_case_code)
);

CREATE UNIQUE INDEX affected_people_identity_fingerprint_uidx
  ON affected_people(incident_id, identity_fingerprint)
  WHERE identity_fingerprint IS NOT NULL;

CREATE TABLE affected_households (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  public_case_code text NOT NULL,
  status text NOT NULL DEFAULT 'referred'
    CHECK (status IN ('referred', 'contacted', 'field_verified', 'officially_characterized', 'eligibility_reviewed', 'active_assistance', 'closed', 'disputed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, public_case_code)
);

CREATE TABLE affected_household_members (
  household_id uuid NOT NULL REFERENCES affected_households(id),
  person_id uuid NOT NULL REFERENCES affected_people(id),
  relationship text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  PRIMARY KEY (household_id, person_id, valid_from)
);

CREATE TABLE affected_places (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  territory_id uuid REFERENCES territories(id),
  place_type text NOT NULL CHECK (place_type IN ('home', 'building', 'property', 'shelter', 'temporary_location', 'facility')),
  location geometry(Point, 4326),
  address_encrypted bytea,
  public_location_precision text NOT NULL DEFAULT 'hidden'
    CHECK (public_location_precision IN ('hidden', 'zone', 'neighborhood', 'approximate')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX affected_places_location_gist ON affected_places USING gist(location);

CREATE TABLE disaster_cases (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  household_id uuid REFERENCES affected_households(id),
  person_id uuid REFERENCES affected_people(id),
  affected_place_id uuid REFERENCES affected_places(id),
  public_case_code text NOT NULL,
  case_type text NOT NULL CHECK (case_type IN ('affected_household', 'missing_person', 'housing_damage', 'shelter', 'protection', 'health', 'livelihood', 'other')),
  status text NOT NULL DEFAULT 'referred'
    CHECK (status IN ('referred', 'contacted', 'field_verified', 'officially_characterized', 'eligibility_reviewed', 'active_assistance', 'closed', 'disputed')),
  priority text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'priority', 'urgent', 'immediate')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, public_case_code),
  CHECK (household_id IS NOT NULL OR person_id IS NOT NULL OR affected_place_id IS NOT NULL)
);

CREATE TABLE external_sources (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  source_url text NOT NULL,
  authority text NOT NULL CHECK (authority IN ('official', 'humanitarian', 'community', 'partner')),
  data_classification text NOT NULL CHECK (data_classification IN ('public_operational', 'public_aggregate', 'restricted_personal')),
  collection_mode text NOT NULL CHECK (collection_mode IN ('api', 'html_import', 'csv_import', 'manual', 'webhook')),
  crawl_delay_seconds integer NOT NULL DEFAULT 5 CHECK (crawl_delay_seconds >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_ingestion_runs (
  id uuid PRIMARY KEY,
  source_id text NOT NULL REFERENCES external_sources(id),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'unchanged', 'failed', 'quarantined')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  http_status integer,
  etag text,
  last_modified text,
  content_hash text CHECK (content_hash IS NULL OR char_length(content_hash) = 64),
  records_seen integer NOT NULL DEFAULT 0 CHECK (records_seen >= 0),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX source_ingestion_runs_latest_idx ON source_ingestion_runs(source_id, finished_at DESC);

CREATE TABLE source_records (
  id uuid PRIMARY KEY,
  source_id text NOT NULL REFERENCES external_sources(id),
  external_key text NOT NULL,
  record_type text NOT NULL CHECK (record_type IN ('incident_metric', 'service_point', 'official_contact', 'territory', 'source_claim')),
  observed_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  content_hash text NOT NULL CHECK (char_length(content_hash) = 64),
  active boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  UNIQUE (source_id, external_key)
);

CREATE INDEX source_records_type_active_idx ON source_records(record_type, active, last_seen_at DESC);

CREATE TABLE source_record_versions (
  id uuid PRIMARY KEY,
  source_record_id uuid NOT NULL REFERENCES source_records(id),
  ingestion_run_id uuid NOT NULL REFERENCES source_ingestion_runs(id),
  payload jsonb NOT NULL,
  content_hash text NOT NULL CHECK (char_length(content_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_record_id, content_hash)
);

CREATE TABLE case_source_claims (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  disaster_case_id uuid NOT NULL REFERENCES disaster_cases(id),
  source_id text NOT NULL REFERENCES external_sources(id),
  external_reference text NOT NULL,
  claim_status text NOT NULL DEFAULT 'reported'
    CHECK (claim_status IN ('reported', 'corroborated', 'validated', 'rejected', 'superseded')),
  consent_basis text,
  payload_encrypted bytea,
  payload_fingerprint text,
  reported_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_reference, disaster_case_id)
);

CREATE TABLE possible_case_matches (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  left_case_id uuid NOT NULL REFERENCES disaster_cases(id),
  right_case_id uuid NOT NULL REFERENCES disaster_cases(id),
  score numeric(5, 4) NOT NULL CHECK (score BETWEEN 0 AND 1),
  signals jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed', 'separated')),
  reviewed_by_actor_id uuid REFERENCES actors(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (left_case_id <> right_case_id),
  UNIQUE (incident_id, left_case_id, right_case_id)
);
