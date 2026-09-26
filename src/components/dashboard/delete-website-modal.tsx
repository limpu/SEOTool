"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";

/**
 * Real in-app confirmation modal for deleting a website (not
 * `window.confirm()`). Deletion is permanent and cascades (crawls, issues,
 * scores, GSC/GA4 connections, competitors, keywords) via the existing
 * `DELETE /api/websites/[id]` route's FK cascades — this component only adds
 * an honest warning + confirmation step in front of that already-correct,
 * already-ownership-checked route.
 *
 * The dialog shell comes from the shared `Modal` primitive; only the trigger
 * and this flow's own copy/submit logic live here.
 */
export function DeleteWebsiteModal({
  websiteId,
  websiteName,
  icon,
}: {
  websiteId: string;
  websiteName: string;
  /** Optional icon to render as the trigger instead of the default "Delete" text link. */
  icon?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (submitting) return;
    setOpen(false);
    setError(null);
  }

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not delete this website.");
        setSubmitting(false);
        return;
      }
      router.refresh();
      setOpen(false);
    } catch {
      setError("Could not delete this website. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Delete"
        aria-label={`Delete ${websiteName}`}
        className={
          icon
            ? "rounded-md p-1.5 text-destructive hover:bg-destructive-subtle hover:text-destructive-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            : "rounded-sm text-xs font-medium text-destructive underline underline-offset-2 hover:text-destructive-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        }
      >
        {icon ?? "Delete"}
      </button>

      <Modal
        open={open}
        onClose={close}
        tone="destructive"
        labelledBy="delete-website-modal-title"
        title={<>Delete &ldquo;{websiteName}&rdquo;?</>}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={submitting}>
              Permanently delete this website
            </Button>
          </>
        }
      >
        <p className="mt-2 text-sm font-medium text-foreground">
          This action is PERMANENT and IRREVERSIBLE. It cannot be undone.
        </p>
        <p className="mt-2 text-sm text-secondary-foreground">You will immediately and permanently lose:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-secondary-foreground">
          <li>This website and all its settings</li>
          <li>All crawl history, pages, and SEO issue data</li>
          <li>All scores, recommendations, and AI Visibility results</li>
          <li>Any connected Google Search Console / Google Analytics data</li>
          <li>Any tracked competitors and keywords for this website</li>
        </ul>

        {error && (
          <div className="mt-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}
      </Modal>
    </>
  );
}
