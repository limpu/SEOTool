import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { crawlRuns } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser, getCompetitorForUser } from "@/lib/websites/queries";
import { checkRateLimit } from "@/lib/auth";
import { getPgErrorCode } from "@/lib/db/pg-error";
import { runCrawl } from "@/lib/crawler/run-crawl";

const idSchema = z.string().uuid();

/**
 * Triggers a crawl of a COMPETITOR's own public website — not Google, not
 * any third party's search results. This is the same SSRF-safe crawler
 * pipeline (`runCrawl`, Phase 6) used for the user's own sites, invoked
 * verbatim against a `websites` row that happens to have `isCompetitor =
 * true`: same SSRF protections, same robots.txt compliance, same
 * politeness delay/concurrency — nothing is weakened because the target is
 * someone else's site (see read.md's Phase 28 write-up).
 */
export async function POST(
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

  const rl = await checkRateLimit(user.id, "start_crawl");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many crawls started recently. Please try again later." },
      { status: 429 }
    );
  }

  const [inProgress] = await db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, competitor.id), inArray(crawlRuns.status, ["pending", "running"])))
    .limit(1);

  if (inProgress) {
    return NextResponse.json(
      { error: "A crawl is already in progress for this competitor." },
      { status: 409 }
    );
  }

  let run;
  try {
    [run] = await db.insert(crawlRuns).values({ websiteId: competitor.id, status: "pending" }).returning();
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      return NextResponse.json(
        { error: "A crawl is already in progress for this competitor." },
        { status: 409 }
      );
    }
    throw err;
  }

  void runCrawl(run.id, {
    id: competitor.id,
    url: competitor.url,
    maxPages: competitor.maxPages,
    maxDepth: competitor.maxDepth,
  }).catch((err) => {
    console.error(`Competitor crawl ${run.id} failed unexpectedly:`, err);
  });

  return NextResponse.json({ crawlRun: run }, { status: 201 });
}
