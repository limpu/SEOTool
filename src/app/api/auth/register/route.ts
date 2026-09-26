import { NextRequest, NextResponse } from "next/server";
import { registerSchema } from "@/lib/validation/auth";
import { db } from "@/lib/db";
import { users, emailVerificationTokens } from "@/lib/db/schema";
import { getPgErrorCode } from "@/lib/db/pg-error";
import { eq } from "drizzle-orm";
import { hashPassword, generateOtp, hashOtp, getOtpExpiry, checkRateLimit, getClientIp } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
import { userRoles, roles } from "@/lib/db/schema";
import { ensureRbacSeed, USER_ROLE_KEY } from "@/lib/rbac/seed";

export async function POST(req: NextRequest) {
  try {
    const ip = await getClientIp();
    const rl = await checkRateLimit(ip, "register");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
      return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
    }

    const { name, email, password } = parsed.data;

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    let user;
    try {
      [user] = await db
        .insert(users)
        .values({ name, email, passwordHash })
        .returning({ id: users.id, name: users.name, email: users.email });
    } catch (insertErr) {
      // Handle race: unique constraint violation on email
      if (getPgErrorCode(insertErr) === "23505") {
        return NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 409 }
        );
      }
      throw insertErr;
    }

    // Phase 14 (read-v2.md §11): every user needs a role to belong to for
    // RBAC checks to have something to evaluate. Assign the default,
    // zero-privilege USER system role at registration. Best-effort: a
    // failure here must never block registration/verification, since the
    // pre-existing auth flow (Phase 3) takes priority — an unrolled user
    // just has no admin access until fixed, not a broken signup.
    try {
      await ensureRbacSeed();
      const [userRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, USER_ROLE_KEY))
        .limit(1);
      if (userRole) {
        await db.insert(userRoles).values({ userId: user.id, roleId: userRole.id });
      }
    } catch (roleErr) {
      console.error("register: failed to assign default USER role", roleErr);
    }

    const otp = generateOtp();
    const tokenHash = hashOtp(otp);
    const expiresAt = getOtpExpiry();

    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    await sendVerificationEmail({ to: user.email, name: user.name, otp });

    return NextResponse.json({ userId: user.id, email: user.email }, { status: 201 });
  } catch (err) {
    console.error("register error", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
