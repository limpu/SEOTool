import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { computeWebsiteRecommendations } from "@/lib/recommendations/compute";

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

  const recommendations = await computeWebsiteRecommendations(site.id);

  // Section 79 #4/#5: describe what's technically wrong and why it matters
  // for crawlability/indexability/UX — never promise a ranking or AI-search
  // visibility outcome from implementing a recommendation.
  return NextResponse.json({
    recommendations,
    disclaimer:
      "These recommendations are prioritized by severity and by how many pages each issue affects, computed from this platform's own deterministic rule engines. They describe what is technically wrong and why it matters for crawlability, indexability, or user experience — implementing a recommendation is not a guarantee of improved search rankings or AI-search visibility.",
  });
}
