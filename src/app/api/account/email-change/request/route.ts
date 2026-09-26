import { NextRequest, NextResponse } from "next/server";
import { requestEmailChangeSchema } from "@/lib/validation/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getPgErrorCode } from "@/lib/db/pg-error";
import { eq } from "drizzle-orm";
import { getSession, generateOtp, hashOtp, getOtpExpiry, checkRateLimit } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";

/**
 * Stage 3 — step 1 of the email-change flow. Reuses the EXACT existing
 * duplicate-email check pattern from registration (`src/app/api/auth/register/route.ts`):
 * a pre-check SELECT, then a unique-constraint (23505) catch on write as the
 * race-condition backstop. Reuses the exact OTP generation/hashing/expiry
 * logic from `src/lib/auth/otp.ts` (same functions the registration/
 * verify-email flow already calls) — no second OTP system.
 *
 * Critically: `users.email` (the active login credential) is NEVER touched
 * here. The candidate address is only staged on `pendingEmail` +
 * `pendingEmailOtpHash` + `pendingEmailOtpExpiresAt`. A user cannot lock
 * themselves out by requesting a change to an address they don't control —
 * their old email keeps working for login until `confirm` succeeds.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const rl = await checkRateLimit(session.userId, "request_email_change");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = requestEmailChangeSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
      return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
    }

    const { newEmail } = parsed.data;

    const [me] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (!me) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    if (newEmail === me.email) {
      return NextResponse.json(
        { error: "That is already your current email address." },
        { status: 400 }
      );
    }

    // Same duplicate-email check pattern as registration — reject BEFORE
    // sending anything, no OTP flow is started for an address that's
    // already taken.
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, newEmail))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const otp = generateOtp();
    const tokenHash = hashOtp(otp);
    const expiresAt = getOtpExpiry();

    try {
      await db
        .update(users)
        .set({
          pendingEmail: newEmail,
          pendingEmailOtpHash: tokenHash,
          pendingEmailOtpExpiresAt: expiresAt,
          pendingEmailOtpAttempts: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.id, me.id));
    } catch (updateErr) {
      // Race-condition backstop: someone else registered/changed into this
      // exact email between our pre-check SELECT and this write. There is
      // no unique constraint directly on `pendingEmail` (by design — it's
      // just a staging field, not a login credential), so this only fires
      // if a genuine `users.email` uniqueness collision happens on some
      // other concurrent path; kept for defensive parity with register's
      // pattern.
      if (getPgErrorCode(updateErr) === "23505") {
        return NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 409 }
        );
      }
      throw updateErr;
    }

    await sendVerificationEmail({ to: newEmail, name: me.name, otp });

    return NextResponse.json({ success: true, pendingEmail: newEmail });
  } catch (err) {
    console.error("request-email-change error", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
