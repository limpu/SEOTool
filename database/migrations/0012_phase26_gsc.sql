CREATE TYPE "public"."gsc_dimension" AS ENUM('query', 'page');--> statement-breakpoint
CREATE TYPE "public"."gsc_sync_status" AS ENUM('never', 'pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "gsc_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"connected_by_user_id" uuid NOT NULL,
	"property_url" text,
	"google_account_email" varchar(255),
	"scope" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"access_token_expires_at" timestamp NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"last_sync_status" "gsc_sync_status" DEFAULT 'never' NOT NULL,
	"last_sync_started_at" timestamp,
	"last_sync_completed_at" timestamp,
	"last_sync_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gsc_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"sync_id" uuid NOT NULL,
	"dimension_type" "gsc_dimension" NOT NULL,
	"dimension_value" text NOT NULL,
	"clicks" integer NOT NULL,
	"impressions" integer NOT NULL,
	"ctr" real NOT NULL,
	"position" real NOT NULL,
	"date_range_start" varchar(10) NOT NULL,
	"date_range_end" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gsc_connections" ADD CONSTRAINT "gsc_connections_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_connections" ADD CONSTRAINT "gsc_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_metrics" ADD CONSTRAINT "gsc_metrics_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gsc_connections_website_id_unique" ON "gsc_connections" USING btree ("website_id");--> statement-breakpoint
CREATE INDEX "gsc_metrics_website_id_idx" ON "gsc_metrics" USING btree ("website_id");--> statement-breakpoint
CREATE INDEX "gsc_metrics_sync_id_idx" ON "gsc_metrics" USING btree ("sync_id");