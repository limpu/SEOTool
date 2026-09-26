import { describe, it, expect } from "vitest";
import { selectSessionsToRevoke } from "@/lib/auth/session";

// Stage 4 — single-active-session-on-login. `selectSessionsToRevoke` is the
// exact pure decision function `revokeAllUserSessions` (the same function
// Stage 3's email-change flow and Phase 3's logout/password-reset already
// use) calls internally to decide which of a user's currently-active
// sessions to revoke. These tests exercise the REAL production function,
// not a re-implementation.

interface FakeSession {
  sessionIdentifier: string;
  revokedAt: Date | null;
}

function simulateLoginRevocation(
  existingSessionIds: string[],
  newSessionId: string
): FakeSession[] {
  // Mirrors the login route's exact sequence: the new session is created
  // first (so it's never itself a candidate for revocation), then
  // revokeAllUserSessions(userId, newSessionId) is called, which — via
  // selectSessionsToRevoke — decides which of the OTHER active sessions to
  // revoke.
  const allActiveSessions: FakeSession[] = [
    ...existingSessionIds.map((id) => ({ sessionIdentifier: id, revokedAt: null })),
    { sessionIdentifier: newSessionId, revokedAt: null },
  ];

  // revokeAllUserSessions only ever selects sessions where revokedAt IS
  // NULL (i.e. still active) — same precondition here.
  const activeBeforeRevocation = allActiveSessions.filter((s) => s.revokedAt === null);
  const toRevoke = selectSessionsToRevoke(activeBeforeRevocation, newSessionId);

  const now = new Date();
  for (const target of toRevoke) {
    const row = allActiveSessions.find((s) => s.sessionIdentifier === target.sessionIdentifier);
    if (row) row.revokedAt = now;
  }

  return allActiveSessions;
}

describe("selectSessionsToRevoke (single-active-session enforcement)", () => {
  it("exempts the given session id from the revoke set", () => {
    const active = [
      { sessionIdentifier: "a" },
      { sessionIdentifier: "b" },
      { sessionIdentifier: "c" },
    ];
    const toRevoke = selectSessionsToRevoke(active, "b");
    expect(toRevoke.map((s) => s.sessionIdentifier).sort()).toEqual(["a", "c"]);
  });

  it("revokes everything when no exceptSessionId is given (logout-all / password-reset)", () => {
    const active = [{ sessionIdentifier: "a" }, { sessionIdentifier: "b" }];
    const toRevoke = selectSessionsToRevoke(active);
    expect(toRevoke).toHaveLength(2);
  });

  it("is a no-op revoke set when the exempted session is the only active one", () => {
    const active = [{ sessionIdentifier: "only" }];
    const toRevoke = selectSessionsToRevoke(active, "only");
    expect(toRevoke).toHaveLength(0);
  });

  it("given a user with N existing sessions, a new login leaves exactly 1 valid session", () => {
    for (const n of [0, 1, 3, 10]) {
      const existing = Array.from({ length: n }, (_, i) => `old-session-${i}`);
      const result = simulateLoginRevocation(existing, "new-session");
      const stillValid = result.filter((s) => s.revokedAt === null);
      expect(stillValid).toHaveLength(1);
      expect(stillValid[0]!.sessionIdentifier).toBe("new-session");
    }
  });

  it("device B logging in revokes device A's session but not device B's own new session", () => {
    // Device A already has an active session ("device-a-session"). Device B
    // now logs in — its new session must survive, device A's must not.
    const result = simulateLoginRevocation(["device-a-session"], "device-b-session");
    const a = result.find((s) => s.sessionIdentifier === "device-a-session")!;
    const b = result.find((s) => s.sessionIdentifier === "device-b-session")!;
    expect(a.revokedAt).not.toBeNull();
    expect(b.revokedAt).toBeNull();
  });
});
