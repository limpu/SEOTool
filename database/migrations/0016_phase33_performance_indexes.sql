CREATE INDEX "crawl_runs_website_status_created_idx" ON "crawl_runs" USING btree ("website_id","status","created_at");--> statement-breakpoint
CREATE INDEX "images_page_id_idx" ON "images" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "links_page_id_idx" ON "links" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "page_metrics_page_id_idx" ON "page_metrics" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "pages_crawl_run_id_idx" ON "pages" USING btree ("crawl_run_id");--> statement-breakpoint
CREATE INDEX "pages_website_id_idx" ON "pages" USING btree ("website_id");--> statement-breakpoint
CREATE INDEX "recommendations_issue_id_idx" ON "recommendations" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "schemas_page_id_idx" ON "schemas" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "seo_issues_page_id_idx" ON "seo_issues" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "seo_issues_rule_id_idx" ON "seo_issues" USING btree ("rule_id");