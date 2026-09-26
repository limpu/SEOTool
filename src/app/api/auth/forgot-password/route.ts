import { NextRequest, NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { db } from "@/lib/db";
import { users, passwordResetTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateResetToken, getResetTokenExpiry, checkRateLimit, getClientIp } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";

const GENERIC_MESSAGE =
  "If an account exists for this email, we'll send password reset instructions.";

export async function POST(req: NextRequest) {
  try {
    const ip = await getClientIp();
    const body = await req.json().catch(() => null);
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: GENERIC_MESSAGE });
    }
    const { email } = parsed.data;

    const rl = await checkRateLimit(`${ip}:${email}`, "forgot_password");
    if (!rl.allowed) {
      return NextResponse.json({ message: GENERIC_MESSAGE });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (user) {
      const { plaintext, hash } = generateResetToken();
      const expiresAt = getResetTokenExpiry();

      await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: hash, expiresAt });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const resetUrl = `${appUrl}/reset-password?token=${plaintext}`;

      await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (err) {
    console.error("forgot-password error", err);
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }
}
