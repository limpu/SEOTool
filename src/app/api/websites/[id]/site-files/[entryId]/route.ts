import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { siteFileTypeSchema } from "@/lib/validation/site-file";
import { guardSiteFileRequest } from "@/lib/site-files/guard";
import { deleteManualSiteFile } from "@/lib/site-files/queries";

const entryIdSchema = z.string().uuid();

/**
 * Phase 37 — DELETE /api/websites/[id]/site-files/[entryId]?type=…
 *
 * Removes ONE manually-added entry. `type` says which table the id belongs to
 * (sitemaps, robots.txt and llms.txt are stored separately, mirroring how each
 * is surfaced by a different module).
 *
 * A CRAWL-DISCOVERED entry can never be deleted here. That is not a UI-only
 * restriction: `deleteManualSiteFile` carries `source = 'manual'` inside its
 * WHERE clause, so a request naming a discovered row's id simply matches
 * nothing and returns 404. Discovered rows belong to the crawl that produced
 * them and are replaced by the next one; letting a user delete one would make
 * the report disagree with the crawl it claims to describe.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params;

  const parsedType = siteFileTypeSchema.safeParse(req.nextUrl.searchParams.get("type"));
  if (!parsedType.success) {
    return NextResponse.json({ error: "A valid file type is required." }, { status: 400 });
  }

  const guard = await guardSiteFileRequest(id, parsedType.data);
  if (!guard.ok) return guard.response;

  if (!entryIdSchema.safeParse(entryId).success) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  const deleted = await deleteManualSiteFile(guard.site.id, parsedType.data, entryId);
  if (!deleted) {
    return NextResponse.json(
      { error: "Entry not found, or it was added by a crawl and cannot be removed by hand." },
      { status: 404 }
    );
  }

  return NextResponse.json({ deleted: true });
}
