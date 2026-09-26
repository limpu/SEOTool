-- Phase 37 — Site-level file CONTENT for Sitemap / Robots.txt / llms.txt.
--
-- Before this migration, `analyzeSitemaps()` and `fetchRobotsRules()` fetched
-- these files during a crawl, handed them to the rule engine, and discarded
-- them; only `seo_issues` rows survived. The Sitemap and Robots.txt reports
-- could therefore say "found" but could never show the file, its URL count,
-- or its contents. These tables persist the same shape `llms_files` (Phase 18)
-- already persisted for llms.txt.
--
-- `llms_files` itself gains `source` / `truncated` / `fetch_error` and a
-- NULLABLE `crawl_run_id`, so a user-added (manual) llms.txt — which belongs
-- to the website, not to any crawl run — can live in the existing table
-- instead of a duplicate one.

CREATE TYPE "public"."site_file_source" AS ENUM('discovered', 'manual');--> statement-breakpoint
CREATE TYPE "public"."sitemap_doc_kind" AS ENUM('xml', 'html');--> statement-breakpoint

CREATE TABLE "sitemap_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"crawl_run_id" uuid,
	"url" text NOT NULL,
	"kind" "sitemap_doc_kind" NOT NULL,
	"source" "site_file_source" DEFAULT 'discovered' NOT NULL,
	"found" boolean DEFAULT false NOT NULL,
	"http_status" integer,
	"raw_content" text,
	"size_bytes" integer,
	"url_count" integer,
	"is_index" boolean,
	"truncated" boolean DEFAULT false NOT NULL,
	"fetch_error" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "robots_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"crawl_run_id" uuid,
	"url" text NOT NULL,
	"source" "site_file_source" DEFAULT 'discovered' NOT NULL,
	"found" boolean DEFAULT false NOT NULL,
	"http_status" integer,
	"raw_content" text,
	"size_bytes" integer,
	"truncated" boolean DEFAULT false NOT NULL,
	"fetch_error" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "sitemap_documents" ADD CONSTRAINT "sitemap_documents_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sitemap_documents" ADD CONSTRAINT "sitemap_documents_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robots_files" ADD CONSTRAINT "robots_files_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "robots_files" ADD CONSTRAINT "robots_files_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "sitemap_documents_website_id_idx" ON "sitemap_documents" USING btree ("website_id");--> statement-breakpoint
CREATE INDEX "sitemap_documents_crawl_run_id_idx" ON "sitemap_documents" USING btree ("crawl_run_id");--> statement-breakpoint
CREATE INDEX "robots_files_website_id_idx" ON "robots_files" USING btree ("website_id");--> statement-breakpoint
CREATE INDEX "robots_files_crawl_run_id_idx" ON "robots_files" USING btree ("crawl_run_id");--> statement-breakpoint

-- One manual entry per (website, url) per table — a user re-adding the same
-- URL updates the existing row rather than accumulating duplicates. Partial,
-- so crawl-discovered rows (one set per run) are unaffected.
CREATE UNIQUE INDEX "sitemap_documents_manual_unique" ON "sitemap_documents" USING btree ("website_id","url") WHERE "source" = 'manual';--> statement-breakpoint
CREATE UNIQUE INDEX "robots_files_manual_unique" ON "robots_files" USING btree ("website_id","url") WHERE "source" = 'manual';--> statement-breakpoint

ALTER TABLE "llms_files" ALTER COLUMN "crawl_run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "llms_files" ADD COLUMN "source" "site_file_source" DEFAULT 'discovered' NOT NULL;--> statement-breakpoint
ALTER TABLE "llms_files" ADD COLUMN "truncated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "llms_files" ADD COLUMN "fetch_error" text;--> statement-breakpoint
CREATE UNIQUE INDEX "llms_files_manual_unique" ON "llms_files" USING btree ("website_id","url") WHERE "source" = 'manual';
