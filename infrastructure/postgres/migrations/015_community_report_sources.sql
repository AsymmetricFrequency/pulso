ALTER TABLE community_reports
  ADD COLUMN external_source_id text REFERENCES external_sources(id),
  ADD COLUMN external_key text;

ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_external_ref_ck
  CHECK (
    (external_source_id IS NULL AND external_key IS NULL)
    OR (external_source_id IS NOT NULL AND external_key IS NOT NULL)
  );

CREATE UNIQUE INDEX community_reports_external_source_key_uidx
  ON community_reports(external_source_id, external_key)
  WHERE external_source_id IS NOT NULL;
