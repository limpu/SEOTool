import { NextRequest, NextResponse } from "next/server";
import { createWebsiteSchema, normalizeDomain } from "@/lib/validation/website";
import { db } from "@/lib/db";
import { websites } from "@/lib/db/schema";
import { getPgErrorCode } from "@/lib/db/pg-error";
import { getCurrentUser } from "@/lib/auth/current-user";
import { setActiveWebsiteId } from "@/lib/websites/active-website";
import { listUserWebsites } from "@/lib/websites/queries";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Phase 28: excludes competitor entries (isCompetitor = true) — they are
  // not the user's own properties and must never appear in this list/switcher.
  const sites = await listUserWebsites(user.id);
  return NextResponse.json({ websites: sites });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createWebsiteSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  const { name, url, country } = parsed.data;
  const domain = normalizeDomain(new URL(url).hostname);

  let created;
  try {
    [created] = await db
      .insert(websites)
      .values({ userId: user.id, name, url, domain, country: country ?? null })
      .returning();
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      return NextResponse.json(
        { error: "You've already added a website for this domain." },
        { status: 409 }
      );
    }
    throw err;
  }

  await setActiveWebsiteId(created.id);

  return NextResponse.json({ website: created }, { status: 201 });
}
