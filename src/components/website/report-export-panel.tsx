"use client";

/**
 * Phase 30 — Reports UI. Simple download-trigger buttons (this platform's
 * existing button/alert conventions, same as `DeleteWebsiteButton`) rather
 * than a fetch-on-mount data panel — there's no report state to display
 * inline, only files to download. Each button fetches the export endpoint
 * client-side (so a real error, e.g. a transient 500, can be shown inline
 * instead of navigating away to a raw error page) and saves the response
 * via a synthetic anchor click, reading the filename from the server's own
 * `Content-Disposition` header rather than guessing it client-side.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Format = "json" | "html" | "csv-issues" | "csv-scores" | "csv-keywords";

const FORMAT_LABELS: Record<Format, string> = {
  json: "JSON",
  html: "HTML report",
  "csv-issues": "CSV — Issues",
  "csv-scores": "CSV — Score history",
  "csv-keywords": "CSV — Keywords",
};

function buildUrl(websiteId: string, format: Format): string {
  if (format === "json" || format === "html") {
    return `/api/websites/${websiteId}/reports?format=${format}`;
  }
  const csvType = format.replace("csv-", "");
  return `/api/websites/${websiteId}/reports?format=csv&csv=${csvType}`;
}

export function ReportExportPanel({ websiteId }: { websiteId: string }) {
  const [downloading, setDownloading] = useState<Format | null>(null);
  const [error, setError] = useState("");

  async function handleDownload(format: Format) {
    setError("");
    setDownloading(format);
    try {
      const res = await fetch(buildUrl(websiteId, format));
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not generate this report.");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `report.${format === "html" ? "html" : format === "json" ? "json" : "csv"}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not generate this report — please try again.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Export the full audit — scores, recommendations, AI Search readiness, E-E-A-T, PageSpeed, GSC, tracked
        keywords, and competitor comparison, each honestly labeled by source (deterministic vs. AI-inferred, or
        &quot;not available&quot; when a data source hasn&apos;t been connected/run yet).
      </p>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(FORMAT_LABELS) as Format[]).map((format) => (
          <Button
            key={format}
            variant="secondary"
            onClick={() => handleDownload(format)}
            loading={downloading === format}
            disabled={downloading !== null && downloading !== format}
          >
            {FORMAT_LABELS[format]}
          </Button>
        ))}
      </div>
    </div>
  );
}
