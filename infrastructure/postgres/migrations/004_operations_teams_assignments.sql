CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 180),
  organization_type text NOT NULL CHECK (
    organization_type IN ('community', 'ngo', 'government', 'company', 'volunteer_group', 'other')
  ),
  external_code text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX organizations_incident_status_idx ON organizations(incident_id, status);
CREATE UNIQUE INDEX organizations_incident_external_code_uidx
  ON organizations(incident_id, external_code)
  WHERE deleted_at IS NULL AND external_code IS NOT NULL;

CREATE TABLE actors (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  organization_id uuid REFERENCES organizations(id),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 120),
  actor_role text NOT NULL CHECK (
    actor_role IN (
      'citizen', 'field_worker', 'coordinator', 'professional', 'auditor', 'incident_admin'
    )
  ),
  external_subject text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX actors_incident_role_status_idx ON actors(incident_id, actor_role, status);
CREATE UNIQUE INDEX actors_incident_external_subject_uidx
  ON actors(incident_id, external_subject)
  WHERE deleted_at IS NULL AND external_subject IS NOT NULL;

CREATE TABLE teams (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX teams_incident_status_idx ON teams(incident_id, status);
CREATE UNIQUE INDEX teams_incident_name_uidx
  ON teams(incident_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE team_memberships (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  team_id uuid NOT NULL REFERENCES teams(id),
  actor_id uuid NOT NULL REFERENCES actors(id),
  responsibility text NOT NULL CHECK (responsibility IN ('leader', 'member', 'specialist')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX team_memberships_actor_idx ON team_memberships(actor_id, status);
CREATE UNIQUE INDEX team_memberships_active_uidx
  ON team_memberships(team_id, actor_id) WHERE status = 'active';

CREATE TABLE field_assignments (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  zone_id uuid NOT NULL REFERENCES operational_zones(id),
  team_id uuid NOT NULL REFERENCES teams(id),
  objective text NOT NULL CHECK (char_length(objective) BETWEEN 5 AND 500),
  starts_at timestamptz NOT NULL,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'assigned' CHECK (
    status IN ('assigned', 'accepted', 'in_progress', 'completed', 'cancelled')
  ),
  client_mutation_id uuid NOT NULL,
  accept_client_mutation_id uuid,
  accepted_by uuid REFERENCES actors(id),
  accepted_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (due_at IS NULL OR due_at >= starts_at),
  CHECK (
    (status = 'assigned' AND accepted_by IS NULL AND accepted_at IS NULL)
    OR status <> 'assigned'
  )
);

CREATE INDEX field_assignments_incident_status_time_idx
  ON field_assignments(incident_id, status, starts_at);
CREATE INDEX field_assignments_zone_status_idx ON field_assignments(zone_id, status);
CREATE INDEX field_assignments_team_status_idx ON field_assignments(team_id, status);
CREATE UNIQUE INDEX field_assignments_create_mutation_uidx
  ON field_assignments(incident_id, client_mutation_id);
CREATE UNIQUE INDEX field_assignments_accept_mutation_uidx
  ON field_assignments(incident_id, accept_client_mutation_id)
  WHERE accept_client_mutation_id IS NOT NULL;
