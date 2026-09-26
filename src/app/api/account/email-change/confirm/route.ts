import { NextRequest, NextResponse } from "next/server";
import { confirmEmailChangeSchema } from "@/lib/validation/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getPgErrorCode } from "@/lib/db/pg-error";
import { eq } from "drizzle-orm";
import {
  getSession,
  verifyOtp,
  OTP_MAX_ATTEMPTS,
  checkRateLimit,
  revokeAllUserSessions,
} from "@/lib/auth";

/**
 * Stage 3 — step 2 of the email-change flow. Only on a correct, unexpired
 * OTP does `users.email` actually change; every rejection path leaves the
 * account's active login credential exactly as it was. Reuses `verifyOtp`
 * (constant-time compare) and `OTP_MAX_ATTEMPTS` from the exact same
 * `src/lib/auth/otp.ts` module the registration/verify-email flow uses.
 *
 * On success, other active sessions are revoked (same pattern as
 * change-password) since the account's credential surface just changed.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const rl = await checkRateLimit(session.userId, "confirm_email_change");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = confirmEmailChangeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid verification code." }, { status: 400 });
    }
    const { otp } = parsed.data;

    const [me] = await db
      .select({
        id: users.id,
        pendingEmail: users.pendingEmail,
        pendingEmailOtpHash: users.pendingEmailOtpHash,
        pendingEmailOtpExpiresAt: users.pendingEmailOtpExpiresAt,
        pendingEmailOtpAttempts: users.pendingEmailOtpAttempts,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!me) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    if (!me.pendingEmail || !me.pendingEmailOtpHash || !me.pendingEmailOtpExpiresAt) {
      return NextResponse.json(
        { error: "No pending email change found. Please start again." },
        { status: 400 }
      );
    }

    if (me.pendingEmailOtpExpiresAt < new Date()) {
      return NextResponse.json(
        { error: "This verification code has expired. Please request a new code." },
        { status: 400 }
      );
    }

    if (me.pendingEmailOtpAttempts >= OTP_MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many attempts. Please request a new code." },
        { status: 429 }
      );
    }

    const isValid = verifyOtp(otp, me.pendingEmailOtpHash);

    if (!isValid) {
      await db
        .update(users)
        .set({ pendingEmailOtpAttempts: me.pendingEmailOtpAttempts + 1 })
        .where(eq(users.id, me.id));

      return NextResponse.json(
        { error: "Invalid verification code. Please check the code and try again." },
        { status: 400 }
      );
    }

    const newEmail = me.pendingEmail;

    try {
      await db
        .update(users)
        .set({
          email: newEmail,
          pendingEmail: null,
          pendingEmailOtpHash: null,
          pendingEmailOtpExpiresAt: null,
          pendingEmailOtpAttempts: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.id, me.id));
    } catch (updateErr) {
      // Backstop: another account grabbed this exact email between the
      // original request-time check and this confirm (real unique
      // constraint on `users.email`).
      if (getPgErrorCode(updateErr) === "23505") {
        return NextResponse.json(
          {
            error:
              "This email address was registered to another account while your change was pending. Please start again with a different address.",
          },
          { status: 409 }
        );
      }
      throw updateErr;
    }

    await revokeAllUserSessions(me.id, session.sessionId);

    return NextResponse.json({ success: true, email: newEmail });
  } catch (err) {
    console.error("confirm-email-change error", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
