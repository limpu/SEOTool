-- Removes the Backlink Audit module (added in 0020_wealthy_robin_chapel.sql).
-- The module was removed: Google Search Console's public API has no
-- backlink/links resource, so the feature could only ever render a
-- connection-verification check with every real backlink metric shown as
-- "Unavailable" — the user decided this was not useful and asked for full
-- removal. See read.md for the removal write-up.
DROP TABLE IF EXISTS "backlink_audit_checks";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."backlink_check_status";
