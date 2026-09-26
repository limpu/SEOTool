CREATE TYPE "public"."package_upgrade_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "package_upgrade_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"current_package_id" uuid,
	"requested_package_id" uuid NOT NULL,
	"status" "package_upgrade_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" uuid
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_line1" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_line2" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "city" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "state" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "postal_code" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_country" varchar(2);--> statement-breakpoint
ALTER TABLE "package_upgrade_requests" ADD CONSTRAINT "package_upgrade_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_upgrade_requests" ADD CONSTRAINT "package_upgrade_requests_current_package_id_packages_id_fk" FOREIGN KEY ("current_package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_upgrade_requests" ADD CONSTRAINT "package_upgrade_requests_requested_package_id_packages_id_fk" FOREIGN KEY ("requested_package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_upgrade_requests" ADD CONSTRAINT "package_upgrade_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "package_upgrade_requests_user_id_idx" ON "package_upgrade_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "package_upgrade_requests_status_idx" ON "package_upgrade_requests" USING btree ("status");