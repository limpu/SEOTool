import { describe, expect, it } from "vitest";
import {
  SECTION_SPECS,
  SECTION_STATUS_LABEL,
  deriveWizardModel,
  rollUpStatus,
} from "@/lib/install/wizard-steps";
import type { InstallStatusReport } from "@/lib/install/checks";
import type { CheckResult } from "@/lib/install/types";

/**
 * Web Installer — Stage 2. The wizard is DERIVED, not sequenced.
 *
 * The assertions that matter here are the ones about "next": an operator who
 * arrives with a complete `.env` must be taken straight to the administrator
 * step rather than walked through eight satisfied screens, and a database
 * that disappears mid-installation must make the Database section next again
 * regardless of how far the wizard had already got. Both fall out of
 * recomputing from the live matrix every render — which is exactly what these
 * tests pin down.
 */

function check(over: Partial<CheckResult> & Pick<CheckResult, "id" | "status">): CheckResult {
  return { group: "runtime", label: over.id, summary: `${over.id} summary`, ...over } as CheckResult;
}

function report(checks: CheckResult[], steps: Record<string, { status: string; at: string }> = {}): InstallStatusReport {
  return {
    generatedAt: new Date().toISOString(),
    installation: {
      status: "not_complete",
      completed: false,
      completedAt: null,
      completedByUserId: null,
      steps,
    },
    deployment: {
      mode: "traditional",
      evidence: [],
      envFileIsDurable: true,
      restartRequired: true,
      platform: "linux",
    },
    isProduction: false,
    checks,
    environment: [],
    migrations: null,
    summary: { pass: 0, warn: 0, fail: 0, optional: 0, unknown: 0 },
    nextRequiredStep: { id: "complete", label: "", reason: "", satisfied: true, gatedBy: [] },
    steps: [],
  };
}

const ALL_GREEN: CheckResult[] = [
  check({ id: "runtime.node", status: "pass" }),
  check({ id: "resources.memory", status: "pass", group: "resources" }),
  check({ id: "database.reachable", status: "pass", group: "database" }),
  check({ id: "database.migrations", status: "pass", group: "database" }),
  check({ id: "env.DATABASE_URL", status: "pass", group: "environment" }),
  check({ id: "integration.google", status: "pass", group: "integrations" }),
  check({ id: "integration.smtp", status: "optional", group: "integrations" }),
  check({ id: "integration.ollama", status: "optional", group: "integrations" }),
  check({ id: "security.admin-exists", status: "pass", group: "security" }),
  check({ id: "security.secrets", status: "pass", group: "security" }),
  check({ id: "network.https", status: "pass", group: "network" }),
];

describe("install/wizard — status roll-up", () => {
  it("uses exactly the four agreed words, no synonyms", () => {
    expect(SECTION_STATUS_LABEL).toEqual({
      ready: "Ready",
      action: "Action Required",
      optional: "Optional",
      failed: "Failed",
    });
  });

  it("a blocking fail outranks everything", () => {
    expect(
      rollUpStatus([check({ id: "a", status: "pass" }), check({ id: "b", status: "fail", blocking: true })])
    ).toBe("failed");
  });

  it("a warn, an unknown, or a non-blocking fail is Action Required — never a block", () => {
    expect(rollUpStatus([check({ id: "a", status: "warn" })])).toBe("action");
    expect(rollUpStatus([check({ id: "a", status: "unknown" })])).toBe("action");
    expect(rollUpStatus([check({ id: "a", status: "fail" })])).toBe("action");
  });

  it("a section whose every check is optional is Optional, not Ready", () => {
    // Claiming "Ready" for something simply not configured is a small lie
    // that compounds across ten sections.
    expect(rollUpStatus([check({ id: "a", status: "optional" })])).toBe("optional");
    expect(rollUpStatus([check({ id: "a", status: "optional" }), check({ id: "b", status: "pass" })])).toBe(
      "ready"
    );
  });
});

