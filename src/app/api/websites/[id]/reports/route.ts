/**
 * Phase 30 — Reports export endpoint.
 *
 * GET /api/websites/[id]/reports?format=json|html|csv&csv=issues|scores|keywords
 *
 * Synchronous (see src/lib/reports/assemble.ts's file header for why) —
 * this is pure in-process data assembly over already-persisted rows, not an
 * expensive triggered job like a crawl/Lighthouse run, so there is nothing
 * to poll for. No rate limit is applied for the same reason every other
 * pure-read website-scoped route (Phase 22's /scores, Phase 23's
 * /recommendations) has none — this only reads data the user already owns.
 *
 * `format=csv` requires a `csv` query param naming which of the three
 * purpose-built CSVs to return (issues / scores / keywords) — see
 * src/lib/reports/csv.ts's file header for why three separate CSVs exist
 * rather than one flattened sheet.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { assembleWebsiteReport } from "@/lib/reports/assemble";
import { renderHtmlReport } from "@/lib/reports/html";
import { buildIssuesCsv, buildScoreHistoryCsv, buildKeywordsCsv } from "@/lib/reports/csv";

const idSchema = z.string().uuid();
const formatSchema = z.enum(["json", "html", "csv"]);
const csvTypeSchema = z.enum(["issues", "scores", "keywords"]);

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "website";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const searchParams = req.nextUrl.searchParams;
  const formatParsed = formatSchema.safeParse(searchParams.get("format") ?? "json");
  if (!formatParsed.success) {
    return NextResponse.json({ error: "Invalid format. Use json, html, or csv." }, { status: 400 });
  }
  const format = formatParsed.data;
  const filenameBase = `seo-report-${slug(site.domain)}-${new Date().toISOString().slice(0, 10)}`;

  if (format === "csv") {
    const csvTypeParsed = csvTypeSchema.safeParse(searchParams.get("csv") ?? "issues");
    if (!csvTypeParsed.success) {
      return NextResponse.json({ error: "Invalid csv type. Use issues, scores, or keywords." }, { status: 400 });
    }
    const csvType = csvTypeParsed.data;

    let csv: string;
    if (csvType === "scores") {
      csv = await buildScoreHistoryCsv(site.id);
    } else {
      const report = await assembleWebsiteReport(site);
      csv = csvType === "issues" ? buildIssuesCsv(report) : buildKeywordsCsv(report);
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}-${csvType}.csv"`,
      },
    });
  }

  const report = await assembleWebsiteReport(site);

  if (format === "html") {
    const html = renderHtmlReport(report);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.html"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(report, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameBase}.json"`,
    },
  });
}
