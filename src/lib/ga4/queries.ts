import { db } from "@/lib/db";
import { googleAnalyticsConnections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type Ga4ConnectionRow = typeof googleAnalyticsConnections.$inferSelect;

export async function getGa4Connection(websiteId: string): Promise<Ga4ConnectionRow | null> {
  const [row] = await db
    .select()
    .from(googleAnalyticsConnections)
    .where(eq(googleAnalyticsConnections.websiteId, websiteId))
    .limit(1);
  return row ?? null;
}

export async function deleteGa4Connection(websiteId: string): Promise<void> {
  await db.delete(googleAnalyticsConnections).where(eq(googleAnalyticsConnections.websiteId, websiteId));
}
