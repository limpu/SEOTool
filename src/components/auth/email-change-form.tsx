"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Alert } from "@/components/ui/alert";

/**
 * Two-step email-change flow: request (new address + duplicate/uniqueness
 * check server-side, sends OTP to the NEW address) then confirm (OTP entry).
 * The account's active login email never changes until confirm succeeds —
 * see `src/app/api/account/email-change/{request,confirm}/route.ts`.
 */
export function EmailChangeForm({ currentEmail }: { currentEmail: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "pending">("idle");
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/email-change/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setPendingEmail(data.pendingEmail);
      setStep("pending");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/email-change/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
      // Email + credential surface changed; other sessions were revoked
      // server-side and the current session's email claim is now stale —
      // force a refresh so subsequent pages reflect the new email.
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Alert variant="success">
        Your email address has been changed successfully. Please use your new email to log in next time.
      </Alert>
    );
  }

  if (step === "pending") {
    return (
      <form onSubmit={handleConfirm} noValidate className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        <Alert variant="info">
          We sent a 6-digit code to <strong>{pendingEmail}</strong>. Your current email ({currentEmail})
          remains active until you confirm the code below.
        </Alert>
        <div>
          <label htmlFor="emailOtp" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
            Verification code
          </label>
          <Input
            id="emailOtp"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          />
          <FieldError id="emailOtp-error" message={undefined} />
        </div>
        <div className="flex gap-3">
          <Button type="submit" loading={submitting} disabled={otp.length !== 6}>
            {submitting ? "Verifying..." : "Confirm code"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setStep("idle");
              setOtp("");
              setError("");
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleRequest} noValidate className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      <div>
        <label htmlFor="newEmail" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          New email address
        </label>
        <Input
          id="newEmail"
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
      </div>
      <Button type="submit" loading={submitting}>
        {submitting ? "Sending code..." : "Send verification code"}
      </Button>
    </form>
  );
}
