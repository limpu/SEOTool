import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { computeWebsiteAiSearch } from "@/lib/ai-search/compute";

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

  const readiness = await computeWebsiteAiSearch(site.id);

  return NextResponse.json({
    readiness,
    disclaimer:
      "GEO/AEO/AI Overview Readiness are proprietary product scores computed from this platform's own deterministic content-structure analysis, based on the most recent completed crawl. They are readiness/optimization signals, not official search-engine metrics, and do not guarantee inclusion in any AI Overview, ChatGPT, Perplexity, or other generative-engine answer. Several sub-dimensions named in this platform's documentation are intentionally left unassessed (shown as \"Not measured\") because they require semantic/NLP judgment beyond deterministic markup analysis — see each dimension's evidence for details.",
  });
}
