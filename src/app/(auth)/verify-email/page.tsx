"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId") ?? "";

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResendMessage("");

    if (!userId) {
      setError("Missing account reference. Please register again.");
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError("Verification code must be 6 digits.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, otp }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Invalid verification code.");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!userId || cooldown > 0) return;
    setResendMessage("");
    setError("");
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setCooldown(data.retryAfterSeconds ?? 60);
        return;
      }
      setResendMessage("A new verification code has been sent.");
      setCooldown(60);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setResending(false);
    }
  }

  if (success) {
    return (
      <AuthCard title="Email verified">
        <Alert variant="success">Your email has been verified. Redirecting to login...</Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Verify your email" subtitle="Enter the 6-digit code we sent to your email address.">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {error && <Alert variant="error">{error}</Alert>}
        {resendMessage && <Alert variant="success">{resendMessage}</Alert>}

        <div>
          <label htmlFor="otp" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
            Verification code
          </label>
          <Input
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-2xl tracking-[0.5em]"
          />
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? "Verifying..." : "Verify"}
        </Button>

        <div className="text-center text-sm">
          {cooldown > 0 ? (
            <span className="text-muted">Resend code in {cooldown} seconds</span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="font-medium text-foreground underline disabled:opacity-50"
            >
              {resending ? "Sending..." : "Resend verification code"}
            </button>
          )}
        </div>

        <p className="text-center text-sm text-secondary-foreground">
          <Link href="/login" className="font-medium underline">
            Back to login
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
