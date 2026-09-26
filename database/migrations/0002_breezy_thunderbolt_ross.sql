ALTER TABLE "websites" ADD COLUMN "max_pages" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN "max_depth" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
CREATE INDEX "websites_user_id_idx" ON "websites" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_user_domain_unique" UNIQUE("user_id","domain");