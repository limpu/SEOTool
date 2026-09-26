import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import {
  getGscConnection,
  deleteGscConnection,
  deleteMetricsForWebsite,
  getLatestGscMetrics,
  isSyncStale,
} from "@/lib/gsc/queries";
import { isGscConfigured } from "@/lib/gsc/config";

const idSchema = z.string().uuid();

/**
 * Connection status + the most recently synced Queries/Pages data (if any).
 * Never fabricates rows: an unconnected or never-synced website returns
 * empty arrays, not sample data (Section 79).
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

  const configured = isGscConfigured();
  const connection = await getGscConnection(site.id);

  if (!connection) {
    return NextResponse.json({
      configured,
      connected: false,
      propertyUrl: null,
      data: null,
    });
  }

  const data = await getLatestGscMetrics(site.id);

  return NextResponse.json({
    configured,
    connected: true,
    propertyUrl: connection.propertyUrl,
    googleAccountEmail: connection.googleAccountEmail,
    lastSyncStatus: connection.lastSyncStatus,
    lastSyncCompletedAt: connection.lastSyncCompletedAt,
    lastSyncError: connection.lastSyncError,
    stale: isSyncStale(connection.lastSyncCompletedAt),
    data,
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

  await deleteGscConnection(site.id);
  await deleteMetricsForWebsite(site.id);
  return NextResponse.json({ success: true });
}
