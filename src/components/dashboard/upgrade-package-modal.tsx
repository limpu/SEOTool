"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";

export interface UpgradePackageOption {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billingPeriod: "monthly" | "yearly" | "one_time";
}

/**
 * Real in-app modal (not `window.confirm`) for submitting a package upgrade
 * REQUEST — writes a `pending` row via `POST /api/account/upgrade-requests`.
 * No payment is collected or processed anywhere in this component.
 *
 * The dialog shell comes from the shared `Modal` primitive. This modal is
 * non-destructive, so (unlike the two delete dialogs) closing is never
 * blocked while submitting — preserving the original behaviour exactly.
 */
export function UpgradePackageModal({
  currentPackageName,
  options,
}: {
  currentPackageName: string;
  options: UpgradePackageOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(options[0]?.id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/upgrade-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedPackageId: selectedId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Failed to submit request.");
        return;
      }
      setSuccess(true);
      router.refresh();
    } catch {
      setError("Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const showOptions = !success && options.length > 0;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Update
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="upgrade-modal-title"
        title="Request a package change"
        footer={
          success ? (
            <Button onClick={() => setOpen(false)}>Close</Button>
          ) : showOptions ? (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} loading={submitting} disabled={!selectedId}>
                Submit request
              </Button>
            </>
          ) : undefined
        }
      >
        <p className="mt-1 text-sm text-muted">
          Current package: <span className="font-medium text-secondary-foreground">{currentPackageName}</span>. This
          submits a request for review — no payment is collected here.
        </p>

        {success ? (
          <div className="mt-4">
            <Alert variant="success">Request submitted. An admin will review it shortly.</Alert>
          </div>
        ) : options.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No other active packages are currently available.</p>
        ) : (
          <>
            <div className="mt-4 space-y-2">
              {options.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
                    selectedId === opt.id ? "border-primary bg-surface-subtle" : "border-default"
                  }`}
                >
                  <input
                    type="radio"
                    name="package"
                    className="mt-1 accent-[var(--accent)]"
                    checked={selectedId === opt.id}
                    onChange={() => setSelectedId(opt.id)}
                  />
                  <span>
                    <span className="block font-medium text-foreground">{opt.name}</span>
                    {opt.description && <span className="block text-secondary-foreground">{opt.description}</span>}
                    <span className="block text-muted">
                      {opt.price > 0 ? `${opt.currency} ${opt.price}/${opt.billingPeriod}` : "Free"}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </>
        )}
      </Modal>
    </>
  );
}
