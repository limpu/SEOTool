CREATE TYPE "public"."pagespeed_strategy" AS ENUM('mobile', 'desktop');--> statement-breakpoint
CREATE TABLE "pagespeed_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"url" text NOT NULL,
	"strategy" "pagespeed_strategy" NOT NULL,
	"status" "crawl_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"performance_score" integer,
	"accessibility_score" integer,
	"best_practices_score" integer,
	"seo_score" integer,
	"lcp" real,
	"cls" real,
	"inp" real,
	"fcp" real,
	"tbt" real,
	"speed_index" real,
	"ttfb" real,
	"lighthouse_version" varchar(20),
	"raw_result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pagespeed_audits" ADD CONSTRAINT "pagespeed_audits_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pagespeed_audits_website_id_idx" ON "pagespeed_audits" USING btree ("website_id");--> statement-breakpoint
CREATE INDEX "pagespeed_audits_batch_id_idx" ON "pagespeed_audits" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pagespeed_audits_one_active_per_website_strategy" ON "pagespeed_audits" USING btree ("website_id","strategy") WHERE "pagespeed_audits"."status" IN ('pending', 'running');