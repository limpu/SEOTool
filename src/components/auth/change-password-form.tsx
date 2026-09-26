"use client";

import { FormEvent, useState } from "react";
import { PasswordRequirements } from "@/components/auth/password-requirements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Alert } from "@/components/ui/alert";
import { isPasswordValid } from "@/lib/validation/auth";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!currentPassword) next.currentPassword = "Please enter your current password.";
    if (!isPasswordValid(newPassword)) next.newPassword = "Password does not meet all requirements.";
    if (confirmNewPassword !== newPassword) next.confirmNewPassword = "Passwords do not match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError("");
    setSuccess(false);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setServerError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {serverError && <Alert variant="error">{serverError}</Alert>}
      {success && (
        <Alert variant="success">
          Password changed successfully. For your security, other active sessions have been signed out.
        </Alert>
      )}

      <div>
        <label htmlFor="currentPassword" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Current password
        </label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          error={errors.currentPassword}
        />
        <FieldError id="currentPassword-error" message={errors.currentPassword} />
      </div>

      <div>
        <label htmlFor="newPassword" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          New password
        </label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={errors.newPassword}
        />
        <FieldError id="newPassword-error" message={errors.newPassword} />
        <PasswordRequirements password={newPassword} />
      </div>

      <div>
        <label htmlFor="confirmNewPassword" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Confirm new password
        </label>
        <Input
          id="confirmNewPassword"
          name="confirmNewPassword"
          type="password"
          autoComplete="new-password"
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          error={errors.confirmNewPassword}
        />
        <FieldError id="confirmNewPassword-error" message={errors.confirmNewPassword} />
      </div>

      <Button type="submit" loading={submitting}>
        {submitting ? "Changing password..." : "Change password"}
      </Button>
    </form>
  );
}
