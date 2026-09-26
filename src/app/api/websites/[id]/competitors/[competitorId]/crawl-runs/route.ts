import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { crawlRuns } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser, getCompetitorForUser } from "@/lib/websites/queries";

const idSchema = z.string().uuid();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; competitorId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id, competitorId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(competitorId).success) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }

  const site = await getWebsiteForUser(user.id, id);
  if (!site) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const competitor = await getCompetitorForUser(user.id, site.id, competitorId);
  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }

  const runs = await db
    .select()
    .from(crawlRuns)
    .where(eq(crawlRuns.websiteId, competitor.id))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(10);

  return NextResponse.json({ crawlRuns: runs });
}