describe("install/wizard — section derivation", () => {
  it("builds every section in the catalog, in order", () => {
    const model = deriveWizardModel(report(ALL_GREEN), true);
    expect(model.sections.map((s) => s.id)).toEqual(SECTION_SPECS.map((s) => s.id));
  });

  it("routes each check to the section an operator would look for it in", () => {
    const model = deriveWizardModel(report(ALL_GREEN), true);
    const by = (id: string) => model.sections.find((s) => s.id === id)!;
    expect(by("server").checks.map((c) => c.id)).toContain("runtime.node");
    expect(by("database").checks.map((c) => c.id)).toContain("database.migrations");
    expect(by("google").checks.map((c) => c.id)).toContain("integration.google");
    expect(by("email").checks.map((c) => c.id)).toContain("integration.smtp");
    expect(by("ai").checks.map((c) => c.id)).toContain("integration.ollama");
    expect(by("admin").checks.map((c) => c.id)).toContain("security.admin-exists");
    expect(by("security").checks.map((c) => c.id)).toContain("network.https");
  });

  it("KEEPS THE GOOGLE AND EMAIL VARIABLES OFF THE ENVIRONMENT SCREEN", () => {
    const checks = [
      ...ALL_GREEN,
      check({ id: "env.GOOGLE_CLIENT_ID", status: "pass", group: "environment" }),
      check({ id: "env.EMAIL_HOST", status: "optional", group: "environment" }),
      check({ id: "env.OLLAMA_MODEL", status: "optional", group: "environment" }),
    ];
    const model = deriveWizardModel(report(checks), true);
    const envIds = model.sections.find((s) => s.id === "environment")!.checks.map((c) => c.id);
    // A wall of twenty-one variables is not a screen anybody can act on.
    expect(envIds).not.toContain("env.GOOGLE_CLIENT_ID");
    expect(envIds).not.toContain("env.EMAIL_HOST");
    expect(envIds).not.toContain("env.OLLAMA_MODEL");
    expect(envIds).toContain("env.DATABASE_URL");
    expect(model.sections.find((s) => s.id === "google")!.checks.map((c) => c.id)).toContain(
      "env.GOOGLE_CLIENT_ID"
    );
    expect(model.sections.find((s) => s.id === "email")!.checks.map((c) => c.id)).toContain(
      "env.EMAIL_HOST"
    );
  });

  it("TAKES A FULLY-CONFIGURED OPERATOR STRAIGHT TO COMPLETE, skipping the satisfied sections", () => {
    const model = deriveWizardModel(report(ALL_GREEN), true);
    expect(model.nextSectionId).toBe("complete");
    // Satisfied sections are marked so the UI can collapse them — never hide
    // them; the operator must always be able to open one and see the evidence.
    for (const id of ["server", "database", "environment", "admin", "security"]) {
      expect(model.sections.find((s) => s.id === id)!.satisfied).toBe(true);
    }
  });

  it("takes an operator with no administrator to the administrator section", () => {
    const checks = ALL_GREEN.map((c) =>
      c.id === "security.admin-exists" ? check({ ...c, status: "fail" }) : c
    );
    const model = deriveWizardModel(report(checks), false);
    expect(model.nextSectionId).toBe("admin");
  });

  it("A DATABASE THAT DISAPPEARS MID-INSTALLATION MAKES DATABASE NEXT AGAIN", () => {
    // Even with the administrator already created — progress is not a counter.
    const checks = ALL_GREEN.map((c) =>
      c.id === "database.reachable" ? check({ ...c, status: "fail", blocking: true }) : c
    );
    const model = deriveWizardModel(report(checks), false);
    expect(model.nextSectionId).toBe("database");
    expect(model.blockingSections).toContain("database");
    expect(model.sections.find((s) => s.id === "database")!.status).toBe("failed");
  });

  it("never makes a non-actionable section 'next' — Server check is a report, not a task", () => {
    const checks = ALL_GREEN.map((c) =>
      c.id === "resources.memory" ? check({ ...c, status: "warn" }) : c
    );
    const model = deriveWizardModel(report(checks), true);
    expect(model.sections.find((s) => s.id === "server")!.status).toBe("action");
    expect(model.nextSectionId).not.toBe("server");
  });

  it("surfaces the FIRST problem's own summary as the section's reason — no paraphrase", () => {
    const checks = ALL_GREEN.map((c) =>
      c.id === "database.migrations"
        ? check({ ...c, status: "fail", blocking: true, summary: "3 of 24 migrations have not been applied." })
        : c
    );
    const model = deriveWizardModel(report(checks), false);
    expect(model.sections.find((s) => s.id === "database")!.reason).toBe(
      "3 of 24 migrations have not been applied."
    );
  });

  it("explains an Optional section in terms of what actually stops working", () => {
    const model = deriveWizardModel(report(ALL_GREEN), true);
    expect(model.sections.find((s) => s.id === "email")!.reason).toMatch(/server log/i);
    expect(model.sections.find((s) => s.id === "ai")!.reason).toMatch(/nothing else is affected/i);
  });

  it("mirrors the completion gate rather than holding a second copy of the policy", () => {
    expect(deriveWizardModel(report(ALL_GREEN), false).canComplete).toBe(false);
    expect(deriveWizardModel(report(ALL_GREEN), false).sections.find((s) => s.id === "final")!.status).toBe(
      "action"
    );
    expect(deriveWizardModel(report(ALL_GREEN), true).canComplete).toBe(true);
  });

  it("detects RESUMING from the durable step record, not from any client-side flag", () => {
    expect(deriveWizardModel(report(ALL_GREEN), true).resuming).toBe(false);
    const resumed = deriveWizardModel(
      report(ALL_GREEN, { administrator: { status: "complete", at: "2026-08-31T00:00:00Z" } }),
      true
    );
    expect(resumed.resuming).toBe(true);
  });
});
