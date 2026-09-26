import { NextResponse } from "next/server";
import { getSession, revokeSession, clearSessionCookie } from "@/lib/auth";

export async function POST() {
  try {
    const session = await getSession();
    if (session) {
      await revokeSession(session.sessionId);
    }
  } catch (err) {
    console.error("logout error", err);
  } finally {
    await clearSessionCookie();
  }

  return NextResponse.json({ success: true });
}
