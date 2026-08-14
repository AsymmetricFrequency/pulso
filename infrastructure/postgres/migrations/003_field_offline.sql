ALTER TABLE field_visits
  ADD COLUMN device_id text,
  ADD COLUMN client_mutation_id uuid,
  ADD COLUMN status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed'));

UPDATE field_visits
SET device_id = 'legacy-import', client_mutation_id = id
WHERE device_id IS NULL OR client_mutation_id IS NULL;

ALTER TABLE field_visits
  ALTER COLUMN device_id SET NOT NULL,
  ALTER COLUMN client_mutation_id SET NOT NULL,
  ALTER COLUMN result DROP NOT NULL,
  ALTER COLUMN result DROP DEFAULT;

UPDATE field_visits SET result = NULL WHERE result = 'in_progress';

CREATE UNIQUE INDEX field_visits_incident_mutation_uidx
  ON field_visits(incident_id, client_mutation_id);

CREATE TABLE sync_receipts (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  device_id text NOT NULL,
  client_mutation_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  response jsonb NOT NULL,
  UNIQUE (incident_id, client_mutation_id)
);

CREATE INDEX sync_receipts_device_time_idx
  ON sync_receipts(device_id, received_at DESC);
