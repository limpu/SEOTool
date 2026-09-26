import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { getTrackedKeywordForWebsite, createRankCheck } from "@/lib/serp/queries";
import { isValidSerpFeature } from "@/lib/serp/constants";

const idSchema = z.string().uuid();

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date as YYYY-MM-DD.");

const createRankCheckSchema = z.object({
  checkedDate: dateSchema,
  // Manually entered position. Null/omitted means "checked, not found in
  // the results I looked at" — a deliberately distinct, still-meaningful
  // state from "never checked" (Section 79 — never default to a fabricated
  // number).
  position: z.number().int().min(1).max(200).nullable().optional(),
  serpFeatures: z.array(z.string()).max(20).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

/**
 * POST logs one manual rank-check observation for a tracked keyword. This
 * never calls out to Google or any search engine — every field here is
 * exactly what the user typed in, per Phase 27's scoping decision (see
 * read.md and the schema comment in `src/lib/db/schema/index.ts`).
 */
export async function POST(
  req: NextRequest,
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

  const body = await req.json().catch(() => null);
  const parsed = createRankCheckSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  const { checkedDate, position, serpFeatures = [], notes } = parsed.data;

  const invalidFeature = serpFeatures.find((f) => !isValidSerpFeature(f));
  if (invalidFeature) {
    return NextResponse.json(
      { error: `Unknown SERP feature: "${invalidFeature}".` },
      { status: 400 }
    );
  }

  const created = await createRankCheck({
    trackedKeywordId: keyword.id,
    checkedByUserId: user.id,
    checkedDate,
    position: position ?? null,
    serpFeatures,
    notes: notes ? notes : null,
  });

  return NextResponse.json({ rankCheck: created }, { status: 201 });
}
