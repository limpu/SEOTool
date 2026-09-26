import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  verifyPassword,
  hashPassword,
  createSession,
  setSessionCookie,
  checkRateLimit,
  getClientIp,
  revokeAllUserSessions,
} from "@/lib/auth";

const GENERIC_ERROR = "Invalid email or password.";

// Precomputed once per server process — used to keep the response time for a
// nonexistent-user login attempt close to that of a real password check,
// reducing the account-enumeration signal from response timing.
const DUMMY_HASH_PROMISE = hashPassword("timing-defense-dummy-password-000");

export async function POST(req: NextRequest) {
  try {
    const ip = await getClientIp();
    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }
    const { email, password } = parsed.data;

    const rl = await checkRateLimit(`${ip}:${email}`, "login");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
      await verifyPassword(password, await DUMMY_HASH_PROMISE);
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    if (!user.emailVerified) {
      return NextResponse.json(
        {
          error: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email before continuing.",
          userId: user.id,
        },
        { status: 403 }
      );
    }

    // Single-active-session enforcement: a new login on this account is
    // allowed to proceed (we do NOT block it), but it silently revokes every
    // OTHER session the user currently has. Create the new session FIRST,
    // then revoke all-except-it — the reverse order (revoke-then-create)
    // would leave a brief window where a concurrent read could observe zero
    // valid sessions for the user, and more importantly there'd be no way to
    // exempt "the session about to be created" since it doesn't exist yet.
    const { token, sessionId } = await createSession(user.id);
    await revokeAllUserSessions(user.id, sessionId);
    await setSessionCookie(token);

    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  } catch (err) {
    console.error("login error", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
