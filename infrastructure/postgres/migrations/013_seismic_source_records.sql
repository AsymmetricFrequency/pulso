BEGIN;

ALTER TABLE source_records
  DROP CONSTRAINT source_records_record_type_check;

ALTER TABLE source_records
  ADD CONSTRAINT source_records_record_type_check
  CHECK (
    record_type IN (
      'incident_metric',
      'service_point',
      'official_contact',
      'territory',
      'source_claim',
      'seismic_event'
    )
  );

COMMIT;
