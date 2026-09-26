"use client";

import { Check, Circle } from "lucide-react";

import { getPasswordRequirements } from "@/lib/validation/auth";

/**
 * A met requirement is a MEASURED state (this rule passes), not an action, so
 * it wears `--status-good` rather than the destructive/primary action roles.
 * The check icon travels with the colour — an unmet rule is a hollow circle —
 * so the pass/fail reading survives greyscale and colour-vision differences.
 */
export function PasswordRequirements({ password }: { password: string }) {
  const requirements = getPasswordRequirements(password);
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {requirements.map((r) => (
        <li key={r.id} className={`flex items-center gap-2 ${r.met ? "text-status-good" : "text-muted"}`}>
          {r.met ? (
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          {r.label}
        </li>
      ))}
    </ul>
  );
}
