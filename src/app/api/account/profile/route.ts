import { NextRequest, NextResponse } from "next/server";
import { updateProfileSchema } from "@/lib/validation/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession, checkRateLimit } from "@/lib/auth";

/**
 * Stage 3 — simple profile field update: name, phone, address. No OTP/
 * verification needed for any of these (unlike email, which has its own
 * dedicated request/confirm routes below). Empty-string fields are stored
 * as `null` rather than `""` so "not provided" reads consistently across
 * the row regardless of whether a field was never set or was cleared.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const rl = await checkRateLimit(session.userId, "update_profile");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
      return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
    }

    const { name, phone, addressLine1, addressLine2, city, state, postalCode, addressCountry } =
      parsed.data;

    await db
      .update(users)
      .set({
        name,
        phone: phone ? phone : null,
        addressLine1: addressLine1 ? addressLine1 : null,
        addressLine2: addressLine2 ? addressLine2 : null,
        city: city ? city : null,
        state: state ? state : null,
        postalCode: postalCode ? postalCode : null,
        addressCountry: addressCountry ? addressCountry : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.userId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("update-profile error", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
