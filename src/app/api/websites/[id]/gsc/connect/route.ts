import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { getGscConfig, GSC_NOT_CONFIGURED_MESSAGE } from "@/lib/gsc/config";
import { buildAuthUrl, signOAuthState } from "@/lib/gsc/oauth";
import { isTokenEncryptionConfigured } from "@/lib/gsc/crypto";

const idSchema = z.string().uuid();

/**
 * Starts the OAuth authorization-code flow: redirects the browser to
 * Google's consent screen. GET (not POST) because this route's whole job
 * is to be the target of a normal link/button navigation.
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

  const config = getGscConfig();
  if (!config || !isTokenEncryptionConfigured()) {
    return NextResponse.json({ error: GSC_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  const state = await signOAuthState({
    websiteId: site.id,
    userId: user.id,
    nonce: randomBytes(16).toString("hex"),
  });

  const authUrl = buildAuthUrl(config, state);
  return NextResponse.redirect(authUrl);
}
