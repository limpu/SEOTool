"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Alert } from "@/components/ui/alert";

export interface ProfileFormValues {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  addressCountry: string;
}

export function ProfileForm({ initial }: { initial: ProfileFormValues }) {
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof ProfileFormValues>(key: K, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError("");
    setSuccess(false);
    setErrors({});

    setSubmitting(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();

      if (!res.ok) {
        setServerError(data.error ?? "Something went wrong. Please try again.");
        if (data.fieldErrors) {
          const next: Record<string, string> = {};
          for (const [k, v] of Object.entries(data.fieldErrors as Record<string, string[]>)) {
            if (v?.[0]) next[k] = v[0];
          }
          setErrors(next);
        }
        return;
      }

      setSuccess(true);
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {serverError && <Alert variant="error">{serverError}</Alert>}
      {success && <Alert variant="success">Profile updated successfully.</Alert>}

      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Name
        </label>
        <Input
          id="name"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          error={errors.name}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Phone
        </label>
        <Input
          id="phone"
          placeholder="+15551234567"
          value={values.phone}
          onChange={(e) => set("phone", e.target.value)}
          error={errors.phone}
        />
        <FieldError id="phone-error" message={errors.phone} />
      </div>

      <div className="border-t border-default pt-5">
        <p className="mb-3 text-sm font-medium text-secondary-foreground">
          Address <span className="font-normal text-muted">(can be used as your billing address)</span>
        </p>
        <div className="space-y-3">
          <div>
            <label htmlFor="addressLine1" className="mb-1.5 block text-xs text-muted">
              Address line 1
            </label>
            <Input
              id="addressLine1"
              value={values.addressLine1}
              onChange={(e) => set("addressLine1", e.target.value)}
              error={errors.addressLine1}
            />
            <FieldError id="addressLine1-error" message={errors.addressLine1} />
          </div>
          <div>
            <label htmlFor="addressLine2" className="mb-1.5 block text-xs text-muted">
              Address line 2 (optional)
            </label>
            <Input
              id="addressLine2"
              value={values.addressLine2}
              onChange={(e) => set("addressLine2", e.target.value)}
              error={errors.addressLine2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="city" className="mb-1.5 block text-xs text-muted">
                City
              </label>
              <Input id="city" value={values.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <label htmlFor="state" className="mb-1.5 block text-xs text-muted">
                State / Region
              </label>
              <Input id="state" value={values.state} onChange={(e) => set("state", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="postalCode" className="mb-1.5 block text-xs text-muted">
                Postal code
              </label>
              <Input
                id="postalCode"
                value={values.postalCode}
                onChange={(e) => set("postalCode", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="addressCountry" className="mb-1.5 block text-xs text-muted">
                Country (2-letter code)
              </label>
              <Input
                id="addressCountry"
                placeholder="US"
                maxLength={2}
                value={values.addressCountry}
                onChange={(e) => set("addressCountry", e.target.value)}
                error={errors.addressCountry}
              />
              <FieldError id="addressCountry-error" message={errors.addressCountry} />
            </div>
          </div>
        </div>
      </div>

      <Button type="submit" loading={submitting}>
        {submitting ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
