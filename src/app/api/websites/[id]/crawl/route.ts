import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { crawlRuns } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { checkRateLimit } from "@/lib/auth";
import { getPgErrorCode } from "@/lib/db/pg-error";
import { runCrawl } from "@/lib/crawler/run-crawl";

const idSchema = z.string().uuid();

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const site = await getWebsiteForUser(user.id, id);
  if (!site) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const rl = await checkRateLimit(user.id, "start_crawl");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many crawls started recently. Please try again later." },
      { status: 429 }
    );
  }

  // Fast pre-check for the common case (good UX, avoids a wasted insert
  // attempt) — the actual guarantee against two concurrent requests both
  // starting a crawl is the DB-level partial unique index on
  // crawl_runs(website_id) WHERE status IN ('pending','running'), enforced
  // below. A plain select-then-insert here would be a TOCTOU race.
  const [inProgress] = await db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, site.id), inArray(crawlRuns.status, ["pending", "running"])))
    .limit(1);

  if (inProgress) {
    return NextResponse.json(
      { error: "A crawl is already in progress for this website." },
      { status: 409 }
    );
  }

  let run;
  try {
    [run] = await db.insert(crawlRuns).values({ websiteId: site.id, status: "pending" }).returning();
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      return NextResponse.json(
        { error: "A crawl is already in progress for this website." },
        { status: 409 }
      );
    }
    throw err;
  }

  // Fire-and-forget: the crawl runs in-process (no separate worker/job
  // queue yet, per the master doc's "database-backed jobs first" guidance)
  // and updates crawl_runs as it progresses. The client polls for status.
  void runCrawl(run.id, {
    id: site.id,
    url: site.url,
    maxPages: site.maxPages,
    maxDepth: site.maxDepth,
  }).catch((err) => {
    console.error(`Crawl ${run.id} failed unexpectedly:`, err);
  });

  return NextResponse.json({ crawlRun: run }, { status: 201 });
}
