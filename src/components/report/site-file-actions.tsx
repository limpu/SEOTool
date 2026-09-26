"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SiteFileType } from "@/lib/site-files/fetch";

/**
 * Phase 37 — the two thin `"use client"` leaves for site-file management.
 *
 * Everything else on these report pages stays a Server Component: the stored
 * files are read from the database during the server render, and NOTHING is
 * fetched from a third party when a page loads. These two components exist
 * only because adding and removing an entry are user-initiated mutations.
 *
 * Both call the same guarded API routes and then `router.refresh()`, so the
 * updated row is re-read from the database by the server rather than being
 * mirrored into a second client-side copy that could drift.
 */

/** Only the types a user can pick, with the label shown in the selector. */
const TYPE_OPTIONS: { value: SiteFileType; label: string }[] = [
  { value: "sitemap_xml", label: "XML sitemap" },
  { value: "sitemap_html", label: "HTML sitemap (link only — not downloaded)" },
  { value: "robots_txt", label: "robots.txt" },
  { value: "llms_txt", label: "llms.txt" },
];

export function AddSiteFileForm({
  websiteId,
  /** Restricts the selector when a page only owns some of the types. */
  allowedTypes,
  defaultType,
}: {
  websiteId: string;
  allowedTypes?: SiteFileType[];
  defaultType?: SiteFileType;
}) {
  const router = useRouter();
  const fieldId = useId();
  const options = allowedTypes ? TYPE_OPTIONS.filter((o) => allowedTypes.includes(o.value)) : TYPE_OPTIONS;

  const [type, setType] = useState<SiteFileType>(defaultType ?? options[0].value);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}/site-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, url }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not add this file.");
      setUrl("");
      // The server's own verdict, verbatim — a file that was added but could
      // not be reached is reported as exactly that, never as a plain success.
      setNotice(
        typeof body.fetchError === "string" && body.fetchError
          ? `Added, but the file could not be read: ${body.fetchError}`
          : "Added."
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this file.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant={notice === "Added." ? "success" : "warning"}>{notice}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${fieldId}-type`} className="mb-1 block text-xs font-medium text-secondary-foreground">
            File type
          </label>
          <select
            id={`${fieldId}-type`}
            value={type}
            onChange={(event) => setType(event.target.value as SiteFileType)}
            className="w-full rounded-md border border-strong bg-surface px-3 py-2.5 text-sm text-foreground focus:border-transparent focus:ring-2 focus:ring-ring focus:outline-none"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-url`} className="mb-1 block text-xs font-medium text-secondary-foreground">
            File URL
          </label>
          <Input
            id={`${fieldId}-url`}
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/sitemap.xml"
          />
        </div>
      </div>
      <Button type="submit" variant="primary" loading={submitting}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {submitting ? "Adding…" : "Add file"}
      </Button>
    </form>
  );
}

export function DeleteSiteFileButton({
  websiteId,
  entryId,
  type,
  url,
}: {
  websiteId: string;
  entryId: string;
  type: SiteFileType;
  url: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Remove the manually-added entry for ${url}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/websites/${websiteId}/site-files/${entryId}?type=${encodeURIComponent(type)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not remove this entry.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this entry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-default text-secondary-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Remove this manually-added entry</span>
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
