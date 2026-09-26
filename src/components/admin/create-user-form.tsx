"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Alert } from "@/components/ui/alert";
import type { UserRoleSummary } from "@/lib/rbac/queries";

export function CreateUserForm({ roles }: { roles: UserRoleSummary[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, roleId: roleId || undefined }),
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

      router.push(`/admin/users/${data.user.id}`);
      router.refresh();
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Name
        </label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Email
        </label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <FieldError id="email-error" message={errors.email} />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Temporary password
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <FieldError id="password-error" message={errors.password} />
      </div>

      <div>
        <label htmlFor="roleId" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Role
        </label>
        <select
          id="roleId"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          className="w-full rounded-md border border-strong px-3 py-2.5 text-sm"
        >
          <option value="">Default (User)</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" className="w-full" loading={submitting}>
        {submitting ? "Creating..." : "Create user"}
      </Button>
    </form>
  );
}
