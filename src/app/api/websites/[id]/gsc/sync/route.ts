import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { checkRateLimit } from "@/lib/auth";
import { runGscSync, GscNotConnectedError, GscNoPropertySelectedError } from "@/lib/gsc/sync";
import { GscApiError } from "@/lib/gsc/client";
import { GoogleTokenExchangeError } from "@/lib/gsc/oauth";

const idSchema = z.string().uuid();

/**
 * Explicitly user-triggered sync (not automatic on page load) — same
 * "explicit action, not refetch-on-every-view" discipline Phase 20 applies
 * to PageSpeed audits, to stay within Google's Search Analytics API quota.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const rl = await checkRateLimit(user.id, "gsc_sync");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many Search Console syncs started recently. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const result = await runGscSync(site.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof GscNotConnectedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof GscNoPropertySelectedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof GscApiError || err instanceof GoogleTokenExchangeError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}
