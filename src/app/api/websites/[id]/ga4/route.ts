import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { getGa4Connection, deleteGa4Connection } from "@/lib/ga4/queries";
import { isGa4Configured } from "@/lib/ga4/config";

const idSchema = z.string().uuid();

/**
 * Connection status only. Never fetches live report data here — that's the
 * dedicated `.../ga4/report` endpoint, kept separate so the status check
 * (polled on page load) never itself triggers a Google Analytics Data API
 * call. Isolation: `getWebsiteForUser` already enforces the same
 * ownership/RBAC ownership chain as every other website-scoped route, so a
 * non-owner/non-permitted user gets 404 here identically to GSC.
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

  const configured = isGa4Configured();
  const connection = await getGa4Connection(site.id);

  if (!connection) {
    return NextResponse.json({
      configured,
      connected: false,
      propertyId: null,
      propertyName: null,
      measurementId: null,
    });
  }

  return NextResponse.json({
    configured,
    connected: true,
    propertyId: connection.propertyId,
    propertyName: connection.propertyName,
    measurementId: connection.measurementId,
    googleAccountEmail: connection.googleAccountEmail,
  });
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

  const site = await getWebsiteForUser(user.id, id);
  if (!site) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  await deleteGa4Connection(site.id);
  return NextResponse.json({ success: true });
}
