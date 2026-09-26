CREATE TABLE "google_analytics_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"google_account_id" varchar(255),
	"google_account_email" varchar(255),
	"scope" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp NOT NULL,
	"property_id" text,
	"property_name" text,
	"measurement_id" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_analytics_connections" ADD CONSTRAINT "google_analytics_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_analytics_connections" ADD CONSTRAINT "google_analytics_connections_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ga4_connections_website_id_unique" ON "google_analytics_connections" USING btree ("website_id");