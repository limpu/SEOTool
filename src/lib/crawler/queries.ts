import { db } from "@/lib/db";
import { crawlRuns } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function listCrawlRuns(websiteId: string) {
  return db
    .select()
    .from(crawlRuns)
    .where(eq(crawlRuns.websiteId, websiteId))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(10);
}
