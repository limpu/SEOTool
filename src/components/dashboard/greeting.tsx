"use client";

import { useEffect, useState } from "react";

/**
 * "Good Morning/Afternoon/Evening/Night, [Name]" using the VISITOR's own
 * browser clock — the most honest "their time" signal available without a
 * stored per-user timezone preference. Rendered client-side only (the
 * server has no reliable knowledge of the visitor's local time), so it
 * starts as a neutral "Welcome back" on first paint and swaps in the
 * time-aware greeting once mounted, avoiding a server/client mismatch.
 */
function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  if (hour >= 17 && hour < 21) return "Good Evening";
  return "Good Night";
}

export function DashboardGreeting({ name }: { name: string }) {
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  return (
    <p className="text-secondary-foreground">
      {greeting ?? "Welcome back"}, {name}.
    </p>
  );
}
