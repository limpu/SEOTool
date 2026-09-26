-- Web Installer — Stage 1: the durable, server-side installation lock.
--
-- `/install` is allowed to create the FIRST SUPER_ADMIN. Until it is locked it
-- is therefore an unauthenticated remote admin-creation endpoint, and "no admin
-- exists yet" is NOT the protection — it is the attacker's window (the classic
-- WordPress-install race). Two independent controls close it:
--
--   1. an install token on disk + in the server log (proof the requester is the
--      operator) — see `src/lib/install/token.ts`;
--   2. THIS TABLE — the durable record that installation is finished, which the
--      route and every installer API check server-side before doing anything.
--
-- The lock lives in the database and nowhere else that matters, because the
-- database is the only store here that survives a container redeploy, is shared
-- by every replica, and cannot be cleared by the client. Deleting
-- `.install-token`, clearing a cookie, wiping localStorage, or rebuilding the
-- image must all leave `completed = true` untouched — and with the flag here,
-- they do.
--
-- SINGLETON: exactly one row, id = 1, enforced by a CHECK constraint. A second
-- row would be a second, contradictory answer to "is this platform installed",
-- which a security lock must never have.
--
-- Applied in this environment with:
--   docker exec -i seo-postgres psql -U seo_user -d seo_platform \
--     < database/migrations/0023_web_installer_state.sql
-- (`drizzle-kit migrate` has been unreliable in this project — see read.md.)

CREATE TABLE IF NOT EXISTS "installation_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"completed_by_user_id" uuid,
	"steps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"token_fingerprint" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "installation_state_singleton" CHECK ("id" = 1)
);--> statement-breakpoint

-- ON DELETE SET NULL, never CASCADE: deleting the user who completed the
-- installation must not delete the record that the installation is complete.
DO $$ BEGIN
	ALTER TABLE "installation_state"
		ADD CONSTRAINT "installation_state_completed_by_user_id_users_id_fk"
		FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- Seed the singleton as NOT complete. Doing this in the migration rather than
-- lazily at runtime means a fresh database has an authoritative "not installed"
-- answer from the moment the schema exists, so `readInstallationState()` can
-- treat "row missing" as a genuine anomaly instead of an ambiguous state.
INSERT INTO "installation_state" ("id", "completed")
VALUES (1, false)
ON CONFLICT ("id") DO NOTHING;
