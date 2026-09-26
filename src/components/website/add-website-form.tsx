"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Alert } from "@/components/ui/alert";

export function AddWebsiteForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [country, setCountry] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Please enter a website name.";
    if (!url.trim()) {
      next.url = "Please enter a website URL.";
    } else {
      try {
        const parsed = new URL(url.trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          next.url = "Please enter a valid http:// or https:// URL.";
        }
      } catch {
        next.url = "Please enter a valid http:// or https:// URL.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/websites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, country: country || undefined }),
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

      // POST /api/websites already sets active_website_id to the new site
      // (see src/app/api/websites/route.ts) — land directly on its
      // Workspace Overview, not the websites list, so "Add Website" flows
      // straight into "Website Workspace" per the new IA.
      router.push(`/websites/${data.website.id}/overview`);
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
          Website name
        </label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="My Company Site"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div>
        <label htmlFor="url" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Website URL
        </label>
        <Input
          id="url"
          name="url"
          type="text"
          inputMode="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          error={errors.url}
        />
        <FieldError id="url-error" message={errors.url} />
      </div>

      <div>
        <label htmlFor="country" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Country code <span className="font-normal text-muted">(optional)</span>
        </label>
        <Input
          id="country"
          name="country"
          type="text"
          maxLength={10}
          placeholder="US"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" loading={submitting}>
        {submitting ? "Adding website..." : "Add website"}
      </Button>
    </form>
  );
}
