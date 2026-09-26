import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { pages, websites } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { computePageScores } from "@/lib/scoring/compute";

const idSchema = z.string().uuid();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { pageId } = await params;
  if (!idSchema.safeParse(pageId).success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Ownership check via join, same pattern as the issues route.
  const [owned] = await db
    .select({ id: pages.id })
    .from(pages)
    .innerJoin(websites, eq(pages.websiteId, websites.id))
    .where(and(eq(pages.id, pageId), eq(websites.userId, user.id)))
    .limit(1);

  if (!owned) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const scores = await computePageScores(pageId);
  // These are proprietary product scores, not Google ranking scores and not
  // a guarantee of search-ranking correlation (master doc Section 79 #4/#5).
  return NextResponse.json({
    scores,
    disclaimer: "Proprietary product scores computed from this platform's own rule engines and Lighthouse audit data. Not an official Google ranking score and not a guarantee of search-ranking outcomes.",
  });
}
