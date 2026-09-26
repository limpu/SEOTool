import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, emailVerificationTokens } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { generateOtp, hashOtp, getOtpExpiry, checkRateLimit, getClientIp } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";

const schema = z.object({ userId: z.string().uuid("Invalid request.") });

export async function POST(req: NextRequest) {
  try {
    const ip = await getClientIp();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const { userId } = parsed.data;

    const rl = await checkRateLimit(`${ip}:${userId}`, "resend_otp");
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "Too many requests. Please wait before requesting another code.",
          retryAfterSeconds: rl.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Return generic success even if the user doesn't exist or is already
    // verified — this endpoint is only reachable with a userId obtained from
    // register/login, so no new information is exposed by staying quiet here.
    if (!user || user.emailVerified) {
      return NextResponse.json({ success: true });
    }

    await db
      .update(emailVerificationTokens)
      .set({ invalidatedAt: new Date() })
      .where(
        and(
          eq(emailVerificationTokens.userId, userId),
          isNull(emailVerificationTokens.usedAt),
          isNull(emailVerificationTokens.invalidatedAt)
        )
      );

    const otp = generateOtp();
    const tokenHash = hashOtp(otp);
    const expiresAt = getOtpExpiry();

    await db.insert(emailVerificationTokens).values({ userId, tokenHash, expiresAt });

    await sendVerificationEmail({ to: user.email, name: user.name, otp });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("resend-otp error", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
