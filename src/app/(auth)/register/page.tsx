"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { PasswordRequirements } from "@/components/auth/password-requirements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Alert } from "@/components/ui/alert";
import { isPasswordValid } from "@/lib/validation/auth";

type EmailAvailability = "idle" | "checking" | "available" | "taken" | "invalid";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailAvailability>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!email || !emailFormatValid) {
      setEmailStatus(email ? "invalid" : "idle");
      return;
    }

    setEmailStatus("checking");
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/auth/check-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (res.ok) {
          setEmailStatus(data.available ? "available" : "taken");
        } else {
          setEmailStatus("idle");
        }
      } catch {
        setEmailStatus("idle");
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email, emailFormatValid]);

  const passwordsMatch = confirmPassword.length === 0 || password === confirmPassword;

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Please enter your name.";
    if (!email.trim()) next.email = "Please enter your email address.";
    else if (!emailFormatValid) next.email = "Please enter a valid email address.";
    if (!isPasswordValid(password)) next.password = "Password does not meet all requirements.";
    if (confirmPassword !== password) next.confirmPassword = "Passwords do not match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;
    if (emailStatus === "taken") {
      setErrors((prev) => ({ ...prev, email: "An account with this email already exists." }));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(data.fieldErrors)) {
            if (Array.isArray(msgs) && msgs[0]) flat[key] = msgs[0] as string;
          }
          setErrors(flat);
        }
        setServerError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      router.push(`/verify-email?userId=${data.userId}`);
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Create your account" subtitle="Start auditing your website's SEO for free.">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {serverError && <Alert variant="error">{serverError}</Alert>}

        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
            Name
          </label>
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />
          <FieldError id="name-error" message={errors.name} />
        </div>

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
          {!errors.email && emailStatus === "checking" && (
            <p className="mt-1.5 text-sm text-muted">Checking availability...</p>
          )}
          {!errors.email && emailStatus === "available" && (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-status-good">
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              Email is available
            </p>
          )}
          {!errors.email && emailStatus === "taken" && (
            <p className="mt-1.5 flex items-start gap-1.5 text-sm text-destructive">
              <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                An account with this email already exists.{" "}
                <Link href="/login" className="font-medium underline">
                  Try logging in instead.
                </Link>
              </span>
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <FieldError id="password-error" message={errors.password} />
          <PasswordRequirements password={password} />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
            Confirm Password
          </label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword ?? (!passwordsMatch ? "Passwords do not match." : undefined)}
          />
          <FieldError
            id="confirmPassword-error"
            message={errors.confirmPassword ?? (!passwordsMatch ? "Passwords do not match." : undefined)}
          />
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? "Creating account..." : "Create account"}
        </Button>

        <p className="text-center text-sm text-secondary-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
