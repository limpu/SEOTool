import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { getGa4Config, GA4_NOT_CONFIGURED_MESSAGE } from "@/lib/ga4/config";
import { buildGa4AuthUrl, signGa4OAuthState } from "@/lib/ga4/oauth";
import { isGa4TokenEncryptionConfigured } from "@/lib/ga4/crypto";

const idSchema = z.string().uuid();

/**
 * Starts the OAuth authorization-code flow: redirects the browser to
 * Google's consent screen for the Analytics read-only scope. GET (not
 * POST) because this route's whole job is to be the target of a normal
 * link/button navigation — mirrors src/app/api/websites/[id]/gsc/connect.
 */
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

  const config = getGa4Config();
  if (!config || !isGa4TokenEncryptionConfigured()) {
    return NextResponse.json({ error: GA4_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  const state = await signGa4OAuthState({
    websiteId: site.id,
    userId: user.id,
    nonce: randomBytes(16).toString("hex"),
  });

  const authUrl = buildGa4AuthUrl(config, state);
  return NextResponse.redirect(authUrl);
}
