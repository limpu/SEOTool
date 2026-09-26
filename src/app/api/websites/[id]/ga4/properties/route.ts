import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { googleAnalyticsConnections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { getGa4Connection } from "@/lib/ga4/queries";
import { ensureFreshGa4AccessToken } from "@/lib/ga4/token";
import { fetchGa4AccountSummaries, Ga4ApiError } from "@/lib/ga4/client";
import { parseAccountSummariesResponse } from "@/lib/ga4/parse";

const idSchema = z.string().uuid();
const bodySchema = z.object({
  propertyId: z.string().min(1),
  propertyName: z.string().min(1),
  measurementId: z.string().optional(),
});

/**
 * Lists the connected Google account's real GA4 properties (live call to
 * the Admin API) — the property-picker step of the flow the user specified:
 * "List GA4 properties from their account → Client selects the property
 * that matches this website". Never returns the platform operator's own
 * properties; only whatever the connected user's own Google account can see.
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

  const connection = await getGa4Connection(site.id);
  if (!connection) {
    return NextResponse.json({ error: "Google Analytics is not connected for this website." }, { status: 409 });
  }

  try {
    const accessToken = await ensureFreshGa4AccessToken(connection);
    const json = await fetchGa4AccountSummaries(accessToken);
    const properties = parseAccountSummariesResponse(json);
    return NextResponse.json({ properties, selectedPropertyId: connection.propertyId });
  } catch (err) {
    if (err instanceof Ga4ApiError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}

/** Selects which real GA4 property this website maps to, and persists it. */
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

  const connection = await getGa4Connection(site.id);
  if (!connection) {
    return NextResponse.json({ error: "Google Analytics is not connected for this website." }, { status: 409 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "A propertyId and propertyName are required." }, { status: 400 });
  }

  // Re-validate against the account's actual property list server-side —
  // never trust the client-submitted propertyId blindly (same discipline as
  // GSC's property selection).
  try {
    const accessToken = await ensureFreshGa4AccessToken(connection);
    const json = await fetchGa4AccountSummaries(accessToken);
    const properties = parseAccountSummariesResponse(json);
    const match = properties.find((p) => p.propertyId === parsed.data.propertyId);
    if (!match) {
      return NextResponse.json(
        { error: "That property was not found among this Google account's Analytics properties." },
        { status: 400 }
      );
    }
  } catch (err) {
    if (err instanceof Ga4ApiError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }

  await db
    .update(googleAnalyticsConnections)
    .set({
      propertyId: parsed.data.propertyId,
      propertyName: parsed.data.propertyName,
      measurementId: parsed.data.measurementId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(googleAnalyticsConnections.id, connection.id));

  return NextResponse.json({ success: true, propertyId: parsed.data.propertyId });
}
