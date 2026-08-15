-- Reconstruction phase: links damage cases to the material supply chain, adds a commercial
-- supplier directory, and an aggregate-only workforce directory. See docs/reconstruccion.md.

-- A supply need can now point at the specific reconstruction case (damaged household/building)
-- it belongs to, not just a zone — this is what lets a donation trace all the way to "these
-- bricks went to this household's rebuild", closing the loop the public report shows.
ALTER TABLE supply_needs
  ADD COLUMN disaster_case_id uuid REFERENCES disaster_cases(id);

CREATE INDEX supply_needs_disaster_case_idx ON supply_needs(disaster_case_id, status);

-- Commercial vendors selling reconstruction materials in the affected territory — distinct
-- from donation_commitments/organizations, which model giving, not selling. A supplier's
-- business identity (name, general contact) is institutional, not personal, so it's public
-- by default, same as warehouses/organizations elsewhere in this schema.
CREATE TABLE material_suppliers (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  territory_id uuid REFERENCES territories(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 180),
  location geometry(Point, 4326),
  address text CHECK (address IS NULL OR char_length(address) <= 300),
  public_contact text CHECK (public_contact IS NULL OR char_length(public_contact) <= 160),
  verification_level text NOT NULL DEFAULT 'reported'
    CHECK (verification_level IN ('reported', 'corroborated', 'verified')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  client_mutation_id uuid NOT NULL,
  source_ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, client_mutation_id)
);

CREATE INDEX material_suppliers_incident_status_idx ON material_suppliers(incident_id, status);
CREATE INDEX material_suppliers_location_gist ON material_suppliers USING gist(location);

-- What each supplier says it offers, from the shared material catalog, and at what price —
-- self-reported by the supplier, same trust posture as a community report (published
-- immediately as unverified, corroborated/verified later by operations).
CREATE TABLE supplier_catalog_offers (
  id uuid PRIMARY KEY,
  supplier_id uuid NOT NULL REFERENCES material_suppliers(id),
  catalog_item_id uuid NOT NULL REFERENCES material_catalog_items(id),
  unit text NOT NULL,
  unit_price numeric(14, 2) CHECK (unit_price IS NULL OR unit_price >= 0),
  currency char(3),
  available_quantity numeric(20, 6) CHECK (available_quantity IS NULL OR available_quantity >= 0),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'limited', 'unavailable')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, catalog_item_id)
);

CREATE INDEX supplier_catalog_offers_item_idx ON supplier_catalog_offers(catalog_item_id, status);

-- Skilled labor available for reconstruction (site leads, masons, electricians, ...).
-- Deliberately aggregate-only: no name or contact column. This project's rule is that
-- individual PII is never published without a real encryption/access-control mechanism, and
-- none exists yet for bytea contact columns (see the note on affected_people.contact_encrypted
-- and community_reports' contact handling). Until that exists, this table answers "how much
-- of which trade is available where", which is enough to plan reconstruction without ever
-- storing a worker's name or phone number. Matching a worker to a specific job is a follow-up
-- feature once secure contact storage/messaging exists.
CREATE TABLE workforce_profiles (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  territory_id uuid REFERENCES territories(id),
  role text NOT NULL CHECK (
    role IN (
      'site_lead', 'construction_master', 'mason', 'electrician', 'plumber',
      'carpenter', 'general_labor', 'other'
    )
  ),
  headcount integer NOT NULL DEFAULT 1 CHECK (headcount BETWEEN 1 AND 500),
  availability text NOT NULL DEFAULT 'available'
    CHECK (availability IN ('available', 'assigned', 'unavailable')),
  verification_level text NOT NULL DEFAULT 'reported'
    CHECK (verification_level IN ('reported', 'corroborated', 'verified')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  client_mutation_id uuid NOT NULL,
  source_ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, client_mutation_id)
);

CREATE INDEX workforce_profiles_incident_role_idx
  ON workforce_profiles(incident_id, role, availability);

-- Assigning available headcount from a workforce_profiles row to a specific reconstruction
-- case, without ever recording which individual went where.
CREATE TABLE workforce_assignments (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  workforce_profile_id uuid NOT NULL REFERENCES workforce_profiles(id),
  disaster_case_id uuid NOT NULL REFERENCES disaster_cases(id),
  headcount integer NOT NULL DEFAULT 1 CHECK (headcount BETWEEN 1 AND 500),
  role_on_case text NOT NULL CHECK (char_length(role_on_case) BETWEEN 2 AND 80),
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'active', 'completed', 'cancelled')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workforce_profile_id, disaster_case_id, role_on_case)
);

CREATE INDEX workforce_assignments_case_idx ON workforce_assignments(disaster_case_id, status);
