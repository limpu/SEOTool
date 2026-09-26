import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { getTrackedKeywordForWebsite, deleteRankCheck } from "@/lib/serp/queries";

const idSchema = z.string().uuid();

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; keywordId: string; checkId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id, keywordId, checkId } = await params;
  if (
    !idSchema.safeParse(id).success ||
    !idSchema.safeParse(keywordId).success ||
    !idSchema.safeParse(checkId).success
  ) {
    return NextResponse.json({ error: "Rank check not found." }, { status: 404 });
  }

  const site = await getWebsiteForUser(user.id, id);
  if (!site) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const keyword = await getTrackedKeywordForWebsite(site.id, keywordId);
  if (!keyword) {
    return NextResponse.json({ error: "Keyword not found." }, { status: 404 });
  }

  await deleteRankCheck(keyword.id, checkId);
  return NextResponse.json({ success: true });
}
