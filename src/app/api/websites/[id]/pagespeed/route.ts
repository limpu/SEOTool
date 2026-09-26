import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { checkRateLimit } from "@/lib/auth";
import { listPageSpeedBatches, startPageSpeedBatch, PageSpeedAlreadyRunningError } from "@/lib/pagespeed/run-audit";

const idSchema = z.string().uuid();
const bodySchema = z.object({ url: z.string().url().optional() });

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

  const rl = await checkRateLimit(user.id, "start_pagespeed");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many PageSpeed audits started recently. Please try again later." },
      { status: 429 }
    );
  }

  let url = site.url;
  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (parsed.success && parsed.data.url) {
    url = parsed.data.url;
  }

  try {
    const { batchId, audits } = await startPageSpeedBatch(site.id, url);
    return NextResponse.json({ batchId, audits }, { status: 201 });
  } catch (err) {
    if (err instanceof PageSpeedAlreadyRunningError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

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

  const batches = await listPageSpeedBatches(site.id);
  return NextResponse.json({ batches });
}
