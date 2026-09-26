import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { CopyButton } from "@/components/report/copy-button";
import { DeleteSiteFileButton } from "@/components/report/site-file-actions";
import type { SiteFileEntry } from "@/lib/site-files/queries";
import { SITE_FILE_TYPE_LABELS, isFetchable } from "@/lib/site-files/fetch";

/**
 * Phase 37 — ONE stored site-level file, rendered as status + link + (where
 * applicable) its actual contents.
 *
 * ─── XSS: how the file body is rendered, and why this way ───────────────────
 *
 * `entry.rawContent` is UNTRUSTED third-party content — whatever bytes some
 * other server chose to return. It is rendered as a plain JavaScript string
 * child of a `<pre>`, which React escapes on output. There is deliberately no
 * `dangerouslySetInnerHTML` anywhere in this component, no HTML parsing, no
 * syntax highlighter that re-injects markup, and no `innerHTML` assignment: a
 * `<script>` tag inside a fetched sitemap renders as the visible characters
 * `<script>` and can never execute. That is the entire defence, and it works
 * precisely because nothing here opts out of it.
 *
 * ─── Honest states ─────────────────────────────────────────────────────────
 *
 * Four different things are shown four different ways, never collapsed:
 *   • Found (2xx)              — with the body, where the type is fetchable.
 *   • Not found (measured)     — a real HTTP status, e.g. 404. A finding.
 *   • Could not be reached     — the fetcher's own verbatim reason (blocked
 *                                address, DNS failure, timeout, size cap).
 *   • Not fetched by design    — HTML sitemaps only, explained in words.
 *
 * "Never checked" is the ABSENCE of a row entirely, and is handled by the
 * calling page, not here.
 */

/** How much content renders before the viewer gets its own scrollbar. */
const VIEWER_MAX_HEIGHT = "max-h-96";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function StatusBadge({ entry }: { entry: SiteFileEntry }) {
  if (!isFetchable(entry.type)) {
    return <Badge variant="neutral">Link recorded</Badge>;
  }
  if (entry.found) {
    return <Badge variant="good">Found{entry.httpStatus !== null ? ` · HTTP ${entry.httpStatus}` : ""}</Badge>;
  }
  if (entry.httpStatus !== null) {
    return <Badge variant="warning">Not found · HTTP {entry.httpStatus}</Badge>;
  }
  return <Badge variant="unknown">Could not be reached</Badge>;
}

/**
 * The escaped, scrollable, copyable file viewer, collapsed behind a native
 * `<details>` disclosure — semantic, keyboard-operable and focusable without a
 * line of client JavaScript.
 */
function FileContentViewer({ entry }: { entry: SiteFileEntry }) {
  const content = entry.rawContent;
  if (content === null) return null;

  const lineCount = content.split("\n").length;

  return (
    <details className="mt-3 rounded-lg border border-default">
      <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        Show file
        <span className="ml-2 text-xs font-normal text-muted">
          {lineCount.toLocaleString("en-US")} line{lineCount === 1 ? "" : "s"}
          {entry.sizeBytes !== null ? ` · ${formatBytes(entry.sizeBytes)}` : ""}
        </span>
      </summary>
      <div className="border-t border-default p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs text-muted">
            Shown exactly as the server returned it. This is third-party content and is displayed as plain text only —
            nothing in it is interpreted or executed.
          </p>
          <CopyButton value={content} label="Copy file contents" />
        </div>
        {entry.truncated && (
          <p className="mb-2 text-xs font-semibold text-foreground">
            Only the first {formatBytes(256 * 1024)} is shown and stored
            {entry.sizeBytes !== null ? ` — the file is ${formatBytes(entry.sizeBytes)}` : ""}. Use the link above to
            read the whole file.
          </p>
        )}
        {/*
          React escapes `content` because it is passed as a string CHILD.
          Never replace this with dangerouslySetInnerHTML.
        */}
        <pre
          tabIndex={0}
          className={`${VIEWER_MAX_HEIGHT} overflow-auto rounded-md bg-surface-subtle p-3 font-mono text-xs leading-relaxed whitespace-pre text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
        >
          {content}
        </pre>
      </div>
    </details>
  );
}

export function SiteFileCard({
  websiteId,
  entry,
  /** Extra context lines rendered under the status row (e.g. a parsed llms.txt title). */
  extraFacts,
  /** Overrides the type label — llms.txt and llms-full.txt share one type but are different files. */
  label,
}: {
  websiteId: string;
  entry: SiteFileEntry;
  extraFacts?: { label: string; value: string }[];
  label?: string;
}) {
  const facts: { label: string; value: string }[] = [];

  if (entry.type === "sitemap_xml") {
    facts.push({
      label: "URLs listed",
      value: entry.urlCount === null ? "Not parsed" : entry.urlCount.toLocaleString("en-US"),
    });
    facts.push({
      label: "Sitemap index",
      value: entry.isIndex === null ? "Not parsed" : entry.isIndex ? "Yes — it points at other sitemaps" : "No",
    });
  }
  facts.push({
    label: "Recorded",
    value: entry.source === "manual" ? "Added by hand" : "Found by the crawler",
  });
  for (const fact of extraFacts ?? []) facts.push(fact);

  return (
    <li className="rounded-lg border border-default p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{label ?? SITE_FILE_TYPE_LABELS[entry.type]}</p>
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded-md font-mono text-xs break-all text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="min-w-0 break-all">{entry.url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge entry={entry} />
          {entry.source === "manual" && (
            <DeleteSiteFileButton websiteId={websiteId} entryId={entry.id} type={entry.type} url={entry.url} />
          )}
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.label} className="flex items-baseline justify-between gap-2 text-xs">
            <dt className="text-muted">{fact.label}</dt>
            <dd className="tabular text-right font-semibold text-foreground">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {entry.fetchError && (
        <p className="mt-2 text-xs text-secondary-foreground">
          <span className="font-semibold text-foreground">Why nothing was stored: </span>
          {entry.fetchError}
        </p>
      )}

      {!isFetchable(entry.type) && (
        <div className="mt-2">
          <Alert variant="info">
            <p className="text-xs">
              An HTML sitemap is a page written for people, not a machine-readable index — there is nothing in it for
              this platform to parse, so its contents are deliberately not downloaded. The status and the link above are
              the whole of what is recorded, by design.
            </p>
          </Alert>
        </div>
      )}

      {entry.truncated && entry.rawContent === null && (
        <p className="mt-2 text-xs text-secondary-foreground">
          This file is larger than the maximum this platform will download, so none of its contents were stored. Nothing
          partial is shown here, because a partial file that looked complete would be worse than none.
        </p>
      )}

      <FileContentViewer entry={entry} />
    </li>
  );
}
