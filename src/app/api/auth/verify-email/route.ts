import { NextRequest, NextResponse } from "next/server";
import { verifyEmailSchema } from "@/lib/validation/auth";
import { db } from "@/lib/db";
import { users, emailVerificationTokens } from "@/lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { verifyOtp, OTP_MAX_ATTEMPTS, checkRateLimit, getClientIp } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const ip = await getClientIp();
    const body = await req.json().catch(() => null);
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid verification code." }, { status: 400 });
    }
    const { userId, otp } = parsed.data;

    const rl = await checkRateLimit(`${ip}:${userId}`, "verify_otp");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const [tokenRow] = await db
      .select()
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.userId, userId),
          isNull(emailVerificationTokens.usedAt),
          isNull(emailVerificationTokens.invalidatedAt)
        )
      )
      .orderBy(desc(emailVerificationTokens.createdAt))
      .limit(1);

    if (!tokenRow) {
      return NextResponse.json(
        { error: "This verification code has already been used. Please request a new code." },
        { status: 400 }
      );
    }

    if (tokenRow.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This verification code has expired. Please request a new code." },
        { status: 400 }
      );
    }

    if (tokenRow.attempts >= OTP_MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many attempts. Please request a new code." },
        { status: 429 }
      );
    }

    const isValid = verifyOtp(otp, tokenRow.tokenHash);

    if (!isValid) {
      await db
        .update(emailVerificationTokens)
        .set({ attempts: tokenRow.attempts + 1 })
        .where(eq(emailVerificationTokens.id, tokenRow.id));

      return NextResponse.json(
        { error: "Invalid verification code. Please check the code and try again." },
        { status: 400 }
      );
    }

    await db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, tokenRow.id));

    await db
      .update(users)
      .set({ emailVerified: true, emailVerifiedAt: new Date() })
      .where(eq(users.id, userId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("verify-email error", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
