import { NextRequest, NextResponse } from "next/server";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { db } from "@/lib/db";
import { users, passwordResetTokens } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import {
  hashResetToken,
  hashPassword,
  revokeAllUserSessions,
  checkRateLimit,
  getClientIp,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const ip = await getClientIp();
    const rl = await checkRateLimit(ip, "reset_password");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
      return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
    }

    const { token, password } = parsed.data;
    const tokenHash = hashResetToken(token);

    const [tokenRow] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)))
      .limit(1);

    if (!tokenRow) {
      return NextResponse.json(
        { error: "This reset link is invalid or has already been used." },
        { status: 400 }
      );
    }

    if (tokenRow.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This reset link has expired. Please request a new one." },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, tokenRow.userId));

    // Invalidate this token and any other outstanding reset tokens for the user.
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, tokenRow.userId), isNull(passwordResetTokens.usedAt)));

    await revokeAllUserSessions(tokenRow.userId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("reset-password error", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
