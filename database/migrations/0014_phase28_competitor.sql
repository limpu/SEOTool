ALTER TABLE "websites" ADD COLUMN "is_competitor" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN "competitor_for_website_id" uuid;
--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_competitor_for_website_id_websites_id_fk" FOREIGN KEY ("competitor_for_website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "websites_competitor_for_website_id_idx" ON "websites" USING btree ("competitor_for_website_id");
