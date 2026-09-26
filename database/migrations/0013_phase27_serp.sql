CREATE TABLE "keyword_rank_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracked_keyword_id" uuid NOT NULL,
	"checked_by_user_id" uuid NOT NULL,
	"checked_date" varchar(10) NOT NULL,
	"position" integer,
	"serp_features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"added_by_user_id" uuid NOT NULL,
	"keyword" varchar(255) NOT NULL,
	"target_url" text,
	"country" varchar(10),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_keywords_website_keyword_country_unique" UNIQUE("website_id","keyword","country")
);
--> statement-breakpoint
ALTER TABLE "keyword_rank_checks" ADD CONSTRAINT "keyword_rank_checks_tracked_keyword_id_tracked_keywords_id_fk" FOREIGN KEY ("tracked_keyword_id") REFERENCES "public"."tracked_keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_rank_checks" ADD CONSTRAINT "keyword_rank_checks_checked_by_user_id_users_id_fk" FOREIGN KEY ("checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_keywords" ADD CONSTRAINT "tracked_keywords_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_keywords" ADD CONSTRAINT "tracked_keywords_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keyword_rank_checks_tracked_keyword_id_idx" ON "keyword_rank_checks" USING btree ("tracked_keyword_id");--> statement-breakpoint
CREATE INDEX "keyword_rank_checks_checked_date_idx" ON "keyword_rank_checks" USING btree ("checked_date");--> statement-breakpoint
CREATE INDEX "tracked_keywords_website_id_idx" ON "tracked_keywords" USING btree ("website_id");