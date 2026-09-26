"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SERP_FEATURE_LABELS, SERP_FEATURE_OPTIONS, type SerpFeature } from "@/lib/serp/constants";

/**
 * Stage 3B — the WRITE actions carried over from the retired `SerpPanel`.
 *
 * Keywords is a far more interactive module than the read-only issue reports:
 * the panel it replaces owned four real mutations, and every one of them
 * survives here as a thin `"use client"` leaf against the SAME API routes
 * (`POST/DELETE /api/websites/[id]/keywords`, `POST/DELETE …/checks`). The
 * pages that host them stay Server Components.
 *
 * The pattern is the one `RunPageSpeedButton` established in Stage 3A: call
 * the existing endpoint, then `router.refresh()` so the SERVER re-renders the
 * numbers. No component here holds a second copy of the data, so the list can
 * never drift out of sync with what the database actually says.
 *
 * Failure is always stated. A rejected write shows the API's own message; it
 * never silently no-ops and never optimistically shows a row that was not
 * saved.
 */

function useRefresh() {
  const router = useRouter();
  return () => router.refresh();
}

export function AddKeywordForm({ websiteId }: { websiteId: string }) {
  const refresh = useRefresh();
  const [keyword, setKeyword] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [country, setCountry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!keyword.trim()) {
      setError("Please enter a keyword.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}/keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          targetUrl: targetUrl || undefined,
          country: country || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to add keyword.");
      setKeyword("");
      setTargetUrl("");
      setCountry("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add keyword.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="kw-keyword" className="mb-1 block text-xs font-medium text-secondary-foreground">
            Keyword
          </label>
          <Input
            id="kw-keyword"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="e.g. best hiking boots"
          />
        </div>
        <div>
          <label htmlFor="kw-target" className="mb-1 block text-xs font-medium text-secondary-foreground">
            Target URL (optional)
          </label>
          <Input
            id="kw-target"
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            placeholder="https://example.com/page"
          />
        </div>
        <div>
          <label htmlFor="kw-country" className="mb-1 block text-xs font-medium text-secondary-foreground">
            Country (optional)
          </label>
          <Input
            id="kw-country"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            maxLength={10}
            placeholder="US"
          />
        </div>
      </div>
      <Button type="submit" variant="primary" loading={submitting}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {submitting ? "Adding…" : "Add keyword"}
      </Button>
    </form>
  );
}

export function DeleteKeywordButton({
  websiteId,
  keywordId,
  keyword,
  redirectTo,
}: {
  websiteId: string;
  keywordId: string;
  keyword: string;
  /** Where to go after a successful delete — the detail page cannot stay on itself. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Remove "${keyword}" and all of its rank-check history?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}/keywords/${keywordId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove keyword.");
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove keyword.");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" onClick={remove} loading={busy}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Remove
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

export function LogRankCheckForm({ websiteId, keywordId }: { websiteId: string; keywordId: string }) {
  const refresh = useRefresh();
  const [checkedDate, setCheckedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [position, setPosition] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [features, setFeatures] = useState<Set<SerpFeature>>(new Set());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleFeature(feature: SerpFeature) {
    setFeatures((previous) => {
      const next = new Set(previous);
      if (next.has(feature)) next.delete(feature);
      else next.add(feature);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!checkedDate) {
      setError("Please choose a date.");
      return;
    }
    const parsedPosition = notFound ? null : position ? Number(position) : null;
    if (!notFound && position && (!Number.isInteger(parsedPosition) || (parsedPosition ?? 0) < 1)) {
      setError("Position must be a whole number of 1 or greater.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}/keywords/${keywordId}/checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkedDate,
          position: parsedPosition,
          serpFeatures: Array.from(features),
          notes: notes || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to log rank check.");
      setPosition("");
      setNotFound(false);
      setFeatures(new Set());
      setNotes("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log rank check.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="rc-date" className="mb-1 block text-xs font-medium text-secondary-foreground">
            Date checked
          </label>
          <Input id="rc-date" type="date" value={checkedDate} onChange={(event) => setCheckedDate(event.target.value)} />
        </div>
        <div>
          <label htmlFor="rc-position" className="mb-1 block text-xs font-medium text-secondary-foreground">
            Position <span className="font-normal text-muted">(1 = best)</span>
          </label>
          <Input
            id="rc-position"
            type="number"
            min={1}
            max={200}
            value={position}
            disabled={notFound}
            onChange={(event) => setPosition(event.target.value)}
            placeholder="e.g. 7"
          />
        </div>
        <div className="flex items-end pb-2.5">
          {/* "Not found" is stored as a NULL position, never as 0 or 100 — an
              absence must not become a fabricated measurement. */}
          <label className="flex items-center gap-2 text-sm text-secondary-foreground">
            <input
              type="checkbox"
              checked={notFound}
              onChange={(event) => {
                setNotFound(event.target.checked);
                if (event.target.checked) setPosition("");
              }}
            />
            Not found in the results I checked
          </label>
        </div>
      </div>

      <fieldset>
        <legend className="mb-1 text-xs font-medium text-secondary-foreground">
          SERP features observed (optional)
        </legend>
        <div className="flex flex-wrap gap-2">
          {SERP_FEATURE_OPTIONS.map((feature) => (
            <label
              key={feature}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring ${
                features.has(feature)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-strong text-secondary-foreground hover:bg-surface-hover"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={features.has(feature)}
                onChange={() => toggleFeature(feature)}
              />
              {SERP_FEATURE_LABELS[feature]}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="rc-notes" className="mb-1 block text-xs font-medium text-secondary-foreground">
          Notes (optional)
        </label>
        <textarea
          id="rc-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          className="w-full rounded-md border border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
          placeholder="e.g. checked manually via incognito Google search"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" loading={submitting}>
          {submitting ? "Saving…" : "Log rank check"}
        </Button>
        <Badge variant="neutral">Saved as &ldquo;Manual entry&rdquo;</Badge>
      </div>
    </form>
  );
}

export function DeleteRankCheckButton({
  websiteId,
  keywordId,
  checkId,
  label,
}: {
  websiteId: string;
  keywordId: string;
  checkId: string;
  label: string;
}) {
  const refresh = useRefresh();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Delete the rank check logged on ${label}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}/keywords/${keywordId}/checks/${checkId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete rank check.");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rank check.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-default text-secondary-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:text-muted"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Delete the rank check logged on {label}</span>
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
