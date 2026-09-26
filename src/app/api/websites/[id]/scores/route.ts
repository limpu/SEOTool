import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { computeWebsiteScores } from "@/lib/scoring/compute";

const idSchema = z.string().uuid();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const scores = await computeWebsiteScores(site.id);
  // These are proprietary product scores, not Google ranking scores and not
  // a guarantee of search-ranking correlation (master doc Section 79 #4/#5).
  return NextResponse.json({
    scores,
    disclaimer: "Proprietary product scores computed from this platform's own rule engines and Lighthouse audit data, based on the most recent completed crawl. Not an official Google ranking score and not a guarantee of search-ranking outcomes.",
  });
}
