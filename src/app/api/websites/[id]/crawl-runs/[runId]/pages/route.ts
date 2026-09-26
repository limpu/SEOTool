import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { crawlRuns, pages, seoIssues } from "@/lib/db/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";

const idSchema = z.string().uuid();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id, runId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(runId).success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const site = await getWebsiteForUser(user.id, id);
  if (!site) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const [run] = await db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.id, runId), eq(crawlRuns.websiteId, site.id)))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const crawledPages = await db
    .select({
      id: pages.id,
      url: pages.url,
      statusCode: pages.statusCode,
      contentType: pages.contentType,
      title: pages.title,
      wordCount: pages.wordCount,
      responseTime: pages.responseTime,
      pageSize: pages.pageSize,
    })
    .from(pages)
    .where(eq(pages.crawlRunId, runId))
    .orderBy(pages.createdAt);

  const pageIds = crawledPages.map((p) => p.id);
  const issueCounts =
    pageIds.length > 0
      ? await db
          .select({ pageId: seoIssues.pageId, count: count() })
          .from(seoIssues)
          .where(inArray(seoIssues.pageId, pageIds))
          .groupBy(seoIssues.pageId)
      : [];
  const issueCountByPage = new Map(issueCounts.map((r) => [r.pageId, r.count]));

  return NextResponse.json({
    pages: crawledPages.map((p) => ({ ...p, issueCount: issueCountByPage.get(p.id) ?? 0 })),
  });
}
