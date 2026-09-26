import { describe, expect, it } from "vitest";
import { COMPLETION_CONSEQUENCES, evaluateCompletionGate } from "@/lib/install/actions/complete";
import type { InstallStatusReport } from "@/lib/install/checks";
import type { CheckResult } from "@/lib/install/types";

/**
 * Web Installer — Stage 2. The gate on the one irreversible action.
 *
 * Two mistakes are available here and both are serious in opposite
 * directions. Gating too tightly (blocking on a `warn`) leaves an operator on
 * a 2 GB VPS with a permanently open, unauthenticated installer as the price
 * of a hardware recommendation. Gating too loosely lets someone complete
 * without an administrator, producing a platform nobody can ever sign in to
 * with the installer already closed — unrecoverable by clicking a button.
 */

function check(over: Partial<CheckResult> & Pick<CheckResult, "id" | "status">): CheckResult {
  return {
    group: "runtime",
    label: over.id,
    summary: `${over.id} summary`,
    ...over,
  } as CheckResult;
}

function report(over: {
  checks?: CheckResult[];
  isProduction?: boolean;
  status?: "complete" | "not_complete" | "unknown";
}): InstallStatusReport {
  const checks = over.checks ?? [];
  return {
    generatedAt: new Date().toISOString(),
    installation: {
      status: over.status ?? "not_complete",
      completed: over.status === "complete",
      completedAt: null,
      completedByUserId: null,
      steps: {},
    },
    deployment: {
      mode: "traditional",
      evidence: [],
      envFileIsDurable: true,
      restartRequired: true,
      platform: "linux",
    },
    isProduction: over.isProduction ?? false,
    checks,
    environment: [],
    migrations: null,
    summary: { pass: 0, warn: 0, fail: 0, optional: 0, unknown: 0 },
    nextRequiredStep: { id: "complete", label: "", reason: "", satisfied: true, gatedBy: [] },
    steps: [],
  };
}

const adminOk = check({ id: "security.admin-exists", status: "pass", group: "security" });

describe("install/complete — the gate", () => {
  it("allows completion when every mandatory check passes and an administrator exists", () => {
    const gate = evaluateCompletionGate(report({ checks: [adminOk, check({ id: "runtime.node", status: "pass" })] }));
    expect(gate.allowed).toBe(true);
    expect(gate.blockers).toEqual([]);
  });

  it("BLOCKS on any blocking fail, and hands the check's own howToFix straight through", () => {
    const migration = check({
      id: "database.migrations",
      status: "fail",
      blocking: true,
      group: "database",
      howToFix: ["Apply each pending migration in filename order."],
    });
    const gate = evaluateCompletionGate(report({ checks: [adminOk, migration] }));
    expect(gate.allowed).toBe(false);
    expect(gate.blockers.map((b) => b.id)).toContain("database.migrations");
    // The gate invents no prose of its own — remediation comes from the check.
    expect(gate.blockers[0].howToFix).toEqual(["Apply each pending migration in filename order."]);
  });

  it("A WARN NEVER BLOCKS — a hardware recommendation is not a requirement", () => {
    const gate = evaluateCompletionGate(
      report({
        checks: [
          adminOk,
          check({ id: "resources.memory", status: "warn", group: "resources" }),
          check({ id: "runtime.chromium", status: "warn" }),
          check({ id: "security.installer-lock", status: "warn", group: "security" }),
        ],
      })
    );
    expect(gate.allowed).toBe(true);
    // But they are surfaced before the point of no return, not hidden.
    expect(gate.warnings.map((w) => w.id)).toEqual(
      expect.arrayContaining(["resources.memory", "runtime.chromium"])
    );
  });

  it("an OPTIONAL check never blocks and is not reported as a problem", () => {
    const gate = evaluateCompletionGate(
      report({ checks: [adminOk, check({ id: "integration.smtp", status: "optional", group: "integrations" })] })
    );
    expect(gate.allowed).toBe(true);
    expect(gate.warnings.map((w) => w.id)).not.toContain("integration.smtp");
  });

  it("a non-blocking FAIL does not block — `blocking` is what makes a fail mandatory", () => {
    const gate = evaluateCompletionGate(
      report({ checks: [adminOk, check({ id: "env.EMAIL_USER", status: "fail", group: "environment" })] })
    );
    expect(gate.allowed).toBe(true);
  });

  it("BLOCKS WITHOUT AN ADMINISTRATOR — otherwise the platform is permanently unreachable", () => {
    const gate = evaluateCompletionGate(
      report({ checks: [check({ id: "security.admin-exists", status: "fail", group: "security" })] })
    );
    expect(gate.allowed).toBe(false);
    const blocker = gate.blockers.find((b) => b.id === "security.admin-exists");
    expect(blocker?.howToFix?.join(" ")).toMatch(/nobody can ever sign in/i);
  });

  it("blocks when the administrator count is UNKNOWN — the one place an unknown must fail closed", () => {
    const gate = evaluateCompletionGate(
      report({ checks: [check({ id: "security.admin-exists", status: "unknown", group: "security" })] })
    );
    expect(gate.allowed).toBe(false);
    expect(gate.blockers.find((b) => b.id === "security.admin-exists")?.howToFix?.join(" ")).toMatch(
      /Completing on an unknown is refused/i
    );
  });

  it("BLOCKS PLAIN HTTP IN PRODUCTION, and allows it outside production", () => {
    const http = check({ id: "network.https", status: "fail", group: "network" });
    expect(evaluateCompletionGate(report({ checks: [adminOk, http], isProduction: true })).allowed).toBe(false);
    expect(evaluateCompletionGate(report({ checks: [adminOk, http], isProduction: false })).allowed).toBe(true);
  });

  it("refuses when the installation state is UNKNOWN or already complete", () => {
    for (const status of ["unknown", "complete"] as const) {
      const gate = evaluateCompletionGate(report({ checks: [adminOk], status }));
      expect(gate.allowed).toBe(false);
      expect(gate.blockers.map((b) => b.id)).toContain("installation.state");
    }
  });

  it("always states the irreversible consequences, including the 404", () => {
    const gate = evaluateCompletionGate(report({ checks: [adminOk] }));
    expect(gate.consequences).toEqual(COMPLETION_CONSEQUENCES);
    const text = gate.consequences.join(" ");
    expect(text).toMatch(/permanently disabled/i);
    expect(text).toContain("404");
    expect(text).toMatch(/\.install-token file is deleted/);
    // And it says what is NOT affected, so the operator is not scared off.
    expect(text).toMatch(/your data, your administrator account and your configuration are untouched/i);
  });

  it("never duplicates a check that is both a blocking fail and the admin check", () => {
    const admin = check({ id: "security.admin-exists", status: "fail", blocking: true, group: "security", howToFix: ["x"] });
    const gate = evaluateCompletionGate(report({ checks: [admin] }));
    expect(gate.blockers.filter((b) => b.id === "security.admin-exists")).toHaveLength(1);
  });
});
