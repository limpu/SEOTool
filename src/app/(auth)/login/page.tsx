"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Alert } from "@/components/ui/alert";

// `useSearchParams` (needed for Stage 5's `?deleted=true` one-time message)
// requires a Suspense boundary around any component that calls it, or the
// production build's static prerender of this page fails. The form itself
// carries no state that needs to survive a Suspense fallback flash, so a
// thin wrapper is the simplest fix — no new routing/behavior otherwise.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Stage 5 — self-service account deletion clears the session cookie
  // server-side before redirecting here, so there's no session left for
  // any page to read a "your account was deleted" message from. A
  // lightweight query-param-driven one-time message is the simplest
  // honest way to surface that confirmation, matching this codebase's
  // "real, not fabricated, feedback" standard without adding new
  // persistence for a message that's only ever shown once.
  const deleted = searchParams.get("deleted") === "true";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [unverified, setUnverified] = useState<{ userId: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!email.trim()) next.email = "Please enter your email address.";
    if (!password) next.password = "Please enter your password.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError("");
    setUnverified(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "EMAIL_NOT_VERIFIED") {
          setUnverified({ userId: data.userId });
          return;
        }
        setServerError(data.error ?? "Invalid email or password.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (unverified) {
    return (
      <AuthCard title="Email verification required" subtitle="Please verify your email before continuing.">
        <div className="space-y-4">
          <Alert variant="warning">Your account has not been verified yet.</Alert>
          <Link href={`/verify-email?userId=${unverified.userId}`}>
            <Button className="w-full">Verify Email</Button>
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Log in" subtitle="Welcome back. Enter your details to continue.">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {deleted && !serverError && (
          <Alert variant="success">Your account has been permanently deleted.</Alert>
        )}
        {serverError && <Alert variant="error">{serverError}</Alert>}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          <FieldError id="email-error" message={errors.email} />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-secondary-foreground">
              Password
            </label>
            <Link href="/forgot-password" className="text-sm font-medium text-secondary-foreground underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <FieldError id="password-error" message={errors.password} />
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? "Signing in..." : "Log in"}
        </Button>

        <p className="text-center text-sm text-secondary-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-foreground underline">
            Create one
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
