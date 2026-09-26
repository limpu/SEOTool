import { NextRequest, NextResponse } from "next/server";
import { emailSchema } from "@/lib/validation/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const ip = await getClientIp();
    const rl = await checkRateLimit(ip, "check_email");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = emailSchema.safeParse(body?.email);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }

    const email = parsed.data;
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return NextResponse.json({ available: !existing });
  } catch (err) {
    console.error("check-email error", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
