import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateWebsiteSchema } from "@/lib/validation/website";
import { db } from "@/lib/db";
import { websites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { clearActiveWebsiteId, getActiveWebsiteId } from "@/lib/websites/active-website";

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

  return NextResponse.json({ website: site });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const existing = await getWebsiteForUser(user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateWebsiteSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  const { name, country, maxPages, maxDepth } = parsed.data;

  const [updated] = await db
    .update(websites)
    .set({ name, country: country ?? null, maxPages, maxDepth, updatedAt: new Date() })
    .where(eq(websites.id, id))
    .returning();

  return NextResponse.json({ website: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const existing = await getWebsiteForUser(user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  await db.delete(websites).where(eq(websites.id, id));

  const activeId = await getActiveWebsiteId();
  if (activeId === id) {
    await clearActiveWebsiteId();
  }

  return NextResponse.json({ success: true });
}
