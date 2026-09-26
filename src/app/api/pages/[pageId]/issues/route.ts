import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { pages, seoIssues, websites } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";

const idSchema = z.string().uuid();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { pageId } = await params;
  if (!idSchema.safeParse(pageId).success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Ownership check via join: the page must belong to a website owned by this user.
  const [owned] = await db
    .select({ id: pages.id })
    .from(pages)
    .innerJoin(websites, eq(pages.websiteId, websites.id))
    .where(and(eq(pages.id, pageId), eq(websites.userId, user.id)))
    .limit(1);

  if (!owned) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const issues = await db
    .select({
      id: seoIssues.id,
      severity: seoIssues.severity,
      title: seoIssues.title,
      description: seoIssues.description,
      evidence: seoIssues.evidence,
    })
    .from(seoIssues)
    .where(eq(seoIssues.pageId, pageId))
    .orderBy(seoIssues.createdAt);

  return NextResponse.json({ issues });
}
