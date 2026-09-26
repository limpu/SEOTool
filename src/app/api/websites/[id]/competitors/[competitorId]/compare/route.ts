import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser, getCompetitorForUser } from "@/lib/websites/queries";
import { computeCompetitorComparison } from "@/lib/competitor/queries";

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

  const comparison = await computeCompetitorComparison(site.id, site.name, competitor.id, competitor.name);

  return NextResponse.json({
    comparison,
    label: "Technical & Structural Comparison",
    disclaimer:
      "This compares real, deterministically-measured technical/structural signals from each site's most recent completed crawl (page count, average word/heading count, rule-based SEO issues, schema-type usage, this platform's own Technical/On-page/Performance/Overall scores, and GEO/AEO/AI Overview readiness scores). It is NOT a semantic/topical content-gap analysis — this platform does not claim to know what topics or keywords the competitor covers that you don't, since that requires understanding what a page is ABOUT, not just its HTML structure. True topical content-gap analysis is planned for the AI-integration phase (Phase 29+). If either site has no completed crawl yet, its numbers show as 0/not measured rather than a guessed value.",
  });
}
