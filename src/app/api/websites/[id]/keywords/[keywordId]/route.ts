import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import {
  buildTrend,
  deleteTrackedKeyword,
  getTrackedKeywordForWebsite,
  listRankChecks,
  matchKeywordToGsc,
} from "@/lib/serp/queries";

const idSchema = z.string().uuid();

/** Keyword detail: the keyword itself, its manual rank-check history, its live GSC cross-reference (if any), and a shaped position-over-time trend combining both sources (each point labeled with its real source). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; keywordId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id, keywordId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(keywordId).success) {
    return NextResponse.json({ error: "Keyword not found." }, { status: 404 });
  }

  const site = await getWebsiteForUser(user.id, id);
  if (!site) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const keyword = await getTrackedKeywordForWebsite(site.id, keywordId);
  if (!keyword) {
    return NextResponse.json({ error: "Keyword not found." }, { status: 404 });
  }

  const [rankChecks, gsc] = await Promise.all([
    listRankChecks(keyword.id),
    matchKeywordToGsc(site.id, keyword.keyword),
  ]);

  return NextResponse.json({
    keyword,
    rankChecks,
    gsc,
    trend: buildTrend(rankChecks, gsc),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; keywordId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id, keywordId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(keywordId).success) {
    return NextResponse.json({ error: "Keyword not found." }, { status: 404 });
  }

  const site = await getWebsiteForUser(user.id, id);
  if (!site) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const keyword = await getTrackedKeywordForWebsite(site.id, keywordId);
  if (!keyword) {
    return NextResponse.json({ error: "Keyword not found." }, { status: 404 });
  }

  await deleteTrackedKeyword(site.id, keywordId);
  return NextResponse.json({ success: true });
}
