CREATE TYPE "public"."llms_file_kind" AS ENUM('llms_txt', 'llms_full_txt');--> statement-breakpoint
CREATE TABLE "llms_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"crawl_run_id" uuid NOT NULL,
	"kind" "llms_file_kind" NOT NULL,
	"url" text NOT NULL,
	"found" boolean DEFAULT false NOT NULL,
	"http_status" integer,
	"raw_content" text,
	"size_bytes" integer,
	"title" text,
	"summary" text,
	"sections" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llms_files" ADD CONSTRAINT "llms_files_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llms_files" ADD CONSTRAINT "llms_files_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE cascade ON UPDATE no action;