import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

// Phase 34 (Production Readiness): standard health-check endpoint for a
// load balancer / uptime monitor to poll. Deliberately unauthenticated
// (a monitoring probe has no session) and deliberately cheap (a single
// `SELECT 1`, not a full app-logic exercise) — this checks "is the
// database reachable," which is this app's one genuine hard runtime
// dependency (Phase 26/29's optional integrations — GSC, Ollama — are
// allowed to be unconfigured/unavailable and must NOT fail this check;
// their own routes already report their own honest "not configured"
// states independently).
//
// Contract: 200 with `{status:"ok", checks:{database:"ok"}}` when the DB
// responds; 503 with `{status:"error", checks:{database:"error"}, error}`
// when it doesn't. No secrets, connection strings, or stack traces are
// ever included in the response body (Section 79 rule #6 — never expose
// environment/config details in a response).
export async function GET() {
  const startedAt = Date.now();

  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json(
      {
        status: "ok",
        checks: { database: "ok" },
        responseTimeMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch {
    // Deliberately no error detail forwarded to the client (Section 79 #6
    // — never leak internals) — the database driver's raw error can
    // contain the connection string/host in some `pg` error paths. An
    // operator who needs the real cause should check server-side logs,
    // not this public endpoint's response body.
    return NextResponse.json(
      {
        status: "error",
        checks: { database: "error" },
        responseTimeMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
