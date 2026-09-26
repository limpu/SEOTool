import type { CheckResult } from "@/lib/install/types";
import { CheckStatusBadge } from "./status-badge";

/**
 * One check, rendered as the three things an operator actually needs — in
 * this order, every time:
 *
 *   WHAT IS WRONG   the `summary`
 *   WHY IT MATTERS  the `detail` — what stops working, in plain language
 *   HOW TO FIX IT   the `howToFix` steps, numbered
 *
 * None of that prose is written here. Stage 1's checks already carry it, and
 * `assertActionable()` enforces at runtime that every `fail` has remediation.
 * This component's whole job is to make sure it is SHOWN — the failure mode
 * this design exists to prevent is a non-technical operator being handed a
 * bare `ECONNREFUSED` with nothing to do about it.
 */
export function CheckCard({ check }: { check: CheckResult }) {
  const isProblem = check.status === "fail" || check.status === "warn" || check.status === "unknown";

  return (
    <li className="rounded-md border border-default bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{check.label}</p>
          <p className="mt-0.5 text-sm text-secondary-foreground">{check.summary}</p>
        </div>
        <div className="shrink-0">
          <CheckStatusBadge status={check.status} />
        </div>
      </div>

      {check.detail && (
        <p className="mt-2 text-xs leading-relaxed text-secondary-foreground">{check.detail}</p>
      )}

      {isProblem && check.howToFix && check.howToFix.length > 0 && (
        <div className="mt-3 rounded-md bg-surface-subtle px-3 py-2.5">
          <p className="text-xs font-semibold text-foreground">How to fix this</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-secondary-foreground">
            {check.howToFix.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {check.status === "fail" && check.blocking && (
        <p className="mt-2 text-xs font-semibold text-foreground">
          This must be fixed before the installation can be completed.
        </p>
      )}
    </li>
  );
}

/** A list of checks, problems first — the operator should not have to hunt. */
export function CheckList({ checks }: { checks: CheckResult[] }) {
  if (checks.length === 0) return null;
  const order: Record<CheckResult["status"], number> = {
    fail: 0,
    warn: 1,
    unknown: 2,
    optional: 3,
    pass: 4,
  };
  const sorted = [...checks].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <ul className="space-y-2">
      {sorted.map((c) => (
        <CheckCard key={c.id} check={c} />
      ))}
    </ul>
  );
}
