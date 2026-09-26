import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gscConnections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { getGscConnection } from "@/lib/gsc/queries";
import { ensureFreshAccessToken } from "@/lib/gsc/sync";
import { fetchGscSites, GscApiError } from "@/lib/gsc/client";
import { parseSitesListResponse } from "@/lib/gsc/parse";

const idSchema = z.string().uuid();
const bodySchema = z.object({ propertyUrl: z.string().min(1) });

/** Lists the connected Google account's verified Search Console properties (live call). */
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

  const connection = await getGscConnection(site.id);
  if (!connection) {
    return NextResponse.json({ error: "Google Search Console is not connected for this website." }, { status: 409 });
  }

  try {
    const accessToken = await ensureFreshAccessToken(connection);
    const json = await fetchGscSites(accessToken);
    const sites = parseSitesListResponse(json);
    return NextResponse.json({ sites, selectedPropertyUrl: connection.propertyUrl });
  } catch (err) {
    if (err instanceof GscApiError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}

/** Selects which verified property this website maps to. */
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

  const connection = await getGscConnection(site.id);
  if (!connection) {
    return NextResponse.json({ error: "Google Search Console is not connected for this website." }, { status: 409 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "A propertyUrl is required." }, { status: 400 });
  }

  // Re-validate against the account's actual property list server-side —
  // never trust the client-submitted propertyUrl blindly, since selecting a
  // property this Google account can't actually read would only surface as
  // a confusing failure at sync time.
  try {
    const accessToken = await ensureFreshAccessToken(connection);
    const json = await fetchGscSites(accessToken);
    const sites = parseSitesListResponse(json);
    const match = sites.find((s) => s.siteUrl === parsed.data.propertyUrl);
    if (!match) {
      return NextResponse.json(
        { error: "That property was not found among this Google account's verified Search Console properties." },
        { status: 400 }
      );
    }
  } catch (err) {
    if (err instanceof GscApiError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }

  await db
    .update(gscConnections)
    .set({ propertyUrl: parsed.data.propertyUrl, updatedAt: new Date() })
    .where(eq(gscConnections.id, connection.id));

  return NextResponse.json({ success: true, propertyUrl: parsed.data.propertyUrl });
}
