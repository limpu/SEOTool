CREATE TYPE "public"."ai_task_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "ai_content_gap_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"page_id" uuid,
	"competitor_page_id" uuid,
	"requested_by_user_id" uuid NOT NULL,
	"status" "ai_task_status" DEFAULT 'pending' NOT NULL,
	"provider" varchar(50),
	"model" varchar(100),
	"prompt_version" varchar(20),
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"your_url" text,
	"competitor_url" text,
	"gaps" jsonb,
	"summary" text,
	"raw_response" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_page_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"status" "ai_task_status" DEFAULT 'pending' NOT NULL,
	"provider" varchar(50),
	"model" varchar(100),
	"prompt_version" varchar(20),
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"answerability" jsonb,
	"semantic_completeness" jsonb,
	"direct_answers" jsonb,
	"answer_completeness" jsonb,
	"raw_response" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_content_gap_analyses" ADD CONSTRAINT "ai_content_gap_analyses_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_content_gap_analyses" ADD CONSTRAINT "ai_content_gap_analyses_competitor_id_websites_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_content_gap_analyses" ADD CONSTRAINT "ai_content_gap_analyses_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_content_gap_analyses" ADD CONSTRAINT "ai_content_gap_analyses_competitor_page_id_pages_id_fk" FOREIGN KEY ("competitor_page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_content_gap_analyses" ADD CONSTRAINT "ai_content_gap_analyses_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_page_assessments" ADD CONSTRAINT "ai_page_assessments_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_page_assessments" ADD CONSTRAINT "ai_page_assessments_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_page_assessments" ADD CONSTRAINT "ai_page_assessments_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_content_gap_analyses_website_id_idx" ON "ai_content_gap_analyses" USING btree ("website_id");--> statement-breakpoint
CREATE INDEX "ai_content_gap_analyses_competitor_id_idx" ON "ai_content_gap_analyses" USING btree ("competitor_id");--> statement-breakpoint
CREATE INDEX "ai_page_assessments_page_id_idx" ON "ai_page_assessments" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "ai_page_assessments_website_id_idx" ON "ai_page_assessments" USING btree ("website_id");