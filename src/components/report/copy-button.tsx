"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Copy-to-clipboard leaf. MODULE-AGNOSTIC and deliberately tiny — it is the
 * only reason the affected-URLs table needs any client JavaScript at all.
 *
 * Failure is honest: if the Clipboard API is unavailable (an insecure origin,
 * a denied permission) the button reports "Copy failed" rather than flashing a
 * success tick it did not earn.
 */
export function CopyButton({ value, label = "Copy URL" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  const Icon = state === "copied" ? Check : Copy;

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={state === "failed" ? "Copy failed" : label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-default text-secondary-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Icon className={`h-3.5 w-3.5 ${state === "copied" ? "text-status-good" : ""}`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      {/* Result is announced in words, not by the icon swap alone. */}
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? "Copied to clipboard" : state === "failed" ? "Copy failed" : ""}
      </span>
    </button>
  );
}
