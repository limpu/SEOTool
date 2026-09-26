import { db } from "@/lib/db";
import { googleAnalyticsConnections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decryptGa4Token, encryptGa4Token } from "./crypto";
import { ga4NeedsRefresh, refreshGa4AccessToken } from "./oauth";
import type { Ga4ConnectionRow } from "./queries";

export class Ga4NotConnectedError extends Error {
  constructor() {
    super("Google Analytics is not connected for this website.");
  }
}

export class Ga4NoPropertySelectedError extends Error {
  constructor() {
    super("No Google Analytics property has been selected for this website yet.");
  }
}

/**
 * Ensures the connection's access token is valid, refreshing it via the
 * stored (encrypted) refresh token if it has expired or is about to.
 * Mirrors src/lib/gsc/sync.ts's `ensureFreshAccessToken` exactly.
 */
export async function ensureFreshGa4AccessToken(connection: Ga4ConnectionRow): Promise<string> {
  if (!ga4NeedsRefresh(connection.tokenExpiresAt)) {
    return decryptGa4Token(connection.accessToken);
  }

  const refreshToken = decryptGa4Token(connection.refreshToken);
  const refreshed = await refreshGa4AccessToken(refreshToken);

  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await db
    .update(googleAnalyticsConnections)
    .set({
      accessToken: encryptGa4Token(refreshed.access_token),
      tokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(googleAnalyticsConnections.id, connection.id));

  return refreshed.access_token;
}
