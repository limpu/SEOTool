"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";

/**
 * Stage 5 — real in-app confirmation modal for self-service account
 * deletion (not `window.confirm()`). The dialog shell (backdrop, Escape,
 * scroll lock, focus trap/restore, `role="dialog"` wiring) now comes from the
 * shared `Modal` primitive; what stays here is only this flow's own content
 * and its submit logic. The delete button stays disabled until a non-empty
 * password is entered, and the actual guard (correct password, not-the-last-
 * SUPER_ADMIN) is enforced server-side by `DELETE /api/account` regardless of
 * this client-side gate.
 */
export function DeleteAccountModal() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (submitting) return;
    setOpen(false);
    setPassword("");
    setError(null);
  }

  async function handleDelete() {
    if (!password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Failed to delete account.");
        setSubmitting(false);
        return;
      }
      // Session cookie is already cleared server-side. Redirect to a
      // logged-out page with a one-time confirmation message via query
      // param, since there's no session left to read anything from.
      window.location.href = "/login?deleted=true";
    } catch {
      setError("Failed to delete account. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete my account
      </Button>

      <Modal
        open={open}
        onClose={close}
        tone="destructive"
        labelledBy="delete-account-modal-title"
        title="Delete your account permanently?"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={submitting} disabled={!password}>
              Permanently delete my account
            </Button>
          </>
        }
      >
        <p className="mt-2 text-sm font-medium text-foreground">
          This action is PERMANENT and IRREVERSIBLE. It cannot be undone.
        </p>
        <p className="mt-2 text-sm text-secondary-foreground">You will immediately and permanently lose:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-secondary-foreground">
          <li>Your account and login access</li>
          <li>All of your websites and their settings</li>
          <li>All crawl history, pages, and SEO issue data</li>
          <li>All AI Visibility (GEO/AEO/AIO) results</li>
          <li>All connected Google Search Console and Google Analytics integrations</li>
          <li>All tracked keywords and rank-check history</li>
          <li>Any pending package upgrade requests</li>
        </ul>

        {error && (
          <div className="mt-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        <div className="mt-4">
          <label htmlFor="delete-account-password" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
            Enter your current password to confirm
          </label>
          <Input
            id="delete-account-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
        </div>
      </Modal>
    </>
  );
}
