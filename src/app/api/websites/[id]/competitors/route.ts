import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { websites } from "@/lib/db/schema";
import { getPgErrorCode } from "@/lib/db/pg-error";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser, listCompetitorsForWebsite } from "@/lib/websites/queries";
import { normalizeDomain } from "@/lib/validation/website";
import { addCompetitorSchema } from "@/lib/validation/competitor";

const idSchema = z.string().uuid();

// A competitor crawl is supplementary comparison data, not the user's own
// property audit — kept deliberately lighter than the default owned-site
// budget (100 pages / depth 3) so a "just compare" action stays fast and
// doesn't hammer a third party's site any harder than necessary.
const COMPETITOR_DEFAULT_MAX_PAGES = 50;
const COMPETITOR_DEFAULT_MAX_DEPTH = 2;

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

  const competitors = await listCompetitorsForWebsite(user.id, site.id);
  return NextResponse.json({ competitors });
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
  const parsed = addCompetitorSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  const { name, url } = parsed.data;
  const domain = normalizeDomain(new URL(url).hostname);

  // A competitor entry is a `websites` row with isCompetitor=true — reusing
  // the crawl pipeline (run-crawl.ts), scoring (Phase 22), and
  // recommendation/issue aggregation (Phase 23) verbatim. Known limitation
  // (documented in read.md): the pre-existing `websites_user_domain_unique`
  // constraint is global per user (not scoped to competitorForWebsiteId), so
  // the same competitor domain can only be registered once per user across
  // ALL of their properties, not once per (owned site, competitor) pair —
  // deliberately left as-is rather than widening the constraint, since a
  // nullable third column would also weaken the existing owned-site
  // duplicate-domain guarantee (Postgres treats NULLs as distinct in unique
  // indexes).
  let created;
  try {
    [created] = await db
      .insert(websites)
      .values({
        userId: user.id,
        name,
        url,
        domain,
        country: site.country,
        maxPages: COMPETITOR_DEFAULT_MAX_PAGES,
        maxDepth: COMPETITOR_DEFAULT_MAX_DEPTH,
        isCompetitor: true,
        competitorForWebsiteId: site.id,
      })
      .returning();
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      return NextResponse.json(
        { error: "This competitor domain is already registered against this website." },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ competitor: created }, { status: 201 });
}
