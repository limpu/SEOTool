/**
 * Phase 37 — the shared auth chain for the site-file routes.
 *
 * Same four gates, in the same order, that every other authenticated write in
 * this codebase applies, and the same ones `requireWorkspacePage` applies to
 * the report pages these routes back:
 *
 *   1. authenticated                      → 401
 *   2. website id well-formed + OWNED     → 404 (never 403: a website the
 *                                           caller does not own must not be
 *                                           confirmed to exist)
 *   3. RBAC permission for the feature    → 404, matching the "hitting the
 *                                           route directly is also denied"
 *                                           rule the page guard documents
 *   4. package entitlement for it         → 403 upgrade-required
 *
 * Which feature is checked depends on the FILE TYPE, because these three file
 * kinds are surfaced by three different gated modules: sitemaps by Sitemap,
 * robots.txt by Robots.txt, llms.txt by AI Search Intelligence. A user
 * entitled to one is not thereby entitled to the others.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser, type Website } from "@/lib/websites/queries";
import { getWorkspaceItem } from "@/lib/website-workspace/nav";
import { getWorkspaceItemAccess } from "@/lib/website-workspace/access";
import type { SiteFileType } from "@/lib/site-files/fetch";

const idSchema = z.string().uuid();

/** The workspace module that owns each file type's report surface. */
export const SITE_FILE_MODULE_SLUG: Record<SiteFileType, string> = {
  sitemap_xml: "sitemap",
  sitemap_html: "sitemap",
  robots_txt: "robots",
  llms_txt: "ai-overview",
};

export type GuardResult =
  | { ok: true; userId: string; site: Website }
  | { ok: false; response: NextResponse };

export async function guardSiteFileRequest(
  websiteIdParam: string,
  type: SiteFileType
): Promise<GuardResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }

  if (!idSchema.safeParse(websiteIdParam).success) {
    return { ok: false, response: NextResponse.json({ error: "Website not found." }, { status: 404 }) };
  }

  const site = await getWebsiteForUser(user.id, websiteIdParam);
  if (!site) {
    return { ok: false, response: NextResponse.json({ error: "Website not found." }, { status: 404 }) };
  }

  const item = getWorkspaceItem(SITE_FILE_MODULE_SLUG[type]);
  if (!item || !item.implemented) {
    return { ok: false, response: NextResponse.json({ error: "Website not found." }, { status: 404 }) };
  }

  const access = await getWorkspaceItemAccess(user.id, item);
  if (!access.authorized) {
    return { ok: false, response: NextResponse.json({ error: "Website not found." }, { status: 404 }) };
  }
  if (!access.entitled) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Your current package does not include ${item.label}.` },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: user.id, site };
}
