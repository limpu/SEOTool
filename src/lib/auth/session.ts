import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq, and, isNull, gt } from "drizzle-orm";

const COOKIE_NAME = "seo_session";
const SESSION_DURATION_SECONDS = parseInt(
  process.env.SESSION_DURATION_SECONDS ?? "604800",
  10
);

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set.");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

// ─── Create session ───────────────────────────────────────────────────────────

export async function createSession(
  userId: string
): Promise<{ token: string; sessionId: string }> {
  const sessionIdentifier = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000);

  await db.insert(sessions).values({
    userId,
    sessionIdentifier,
    expiresAt,
    lastUsedAt: now,
  });

  const token = await new SignJWT({ userId, sessionId: sessionIdentifier })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getJwtSecret());

  return { token, sessionId: sessionIdentifier };
}

// ─── Set session cookie ───────────────────────────────────────────────────────

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });
}

// ─── Get session from cookie ──────────────────────────────────────────────────

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getJwtSecret());

    const userId = payload["userId"] as string | undefined;
    const sessionId = payload["sessionId"] as string | undefined;
    const iat = payload.iat as number | undefined;
    const exp = payload.exp as number | undefined;

    if (!userId || !sessionId || !iat || !exp) return null;

    // Verify session is active in DB (not revoked, not expired)
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.sessionIdentifier, sessionId),
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!session) return null;

    // Update last_used_at (fire and forget)
    db.update(sessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(sessions.id, session.id))
      .catch(() => {});

    return { userId, sessionId, iat, exp };
  } catch {
    return null;
  }
}

// ─── Revoke session (logout) ──────────────────────────────────────────────────

export async function revokeSession(sessionIdentifier: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.sessionIdentifier, sessionIdentifier));
}

// ─── Revoke all sessions for a user ──────────────────────────────────────────

// Pure decision logic extracted for unit testing (same pattern Stage 3 used
// for the OTP state machine): given the user's currently-active session
// rows, decide which ones to revoke. When `exceptSessionId` is provided
// (single-active-session-on-login and email-change-preserving-the-confirming
// session both pass it), that one session is exempted; otherwise (logout-
// everywhere / password-reset) every active session is revoked.
export function selectSessionsToRevoke<
  T extends { sessionIdentifier: string },
>(activeSessions: T[], exceptSessionId?: string): T[] {
  return exceptSessionId
    ? activeSessions.filter((s) => s.sessionIdentifier !== exceptSessionId)
    : activeSessions;
}

export async function revokeAllUserSessions(
  userId: string,
  exceptSessionId?: string
): Promise<void> {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];

  const allSessions = await db
    .select({ id: sessions.id, sessionIdentifier: sessions.sessionIdentifier })
    .from(sessions)
    .where(and(...conditions));

  const toRevoke = selectSessionsToRevoke(allSessions, exceptSessionId);

  if (toRevoke.length === 0) return;

  for (const s of toRevoke) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, s.id));
  }
}

// ─── Clear session cookie ─────────────────────────────────────────────────────

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
