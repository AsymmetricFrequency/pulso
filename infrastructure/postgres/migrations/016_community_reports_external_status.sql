ALTER TABLE community_reports
  DROP CONSTRAINT community_reports_check1;

ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_review_consistency_ck
  CHECK (
    (status = 'reported' AND reviewed_at IS NULL AND reviewed_by_actor_id IS NULL)
    OR (status <> 'reported' AND external_source_id IS NOT NULL)
    OR (status <> 'reported' AND reviewed_by_actor_id IS NOT NULL AND reviewed_at IS NOT NULL)
  );
