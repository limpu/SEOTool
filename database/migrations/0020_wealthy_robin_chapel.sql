CREATE TYPE "public"."backlink_check_status" AS ENUM('never', 'pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "backlink_audit_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"status" "backlink_check_status" DEFAULT 'never' NOT NULL,
	"property_url" text,
	"property_verified" boolean,
	"permission_level" varchar(50),
	"last_checked_at" timestamp,
	"last_checked_by_user_id" uuid,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backlink_audit_checks" ADD CONSTRAINT "backlink_audit_checks_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlink_audit_checks" ADD CONSTRAINT "backlink_audit_checks_last_checked_by_user_id_users_id_fk" FOREIGN KEY ("last_checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "backlink_audit_checks_website_id_unique" ON "backlink_audit_checks" USING btree ("website_id");