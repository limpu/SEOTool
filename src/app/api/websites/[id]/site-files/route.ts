import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/auth";
import { addSiteFileSchema } from "@/lib/validation/site-file";
import { guardSiteFileRequest } from "@/lib/site-files/guard";
import { upsertManualSiteFile } from "@/lib/site-files/queries";
import { isFetchable } from "@/lib/site-files/fetch";

/**
 * Phase 37 — POST /api/websites/[id]/site-files
 *
 * Manually add (or re-fetch) ONE site-level file URL: an XML sitemap, an HTML
 * sitemap, a robots.txt, or an llms.txt.
 *
 * ─── Why this route is written defensively ──────────────────────────────────
 *
 * It accepts a URL from a user and makes this server fetch it. That is an SSRF
 * vector and, unbounded, an open proxy. Four things stand between the two:
 *
 *   • The auth chain (`guardSiteFileRequest`): authenticated → owns this
 *     website → has the RBAC permission for the module that owns this file
 *     type → is entitled to it under their package.
 *   • Zod validation: http/https only, length-bounded.
 *   • A rate limit (`add_site_file`), so an authorised user still cannot turn
 *     the endpoint into a request cannon aimed at a third party.
 *   • `safeFetch`, reached ONLY via `fetchSiteFile` — DNS-pinned, rejecting
 *     private/loopback/link-local/metadata addresses, re-validating every
 *     redirect hop, with a timeout and a byte cap.
 *
 * A refused target is reported honestly ("not permitted / not reachable") and
 * is never retried down some other path. The row is still stored, because
 * "this address could not be reached" is a real, dated finding the user asked
 * for — not a silent no-op.
 *
 * An HTML sitemap is stored WITHOUT any fetch at all: it is a human-readable
 * page, not a machine-readable index, so it is recorded as a link and nothing
 * more (see `isFetchable`).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = addSiteFileSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  const { type, url } = parsed.data;

  const guard = await guardSiteFileRequest(id, type);
  if (!guard.ok) return guard.response;

  // Only the fetching variants consume the outbound-request budget; recording
  // an HTML sitemap link touches nothing but this database.
  if (isFetchable(type)) {
    const rl = await checkRateLimit(guard.userId, "add_site_file");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many files added recently. Please try again later." },
        { status: 429, headers: rl.retryAfterSeconds ? { "Retry-After": String(rl.retryAfterSeconds) } : undefined }
      );
    }
  }

  const result = await upsertManualSiteFile(guard.site.id, type, url);

  return NextResponse.json({ entry: result.entry, fetchError: result.fetchError }, { status: 201 });
}
