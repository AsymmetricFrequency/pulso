-- Workforce registration is voluntary self-disclosure for a stated purpose ("so Operations can
-- reach me about a reconstruction assignment") — unlike third-party data scraped without the
-- subject's knowledge, so it's appropriate to actually store an identity here, encrypted at
-- rest. See apps/api/src/field-encryption.ts and docs/27-reconstruction-supply-chain.md.
ALTER TABLE workforce_profiles
  ADD COLUMN display_name_encrypted bytea NOT NULL,
  ADD COLUMN contact_encrypted bytea;
