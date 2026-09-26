"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SEVERITY_LABELS, SEVERITY_VARIANT, type Severity } from "./severity";

interface CrawlRun {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  // Date on first render (RSC serialization), ISO string after a client poll (JSON) — not
  // rendered directly anywhere in this component, so the distinction doesn't matter here.
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  pagesDiscovered: number | null;
  pagesCrawled: number | null;
  errors: string[] | null;
  createdAt: Date | string;
}

interface CrawledPage {
  id: string;
  url: string;
  statusCode: number | null;
  contentType: string | null;
  title: string | null;
  wordCount: number | null;
  responseTime: number | null;
  pageSize: number | null;
  issueCount: number;
}

interface PageIssue {
  id: string;
  severity: Severity;
  title: string;
  description: string | null;
  evidence: string | null;
}

const ACTIVE_STATUSES = new Set(["pending", "running"]);

/**
 * Run lifecycle, NOT a verdict about the site: pending/cancelled are neutral
 * chrome and running is the interactive accent, so only completed/failed —
 * which really are outcomes — take a status variant (and with it an icon).
 */
const RUN_STATUS_VARIANT: Record<CrawlRun["status"], BadgeVariant> = {
  pending: "neutral",
  running: "accent",
  completed: "good",
  failed: "critical",
  cancelled: "unknown",
};

function StatusBadge({ status }: { status: CrawlRun["status"] }) {
  return (
    <Badge variant={RUN_STATUS_VARIANT[status]} className="capitalize">
      {status}
    </Badge>
  );
}

function IssuesRow({ pageId }: { pageId: string }) {
  const [issues, setIssues] = useState<PageIssue[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/pages/${pageId}/issues`)
      .then((res) => (res.ok ? res.json() : { issues: [] }))
      .then((data) => {
        if (!cancelled) setIssues(data.issues);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  return (
    <tr>
      <td colSpan={6} className="bg-surface-subtle px-3 py-3">
        {loading ? (
          <p className="text-sm text-muted">Loading issues...</p>
        ) : issues && issues.length > 0 ? (
          <ul className="space-y-2">
            {issues.map((issue) => (
              <li key={issue.id} className="text-sm">
                <Badge variant={SEVERITY_VARIANT[issue.severity]} className="mr-2">
                  {SEVERITY_LABELS[issue.severity]}
                </Badge>
                <span className="font-medium text-foreground">{issue.title}</span>
                {issue.evidence && <span className="text-muted"> — {issue.evidence}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No issues found on this page.</p>
        )}
      </td>
    </tr>
  );
}

export function CrawlPanel({ websiteId, initialRuns }: { websiteId: string; initialRuns: CrawlRun[] }) {
  const [runs, setRuns] = useState(initialRuns);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [pages, setPages] = useState<CrawledPage[] | null>(null);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const latest = runs[0] ?? null;
  const hasActiveRun = latest ? ACTIVE_STATUSES.has(latest.status) : false;

  const refreshRuns = useCallback(async () => {
    const res = await fetch(`/api/websites/${websiteId}/crawl-runs`);
    if (!res.ok) return;
    const data = await res.json();
    setRuns(data.crawlRuns);
  }, [websiteId]);

  useEffect(() => {
    if (hasActiveRun) {
      pollRef.current = setInterval(refreshRuns, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasActiveRun, refreshRuns]);

  const loadPages = useCallback(
    async (runId: string) => {
      setPagesLoading(true);
      try {
        const res = await fetch(`/api/websites/${websiteId}/crawl-runs/${runId}/pages`);
        if (!res.ok) return;
        const data = await res.json();
        setPages(data.pages);
      } finally {
        setPagesLoading(false);
      }
    },
    [websiteId]
  );

  useEffect(() => {
    if (latest?.status === "completed") {
      loadPages(latest.id);
    } else {
      setPages(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id, latest?.status]);

  async function handleStartCrawl() {
    setError("");
    setStarting(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}/crawl`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start the crawl.");
        return;
      }
      await refreshRuns();
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex items-center justify-between">
        <div>
          {latest ? (
            <div className="flex items-center gap-2 text-sm text-secondary-foreground">
              <StatusBadge status={latest.status} />
              {latest.status === "running" || latest.status === "pending" ? (
                <span>Crawling — {latest.pagesCrawled ?? 0} pages processed so far.</span>
              ) : latest.status === "completed" ? (
                <span>
                  {latest.pagesCrawled} of {latest.pagesDiscovered} discovered pages crawled.
                </span>
              ) : latest.status === "failed" ? (
                <span>The last crawl failed.</span>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">No audits yet.</p>
          )}
        </div>
        <Button onClick={handleStartCrawl} loading={starting} disabled={hasActiveRun}>
          {hasActiveRun ? "Crawl in progress..." : "Start crawl"}
        </Button>
      </div>

      {latest?.status === "failed" && latest.errors && latest.errors.length > 0 && (
        <Alert variant="error">{latest.errors[0]}</Alert>
      )}

      {latest?.status === "completed" && (
        <div>
          {pagesLoading ? (
            <p className="text-sm text-muted">Loading crawled pages...</p>
          ) : pages && pages.length > 0 ? (
            <div className="rounded-lg border border-default">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead numeric>Words</TableHead>
                    <TableHead numeric>Time</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((p) => (
                    <Fragment key={p.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-surface-hover"
                        onClick={() => setExpandedPageId(expandedPageId === p.id ? null : p.id)}
                      >
                        <TableCell className="max-w-xs truncate text-secondary-foreground" title={p.url}>
                          {p.url}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={p.statusCode && p.statusCode >= 200 && p.statusCode < 300 ? "good" : "critical"}
                          >
                            {p.statusCode ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="max-w-xs truncate text-secondary-foreground"
                          title={p.title ?? undefined}
                        >
                          {p.title ?? "—"}
                        </TableCell>
                        <TableCell numeric className="text-muted">
                          {p.wordCount ?? "—"}
                        </TableCell>
                        <TableCell numeric className="text-muted">
                          {p.responseTime != null ? `${p.responseTime}ms` : "—"}
                        </TableCell>
                        <TableCell>
                          {p.issueCount > 0 ? (
                            <Badge variant="warning">
                              {p.issueCount} issue{p.issueCount === 1 ? "" : "s"}
                            </Badge>
                          ) : (
                            <Badge variant="good">None</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                      {expandedPageId === p.id && <IssuesRow pageId={p.id} />}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted">No pages were crawled.</p>
          )}
          <p className="mt-3 text-xs text-muted">
            On-page issues shown here (title, meta description, headings, canonical, robots,
            social tags, alt text, anchors).
          </p>
        </div>
      )}
    </div>
  );
}
