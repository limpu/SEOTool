import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { computeWebsiteEeat } from "@/lib/eeat/compute";

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

  const trust = await computeWebsiteEeat(site.id);

  return NextResponse.json({
    trust,
    disclaimer:
      "This Trust score checks for observable markers commonly associated with Google's public E-E-A-T guidance (author/date signals, About/Contact/Privacy pages, HTTPS) — it does NOT measure Google's actual internal E-E-A-T ranking signal, and finding these markers is not a guarantee of any ranking or AI-visibility outcome. About/Contact/Privacy detection is a URL/title pattern heuristic: an unconventionally-named page will not be detected, and a detected page's content is not verified for completeness or accuracy.",
  });
}
