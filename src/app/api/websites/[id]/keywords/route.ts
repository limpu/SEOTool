import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { getPgErrorCode } from "@/lib/db/pg-error";
import { createTrackedKeyword, listTrackedKeywords, findGscQueryMatch } from "@/lib/serp/queries";
import { getLatestGscMetrics } from "@/lib/gsc/queries";

const idSchema = z.string().uuid();

const createKeywordSchema = z.object({
  keyword: z.string().trim().min(1, "Please enter a keyword.").max(255),
  targetUrl: z.string().trim().url("Enter a valid URL.").max(2048).optional().or(z.literal("")),
  country: z.string().trim().max(10).optional().or(z.literal("")),
});

/**
 * Phase 27 — SERP. Lists tracked keywords for a website, each annotated with
 * its live GSC cross-reference (if a connection + sync exist) so the UI can
 * show real Google-sourced position data alongside manual entries without a
 * separate round trip per keyword.
 */
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

  const keywords = await listTrackedKeywords(site.id);
  // Phase 33 — Performance Optimization: `getLatestGscMetrics` was being
  // re-fetched (a full, unfiltered-by-syncId `gsc_metrics` select) once per
  // tracked keyword via `matchKeywordToGsc` — a real N+1, since GSC metrics
  // don't vary per keyword. Fetched once here and joined per keyword
  // in-memory via the already-factored-out pure `findGscQueryMatch()`.
  const gscData = await getLatestGscMetrics(site.id);
  const withGsc = keywords.map((k) => ({
    ...k,
    gsc: gscData.syncId
      ? findGscQueryMatch(gscData.queries, k.keyword, gscData.dateRangeStart as string, gscData.dateRangeEnd as string)
      : null,
  }));

  return NextResponse.json({ keywords: withGsc });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const body = await req.json().catch(() => null);
  const parsed = createKeywordSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  const { keyword, targetUrl, country } = parsed.data;

  let created;
  try {
    created = await createTrackedKeyword({
      websiteId: site.id,
      addedByUserId: user.id,
      keyword,
      targetUrl: targetUrl ? targetUrl : null,
      country: country ? country : null,
    });
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      return NextResponse.json(
        { error: "You're already tracking this keyword (and country) for this website." },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ keyword: created }, { status: 201 });
}
