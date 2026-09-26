ALTER TABLE "pages" ADD COLUMN "headings_json" jsonb;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "list_count" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "ordered_list_count" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "unordered_list_count" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "table_count" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "definition_list_count" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "question_heading_count" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "has_faq_heading" boolean;