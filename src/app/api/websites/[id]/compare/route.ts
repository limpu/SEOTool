/**
 * Phase 31 — Re-test (Before/After comparison) endpoint.
 *
 * GET /api/websites/[id]/compare
 *   - no query params -> default pair: most recent completed crawl run vs.
 *     the completed run immediately before it (`resolveDefaultRunPair`).
 *   - ?baseline=<crawlRunId>&current=<crawlRunId> -> an explicit pair, both
 *     of which must belong to this website and be `completed` (lets the
 *     caller compare further back than just the immediately prior run).
 *
 * Synchronous, same reasoning as Phase 30's /reports route: this is pure
 * in-process comparison over already-persisted `seo_issues`/`pagespeed_audits`
 * rows via already-existing compute functions (Phase 22's
 * `computeCrawlRunScores`, called twice) — nothing expensive to poll for, no
 * new DB table, no rate limit (matches every other pure-read website-scoped
 * route: Phase 22 /scores, Phase 23 /recommendations, Phase 30 /reports).
 *
 * Honest "not enough data" handling (master doc Section 79, and this
 * phase's own explicit requirement): a website with fewer than 2 completed
 * crawl runs gets a 200 with `available: false` and a clear reason, not a
 * 500 and not a fabricated comparison against nothing.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { getCompletedCrawlRunForWebsite, listCompletedCrawlRuns, resolveDefaultRunPair, computeRetestComparison } from "@/lib/retest/queries";

const idSchema = z.string().uuid();
const crawlRunIdSchema = z.string().uuid();

const DISCLAIMER =
  "Proprietary product before/after comparison computed from this platform's own rule engines, scoring formula, and (where available) Lighthouse audit data across two of this website's own crawl runs. Not an official Google ranking score and not a guarantee that implementing a recommendation improves search-ranking or AI-search outcomes.";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { searchParams } = new URL(req.url);
  const baselineParam = searchParams.get("baseline");
  const currentParam = searchParams.get("current");

  let baseline: { id: string; completedAt: Date | null } | null = null;
  let current: { id: string; completedAt: Date | null } | null = null;

  if (baselineParam || currentParam) {
    if (!baselineParam || !currentParam) {
      return NextResponse.json({ error: "Both `baseline` and `current` crawl run IDs must be provided together, or neither (to use the default most-recent-pair)." }, { status: 400 });
    }
    if (!crawlRunIdSchema.safeParse(baselineParam).success || !crawlRunIdSchema.safeParse(currentParam).success) {
      return NextResponse.json({ error: "`baseline` and `current` must be valid crawl run IDs." }, { status: 400 });
    }
    if (baselineParam === currentParam) {
      return NextResponse.json({ error: "`baseline` and `current` must be two different crawl runs." }, { status: 400 });
    }

    const [baselineRun, currentRun] = await Promise.all([
      getCompletedCrawlRunForWebsite(site.id, baselineParam),
      getCompletedCrawlRunForWebsite(site.id, currentParam),
    ]);

    if (!baselineRun || !currentRun) {
      return NextResponse.json(
        { error: "Both crawl runs must belong to this website and be completed. One or both were not found or are not yet completed." },
        { status: 404 },
      );
    }
    baseline = baselineRun;
    current = currentRun;
  } else {
    const pair = await resolveDefaultRunPair(site.id);
    if (!pair) {
      const completedRuns = await listCompletedCrawlRuns(site.id);
      return NextResponse.json({
        available: false,
        reason:
          completedRuns.length === 0
            ? "Re-test comparison requires at least 2 completed crawls — this website has no completed crawl yet. Run a crawl to establish a baseline."
            : "Re-test comparison requires at least 2 completed crawls — run another crawl to compare against this baseline.",
        completedCrawlRunCount: completedRuns.length,
        disclaimer: DISCLAIMER,
      });
    }
    const [baselineRun, currentRun] = await Promise.all([
      getCompletedCrawlRunForWebsite(site.id, pair.baselineCrawlRunId),
      getCompletedCrawlRunForWebsite(site.id, pair.currentCrawlRunId),
    ]);
    baseline = baselineRun;
    current = currentRun;
  }

  if (!baseline || !current) {
    // Defensive — should be unreachable given the checks above, but never
    // silently proceed with a half-resolved pair.
    return NextResponse.json({ error: "Could not resolve both crawl runs to compare." }, { status: 404 });
  }

  const comparison = await computeRetestComparison(site.id, baseline, current);

  return NextResponse.json({
    available: true,
    ...comparison,
    disclaimer: DISCLAIMER,
  });
}
